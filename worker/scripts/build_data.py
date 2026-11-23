"""Build the Worker's bundled data from the same sources the Python backend uses.

    uv run --project backend python worker/scripts/build_data.py

Writes worker/src/generated/{data,readings,corpus}.json. Values are UNSHIFTED (as in the dataset); the Worker
applies the date shift at request time (same rule as backend data.py). The RAG corpus is produced by the
backend's own chunkers (rag.build_structured + rag.build_manuals, pypdf extraction) so chunk ids/text match, and
BM25 statistics (doc lengths, document frequencies, postings) are precomputed with the backend's tokenizer.
"""
from __future__ import annotations

import json
import sys
import types
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "backend" / "src"
OUT = ROOT / "worker" / "src" / "generated"
sys.path.insert(0, str(SRC))

# Load gearcast_backend.data with OFFSET_DAYS = 0 (no date shift) before anything imports it.
import gearcast_backend  # noqa: E402
import gearcast_backend.config  # noqa: E402,F401

code = (SRC / "gearcast_backend" / "data.py").read_text()
assert "OFFSET_DAYS = (date.today() - DATA_CUTOFF).days" in code
code = code.replace("OFFSET_DAYS = (date.today() - DATA_CUTOFF).days", "OFFSET_DAYS = 0")
mod = types.ModuleType("gearcast_backend.data")
mod.__package__ = "gearcast_backend"
mod.__file__ = str(SRC / "gearcast_backend" / "data.py")
sys.modules["gearcast_backend.data"] = mod
exec(compile(code, mod.__file__, "exec"), mod.__dict__)
gearcast_backend.data = mod

from gearcast_backend import rag  # noqa: E402
from gearcast_backend.data import DATA, parse_dt  # noqa: E402

raw = json.loads((ROOT / "ref" / "prototype_data_extracted.json").read_text())
wb, b2, g4, fd = raw["workbook"], raw["batch2"], raw["G4"], raw["FORM_DATA"]

WO_KEYS = ("wo_id", "asset_id", "wo_type", "title", "reported_at", "status", "total_cost_php")
data = {
    "equipment": g4["equipmentRegister"],
    "equipmentStatus": wb["equipmentStatus"],
    "dutyRotation": wb["dutyRotation"],
    "nodes": wb["nodes"],
    "pmStatus": b2["pmStatus"],
    "failures": b2["failures"],
    "workOrders": [{k: w.get(k) for k in WO_KEYS} for w in b2["workOrders"]],
    "spares": b2["spareInventory"],
    "spareSummary": g4["spareSummary"],
    "procedures": b2["procedures"],
    "procedureSteps": sorted(b2["procedureSteps"], key=lambda s: (s["procedure_id"], s["step_no"])),
    "procedureFigures": sorted(b2["procedureFigures"], key=lambda f: f.get("show_order") or 0),
    "procedureKeyPoints": sorted(b2["procedureKeyPoints"], key=lambda k: k["point_order"]),
    "symptoms": b2["symptoms"],
    "questions": b2["diagnosticQuestions"],
    "incidentReports": wb["incidentReports"],
    "repairCases": g4["repairCases"],
    "costRef": g4["costReference"],
    "lossScenarios": g4["lossScenariosFull"],
    "curtailLines": g4["curtailmentLinesFull"],
    "suppliers": g4["suppliers"],
    "params": wb["parameters"],
    "plantParams": wb["allPlantParameters"],
    "irTemplate": fd["Incident_Report_Template"],
    "symptomAliases": rag.SYMPTOM_ALIASES,
}


