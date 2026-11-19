"""Hybrid RAG knowledge base: BM25 + local dense embeddings (fastembed, BAAI/bge-small-en-v1.5),
reciprocal-rank fusion, metadata filters. Index persisted under backend/var/index/.

Chunk = {id, text, source_type, source_id, title, assets[], group, page, doc_id}
source_type: symptom | procedure | procedure_steps | failure | manual | ir_format | upload
"""
from __future__ import annotations

import hashlib
import io
import json
import re
import threading
import time
import uuid
from pathlib import Path

import numpy as np
from rank_bm25 import BM25Okapi

from .config import EMBED_MODEL, INDEX_DIR, IR_FORMAT_PDF, MANUAL_PDF, UPLOAD_DIR, VAR_DIR
from .data import DATA, expand_targets

CORPUS_VERSION = "v4"  # bump to force a rebuild when chunking changes
DOCS_FILE = INDEX_DIR / "docs.json"

# --------------------------------------------------------------------------- tokenisation
_STOP = set("a an the and or of to in on for is are was were be been it its this that with at by from as not no do does "
            "did has have had i we you he she they my our your there their what which who when where how why can will "
            "just so very too also than then".split())


def _stem(w: str) -> str:
    for suf in ("ing", "ed", "es", "s", "ly"):
        if len(w) > len(suf) + 3 and w.endswith(suf):
            return w[: -len(suf)]
    return w


def tokenize(text: str) -> list[str]:
    toks = re.findall(r"[a-z]{1,3}-\d{2,3}[a-z]?|[a-z0-9]+", text.lower())
    return [_stem(t) for t in toks if t not in _STOP]


# --------------------------------------------------------------------------- corpus builders
GROUP_ASSETS = {
    "pump": ["P-101A", "P-101B", "P-201A", "P-201B", "SP-P01", "SP-P02"],
    "transfer pump": ["P-101A", "P-101B", "SP-P01"],
    "submersible": ["P-201A", "P-201B", "SP-P02"],
    "sump": ["P-201A", "P-201B", "SP-P02"],
    "motor": ["M-101A", "M-101B", "SP-M01", "VM-101A", "VM-101B", "SP-VM01", "P-201A", "P-201B"],
    "vibrator motor": ["VM-101A", "VM-101B", "SP-VM01"],
    "screen": ["SC-101A", "SC-101B", "VM-101A", "VM-101B"],
    "panel": [],
}


def assets_from_text(text: str) -> list[str]:
    ids: set[str] = set()
    for tok in re.findall(r"\b(?:[A-Z]{1,2}-\d{3}[A-Z](?:/[A-Z])?|SP-[A-Z]+\d{2})\b", text or ""):
        ids.update(expand_targets(tok))
    low = (text or "").lower()
    for k, v in GROUP_ASSETS.items():
        if re.search(rf"\b{k}s?\b", low):
            ids.update(v)
    if "all" in low and ("pump" in low or "tracked" in low):
        ids.update(DATA.asset.keys())
    return sorted(i for i in ids if i in DATA.asset)


def _chunk(text: str, size: int = 1100, overlap: int = 150) -> list[str]:
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= size:
        return [text] if text else []
    out, i = [], 0
    while i < len(text):
        j = min(len(text), i + size)
        if j < len(text):
            k = text.rfind(". ", i + size // 2, j)
            j = k + 1 if k > 0 else j
        out.append(text[i:j].strip())
        if j >= len(text):
            break
        i = max(j - overlap, i + 1)
    return out


# Technician vocabulary per symptom (domain glossary: slang, panel labels, Taglish-free plain words).
SYMPTOM_ALIASES = {
    "SY-01": "shaking, wobbling, jumping on the base, vibrating a lot, vib alarm, vibration trip, rough running",
    "SY-02": "grinding, rubbing, knocking, squealing, screeching, rattling, metallic noise, noisy, loud",
    "SY-03": "leaking, dripping, drips, puddle under the pump, water on the floor, shaft leak, seal reservoir / oil cup level dropping",
    "SY-04": "seal fault light, seal alarm, moisture sensor, water in oil, milky oil, submersible seal",
    "SY-05": "weak flow, no water, not pumping, low discharge pressure, level not going down, sump not dropping, low m3/h, cubic",
    "SY-06": "won't start, will not run, does not start, hums but no rotation, locked, seized, stuck, standby failed to start",
    "SY-07": "overload, OL light, thermal relay tripped, breaker tripped, keeps tripping, trips on start, high current",
    "SY-08": "hot, overheating, temperature high, smells hot, bearing hot, too hot to touch",
    "SY-09": "burning smell, smoke, sparks, flash, arcing, fire at motor or panel",
    "SY-10": "earth fault, ground fault, earth leakage, ELCB / RCD tripped, insulation low, cable cut or damaged",
    "SY-11": "cavitation, crackling, gravel or stones sound, pressure fluctuating, low suction, EQ level low",
    "SY-12": "backflow, reverse rotation, turns backwards, check valve banging or slamming, water flowing back",
    "SY-13": "screen blinded, mesh full of fat or cream or oil, water going over the screen, overflowing screen",
    "SY-14": "mesh torn, hole in mesh, mesh broken, solids passing to EQ tank",
    "SY-15": "high level, sump overflowing, EQ tank full, level alarm high",
    "SY-16": "both pumps down, no pump running, pair unavailable, duty tripped and standby won't start",
}


def build_structured() -> list[dict]:
    chunks: list[dict] = []
    qs_by_sym: dict[str, list] = {}
    for q in DATA.questions.values():
        qs_by_sym.setdefault(q["symptom_id"], []).append(q)
    for s in DATA.symptoms.values():
        sid = s["symptom_id"]
        qtxt = " ".join(q["question"] for q in qs_by_sym.get(sid, []))
        base = {"source_type": "symptom", "source_id": sid, "title": s["symptom"],
                "assets": assets_from_text(s["equipment_group"]), "group": s["equipment_group"]}
        chunks.append({**base, "id": f"sym:{sid}", "text": f"{s['symptom']} ({s['equipment_group']}): {SYMPTOM_ALIASES.get(sid, '')}"})
        chunks.append({**base, "id": f"sym:{sid}:detail", "text": (
            f"Symptom {sid}: {s['symptom']}. Typical causes: {s['typical_causes']}. First check: {s['first_check']}. "
            f"First procedure: {s['first_procedure']}. Escalate if: {s['escalate_if']}. Diagnostic questions: {qtxt}")})
    for pid, p in DATA.procedures.items():
        kp = " ".join(f"{k['point_type']}: {k['text']}" for k in DATA.key_points.get(pid, []))
        figs = " ".join(f"{f['figure_id']} {f['title']}. {f.get('caption') or ''}" for f in DATA.figures.get(pid, []))
        assets = assets_from_text(p["equipment"])
        head = (f"Procedure {pid} – {p['title']} ({p['category']}). Equipment: {p['equipment']}. Purpose: {p['purpose']}. "
                f"When used: {p['when_used']}. Prerequisites: {p.get('prerequisites') or 'none'}. PPE: {p['ppe']}. "
                f"Tools: {p['tools']}. Permits: {p['permits']}. Parts: {p.get('parts')}. {kp} {figs}")
        chunks.append({"id": f"proc:{pid}", "text": head, "source_type": "procedure", "source_id": pid, "title": f"{pid} {p['title']}",
                       "assets": assets, "group": p["equipment"]})
        steps = DATA.steps.get(pid, [])
        for i in range(0, len(steps), 6):
            part = steps[i:i + 6]
            body = " ".join(f"Step {s['step_no']} ({s['phase']}): {s['instruction']}. Accept: {s.get('acceptance_criteria') or '-'}."
                            + (f" Safety: {s['safety_note']}." if s.get("safety_note") else "") for s in part)
            chunks.append({"id": f"steps:{pid}:{part[0]['step_no']}", "text": f"{pid} {p['title']} – {body}",
                           "source_type": "procedure_steps", "source_id": pid, "step": part[0]["step_no"],
                           "title": f"{pid} steps {part[0]['step_no']}–{part[-1]['step_no']}", "assets": assets, "group": p["equipment"]})
    for f in DATA.failures:
        text = (f"Failure {f['event_id']} on {f['asset_id']} ({f['failure_at']}): symptom {f.get('symptom')}; failure mode "
                f"{f.get('failure_mode')}; root cause {f.get('root_cause')}; repair {f.get('repair_action')}; downtime "
                f"{f.get('downtime_h')} h; lesson learned: {f.get('lesson_learned')}")
        chunks.append({"id": f"fail:{f['event_id']}", "text": text, "source_type": "failure", "source_id": f["event_id"],
                       "title": f"{f['event_id']} {f['asset_id']} – {f.get('failure_mode')}", "assets": [f["asset_id"]], "group": ""})
    return chunks


def _pdf_pages(data: bytes) -> list[str]:
    from pypdf import PdfReader

    return [(p.extract_text() or "") for p in PdfReader(io.BytesIO(data)).pages]


_HEAD_RX = re.compile(r"^\s*((?:[A-Z]{2}-\d{2}|\d{1,2}\.\d{1,2}|\d{1,2}\.)\s+[A-Z][^\n]{3,90})$", re.M)


def chunk_pdf_doc(pages: list[str], doc_id: str, source_type: str, title: str, assets: list[str] | None = None,
                  skip_pages: int = 0) -> list[dict]:
    chunks = []
    for pno, raw in enumerate(pages, start=1):
        if pno <= skip_pages:
            continue
        raw = re.sub(r"WWTP Maintenance Manual – Rev 0.*?Page \d+", " ", raw)
        heads = _HEAD_RX.findall(raw)
        head = heads[0].strip() if heads else title
        pid = re.match(r"([A-Z]{2}-\d{2})", head)
        a = assets if assets is not None else (assets_from_text(DATA.procedures[pid.group(1)]["equipment"])
                                               if pid and pid.group(1) in DATA.procedures else assets_from_text(raw[:600]))
        for i, piece in enumerate(_chunk(raw)):
            chunks.append({"id": f"{doc_id}:p{pno}:{i}", "text": f"{head} – {piece}", "source_type": source_type,
                           "source_id": doc_id, "page": pno, "title": f"{title} p.{pno} · {head[:60]}", "assets": a,
                           "group": "", "procedure_id": pid.group(1) if pid else None})
    return chunks


def build_manuals() -> list[dict]:
    out = chunk_pdf_doc(_pdf_pages(MANUAL_PDF.read_bytes()), "MANUAL", "manual", "WWTP Maintenance Manual", skip_pages=4)
    out += chunk_pdf_doc(_pdf_pages(IR_FORMAT_PDF.read_bytes()), "IR-FORMAT", "ir_format", "Incident Report Format", assets=[])
    return out


# --------------------------------------------------------------------------- uploads parsing
def extract_text(filename: str, data: bytes) -> list[str]:
    """Returns pages (PDF) or a single-item list."""
    ext = Path(filename).suffix.lower()
    if ext == ".pdf":
        return _pdf_pages(data)
    if ext == ".docx":
        import docx

        d = docx.Document(io.BytesIO(data))
        parts = [p.text for p in d.paragraphs]
        for t in d.tables:
            for r in t.rows:
                parts.append(" | ".join(c.text for c in r.cells))
        return ["\n".join(parts)]
    if ext in (".txt", ".md", ".markdown"):
        return [data.decode("utf-8", errors="replace")]
    raise ValueError(f"Unsupported file type {ext} (PDF, DOCX, TXT, MD)")


# --------------------------------------------------------------------------- index
class KnowledgeBase:
    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.chunks: list[dict] = []
        self.emb: np.ndarray | None = None
        self.bm25: BM25Okapi | None = None
        self.docs: list[dict] = []
        self._model = None
        self.ready = False

    # -- embedding model (lazy; downloaded once to backend/var/models)
    @property
    def model(self):
        if self._model is None:
            from fastembed import TextEmbedding

            self._model = TextEmbedding(EMBED_MODEL, cache_dir=str(VAR_DIR / "models"))
        return self._model

    def _embed_passages(self, texts: list[str]) -> np.ndarray:
        if not texts:
            return np.zeros((0, 384), dtype=np.float32)
        v = np.array(list(self.model.passage_embed(texts, batch_size=64)), dtype=np.float32)
        return v / np.linalg.norm(v, axis=1, keepdims=True)

    def _embed_query(self, q: str) -> np.ndarray:
        v = np.array(list(self.model.query_embed([q]))[0], dtype=np.float32)
        return v / np.linalg.norm(v)

    # -- persistence
    def _base_hash(self) -> str:
        h = hashlib.sha1(CORPUS_VERSION.encode())
        for p in (MANUAL_PDF, IR_FORMAT_PDF):
            h.update(str(p.stat().st_size).encode())
        h.update(EMBED_MODEL.encode())
        return h.hexdigest()[:12]

    def load_or_build(self) -> None:
        t0 = time.time()
        meta_f, emb_f = INDEX_DIR / "chunks.json", INDEX_DIR / "emb.npy"
        self.docs = json.loads(DOCS_FILE.read_text()) if DOCS_FILE.exists() else []
        base_hash = self._base_hash()
        if meta_f.exists() and emb_f.exists():
            meta = json.loads(meta_f.read_text())
            if meta.get("hash") == base_hash:
                self.chunks, self.emb = meta["chunks"], np.load(emb_f)
        if not self.chunks:
            self.chunks = build_structured() + build_manuals()
            for d in self.docs:  # re-chunk uploads from stored files
                self.chunks += self._chunks_for_upload(d)
            self.emb = self._embed_passages([c["text"] for c in self.chunks])
            self._save(base_hash)
        self._rebuild_bm25()
        self.ready = True
        print(f"[kb] {len(self.chunks)} chunks ready in {time.time() - t0:.1f}s")

    def _save(self, base_hash: str | None = None) -> None:
        (INDEX_DIR / "chunks.json").write_text(json.dumps({"hash": base_hash or self._base_hash(), "chunks": self.chunks}))
        np.save(INDEX_DIR / "emb.npy", self.emb)
        DOCS_FILE.write_text(json.dumps(self.docs, indent=1))

    def _rebuild_bm25(self) -> None:
        self.bm25 = BM25Okapi([tokenize(c["text"] + " " + c.get("title", "")) for c in self.chunks])

    # -- search
    def search(self, query: str, k: int = 6, source_types: list[str] | None = None, asset_id: str | None = None,
               group: str | None = None, rrf_k: int = 60, w_dense: float = 0.7, w_bm25: float = 1.0) -> list[dict]:
        if not self.ready:
            self.load_or_build()
        idx = [i for i, c in enumerate(self.chunks)
               if (not source_types or c["source_type"] in source_types)
               and (not asset_id or not c.get("assets") or asset_id in c["assets"])
               and (not group or group.lower() in (c.get("group") or "").lower())]
        if not idx:
            return []
        bm = self.bm25.get_scores(tokenize(query))
        qv = self._embed_query(query)
        dense = self.emb @ qv
        sub_bm = sorted(idx, key=lambda i: -bm[i])
        sub_de = sorted(idx, key=lambda i: -dense[i])
        fused: dict[int, float] = {}
        for r, i in enumerate(sub_bm):
            if bm[i] > 0:
                fused[i] = fused.get(i, 0) + w_bm25 / (rrf_k + r + 1)
        for r, i in enumerate(sub_de):
            fused[i] = fused.get(i, 0) + w_dense / (rrf_k + r + 1)
        ranked = sorted(fused, key=lambda i: -fused[i])
        best, seen = [], set()
        for i in ranked:  # symptoms have several views: keep the best one per symptom
            c = self.chunks[i]
            key = c["source_id"] if c["source_type"] == "symptom" else c["id"]
            if key in seen:
                continue
            seen.add(key)
            best.append(i)
            if len(best) >= k:
                break
        out = []
        for i in best:
            c = self.chunks[i]
            out.append({**{k2: c.get(k2) for k2 in ("id", "source_type", "source_id", "title", "page", "step", "procedure_id")},
                        "text": c["text"][:900], "score": round(fused[i], 5), "dense": round(float(dense[i]), 3),
                        "bm25": round(float(bm[i]), 2)})
        return out

    # -- uploads
    def _chunks_for_upload(self, d: dict) -> list[dict]:
        path = UPLOAD_DIR / d["stored_as"]
        pages = extract_text(d["filename"], path.read_bytes())
        assets = [d["asset_id"]] if d.get("asset_id") else []
        out = chunk_pdf_doc(pages, d["doc_id"], "upload", d["title"], assets=assets)
        for c in out:
            c["group"] = d.get("equipment_model") or ""
        return out

    def add_upload(self, filename: str, data: bytes, asset_id: str | None, equipment_model: str | None, title: str | None) -> dict:
        doc_id = "DOC-" + uuid.uuid4().hex[:8].upper()
        stored = f"{doc_id}{Path(filename).suffix.lower()}"
        extract_text(filename, data)  # validate before storing
        (UPLOAD_DIR / stored).write_bytes(data)
        d = {"doc_id": doc_id, "filename": filename, "stored_as": stored, "title": title or Path(filename).stem,
             "asset_id": asset_id or None, "equipment_model": equipment_model or None,
             "uploaded_at": time.strftime("%Y-%m-%d %H:%M"), "bytes": len(data)}
        new = self._chunks_for_upload(d)
        d["chunks"] = len(new)
        with self.lock:
            self.chunks += new
            self.emb = np.vstack([self.emb, self._embed_passages([c["text"] for c in new])]) if new else self.emb
            self.docs.append(d)
            self._rebuild_bm25()
            self._save()
        return d

    def delete_doc(self, doc_id: str) -> bool:
        with self.lock:
            d = next((x for x in self.docs if x["doc_id"] == doc_id), None)
            if not d:
                return False
            keep = [i for i, c in enumerate(self.chunks) if c.get("source_id") != doc_id]
            self.chunks = [self.chunks[i] for i in keep]
            self.emb = self.emb[keep]
            self.docs = [x for x in self.docs if x["doc_id"] != doc_id]
            (UPLOAD_DIR / d["stored_as"]).unlink(missing_ok=True)
            self._rebuild_bm25()
            self._save()
        return True

    def list_docs(self) -> dict:
        builtin = {}
        for c in self.chunks:
            if c["source_type"] != "upload":
                builtin[c["source_type"]] = builtin.get(c["source_type"], 0) + 1
        labels = {"symptom": "Symptoms + diagnostic questions", "procedure": "Procedures (header, key points, figures)",
                  "procedure_steps": "Procedure steps", "failure": "Failure history (lessons learned)",
                  "manual": "WWTP Maintenance Manual (PDF)", "ir_format": "Incident Report Format guide (PDF)"}
        return {"builtin": [{"source_type": k, "title": labels.get(k, k), "chunks": v} for k, v in builtin.items()],
                "uploads": self.docs}

    def upload_text(self, doc_id: str, max_chars: int = 12000) -> str:
        return "\n".join(c["text"] for c in self.chunks if c.get("source_id") == doc_id)[:max_chars]


KB = KnowledgeBase()