def minutes(r) -> int | None:
    d = parse_dt(f"{r['date']} {r.get('time') or '00:00'}")
    return None if d is None else int((d - datetime(1970, 1, 1)).total_seconds() // 60)  # naive minutes


# Daily checks: every row (alerts window uses all rows), columnar per asset, data order kept.
DC_KEYS = ("vib_de_mm_s", "vib_nde_mm_s", "temp_de_c", "temp_nde_c", "seal_reservoir_level_pct")
MR_KEYS = ("flow_m3h", "discharge_pressure_bar", "current_a")
dc, mr, last_dc, last_mr = {}, {}, {}, {}
for r in b2["dailyChecks"]:
    m = minutes(r)
    dc.setdefault(r["asset_id"], []).append([m, 1 if r.get("running") else 0, *[r.get(k) for k in DC_KEYS]])
    if r.get("running"):
        last_dc[r["asset_id"]] = r
for r in b2["manualRounds"]:
    if r.get("status") != "Running":
        continue
    last_mr[r["asset_id"]] = r
    vals = [r.get(k) for k in MR_KEYS]
    if all(v is None for v in vals):
        continue
    mr.setdefault(r["asset_id"], []).append([minutes(r), *vals])
readings = {"dcKeys": DC_KEYS, "mrKeys": MR_KEYS, "dc": dc, "mr": mr, "lastDc": last_dc, "lastMr": last_mr}

# RAG corpus (unshifted text) + BM25 stats
chunks = rag.build_structured() + rag.build_manuals()

# Locate the dates the backend would shift inside structured chunk text: rebuild with OFFSET_DAYS = 1 and diff.
import importlib, re  # noqa: E401,E402
code1 = (SRC / "gearcast_backend" / "data.py").read_text().replace("OFFSET_DAYS = (date.today() - DATA_CUTOFF).days", "OFFSET_DAYS = 1")
mod1 = types.ModuleType("gearcast_backend.data")
mod1.__package__ = "gearcast_backend"
mod1.__file__ = mod.__file__
sys.modules["gearcast_backend.data"] = mod1
exec(compile(code1, mod1.__file__, "exec"), mod1.__dict__)
gearcast_backend.data = mod1
rag1 = importlib.reload(rag)
shifted = {c["id"]: c for c in rag1.build_structured()}
date_pos: dict[str, list[int]] = {}
for c in chunks:
    c1 = shifted.get(c["id"])
    if not c1:
        continue
    assert len(c1["text"]) == len(c["text"]) and c1.get("title") == c.get("title"), c["id"]
    pos = [m.start() for m in re.finditer(r"\d{4}-\d\d-\d\d", c["text"]) if c["text"][m.start():m.end()] != c1["text"][m.start():m.end()]]
    if pos:
        date_pos[c["id"]] = pos
sys.modules["gearcast_backend.data"] = mod
KEEP = ("id", "text", "source_type", "source_id", "title", "page", "step", "procedure_id", "assets", "group")
docs_tok = [rag.tokenize(c["text"] + " " + c.get("title", "")) for c in chunks]
postings: dict[str, list] = {}
for i, toks in enumerate(docs_tok):
    tf: dict[str, int] = {}
    for t in toks:
        tf[t] = tf.get(t, 0) + 1
    for t, n in tf.items():
        postings.setdefault(t, []).extend([i, n])
manual_pages: dict[str, list[int]] = {}
for c in chunks:
    if c["source_type"] == "manual" and c.get("procedure_id"):
        manual_pages.setdefault(c["procedure_id"], [])
        if c["page"] not in manual_pages[c["procedure_id"]]:
            manual_pages[c["procedure_id"]].append(c["page"])
corpus = {
    "version": rag.CORPUS_VERSION,
    "chunks": [{k: c.get(k) for k in KEEP if c.get(k) is not None or k in ("page",)} for c in chunks],
    "docLen": [len(t) for t in docs_tok],
    "postings": postings,
    "manualPages": {k: sorted(v) for k, v in manual_pages.items()},
    "datePos": date_pos,
}

OUT.mkdir(parents=True, exist_ok=True)
# 3 pumping areas (placeholder rows until the raw data update): ref/data_patches/pump_areas.json
sys.path.insert(0, str(Path(__file__).resolve().parent))
from apply_pump_areas import patch_data  # noqa: E402
patch_data(data)

for name, obj in (("data", data), ("readings", readings), ("corpus", corpus)):
    p = OUT / f"{name}.json"
    p.write_text(json.dumps(obj, separators=(",", ":"), ensure_ascii=False))
    print(f"{p.relative_to(ROOT)}  {p.stat().st_size / 1024:.0f} KB")
print(f"{len(chunks)} chunks, {len(postings)} terms")
