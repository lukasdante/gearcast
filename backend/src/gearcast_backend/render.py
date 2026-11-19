"""Fill the client's Incident_Report_Form_v1.2.docx with a draft (python-docx). Checkboxes are w14 content controls."""
from __future__ import annotations

import io
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

import docx
from docx.oxml.ns import qn
from docx.shared import Pt, RGBColor

from .config import IR_TEMPLATE_DOCX

W14 = "http://schemas.microsoft.com/office/word/2010/wordml"


def _cells(row):
    out, prev = [], None
    for c in row.cells:
        if c._tc is prev:
            continue
        prev = c._tc
        out.append(c)
    return out


def set_text(cell, text, size=8.5):
    text = "" if text is None else str(text)
    p = cell.paragraphs[0]
    for extra in cell.paragraphs[1:]:
        extra._element.getparent().remove(extra._element)
    for r in list(p.runs):
        r._element.getparent().remove(r._element)
    for i, line in enumerate(text.split("\n")):
        run = p.add_run(line)
        run.font.name = "Arial"
        run.font.size = Pt(size)
        run.font.color.rgb = RGBColor(0x10, 0x10, 0x10)
        if i < len(text.split("\n")) - 1:
            run.add_break()


def tick(cell, options: list[str]) -> None:
    """Check the checkbox whose label (following text run) starts with any of `options`."""
    wanted = [o.lower() for o in options if o]
    for p in cell.paragraphs:
        kids = list(p._element)
        for i, el in enumerate(kids):
            if el.tag != qn("w:sdt"):
                continue
            label = ""
            for nxt in kids[i + 1:]:
                if nxt.tag == qn("w:sdt"):
                    break
                label += "".join(t.text or "" for t in nxt.iter(qn("w:t")))
            label = re.sub(r"\s*\(.*", "", label).strip().lower()
            if label and label in wanted:
                chk = el.find(f".//{{{W14}}}checked")
                if chk is not None:
                    chk.set(f"{{{W14}}}val", "1")
                sym = el.find(".//" + qn("w:sym"))
                if sym is not None:
                    sym.set(qn("w:char"), "2612")


def render_docx(draft: dict) -> bytes:
    d = docx.Document(str(IR_TEMPLATE_DOCX))
    f = {x["field_no"]: x["value"] for x in draft["fields"]}
    inp = draft.get("inputs", {})
    linked = draft.get("linked", {})
    tables = draft.get("tables", {})
    fe = (linked.get("failure_event") or {}).get("event_id") or "New event (not yet in failure log)"
    wos = ", ".join([x for x in [(linked.get("failure_event") or {}).get("main_wo_id")] if x] + (linked.get("open_work_orders") or [])[:2]) or "None open"
    loss = (linked.get("cost") or {}).get("loss") or {}
    first = lambda v: str(v).split(" ·")[0].strip()  # noqa: E731

    label_values = {
        "report no.": f[1], "draft date": f[2], "linked failure event": fe, "linked work orders": wos,
        "loss scenario": loss.get("scenario") or "None (standby available)", "status": "Draft",
        "reported by (role code)": inp.get("reported_by") or "Not recorded", "drafted by": "GearCast (AI-assisted draft)",
        "asset tag and description": f[5], "location (process step)": f[6], "date and time of failure": f[7],
        "reporter (role code)": inp.get("reported_by") or "Not recorded",
        "procedure followed": f[15], "spare used (id)": inp.get("spare_used") or "None",
        "asset downtime (h)": f[17], "time to restore (h)": "Not recorded",
        "estimated production loss (php)": f[19], "bypass hours / compliance exposure": f[20],
        "status effective (date/time)": f[7] if draft.get("shut_down") else "—",
        "authorised by (role)": "Head of Operations" if draft.get("shut_down") else "—",
        "failure mode": f[22], "failure mechanism": f[23],
        "labour (php)": f"{tables.get('labour_php', 0):,.0f}", "total repair cost (php)": f"{tables.get('repair_php', 0):,.0f}",
        "return to service (date/time)": "Not recorded", "verified by / test done": "Pending – OP-05 run test",
    }
    ticks = {
        "severity": [first(f[3])], "shift": [first(f[8])], "how it was detected": [first(f[9])],
        "operating condition": [first(f[10])], "injury / safety": [first(f[21])],
        "standby unit": ["Started OK" if str(f[16]).startswith("Started") else "Not available" if "Not available" in str(f[16]) else "Not needed"],
        "production impact": [first(f[18])],
        "resulting equipment status": ["No change" if first(f[36]) == "No change" else first(f[36])],
        "root-cause checklist": [x.strip().replace("Handling/storage", "Handling / storage") for x in str(f[26]).split(",")],
        "repair-or-replace result": [first(f[30])],
    }
    blocks = {
        "symptom observed": f[11], "alerts that fired": f[13], "direct cause": f[24], "repair done": f[27], "lesson learned": f[32],
        "other attachments": "Readings export and work orders stored with the report in GearCast.",
    }

    for t in d.tables:
        rows = t.rows
        head = [c.text.strip().lower() for c in _cells(rows[0])]
        if head and head[0].startswith("gearcast") and len(head) >= 3:
            set_text(_cells(rows[0])[2], f"Report No.: {f[1]}\nDraft date: {f[2]}")
            continue
        if len(rows) == 2 and len(head) == 1:
            for k, v in blocks.items():
                if head[0].startswith(k):
                    set_text(_cells(rows[1])[0], v)
            continue
        if head[:2] == ["indicator", "6 weeks before"]:
            for i, r in enumerate(tables.get("readings", [])[: len(rows) - 1]):
                for c, v in zip(_cells(rows[i + 1]), [r["indicator"], r["six_weeks_before"], r["day_before"], r["limit"], r["comment"]]):
                    set_text(c, "—" if v is None else v)
            continue
        if head[:2] == ["time", "action"]:
            for i, a in enumerate(tables.get("actions", [])[: len(rows) - 1]):
                for c, v in zip(_cells(rows[i + 1]), [a.get("time"), a.get("action"), a.get("by")]):
                    set_text(c, v or "")
            continue
        if head[:2] == ["5 whys", "answer"]:
            for i, w in enumerate(tables.get("whys", [])[: len(rows) - 1]):
                set_text(_cells(rows[i + 1])[1], w)
            continue
        if head[:2] == ["part id", "part name"]:
            for i, p in enumerate(tables.get("parts", [])[: len(rows) - 1]):
                for c, v in zip(_cells(rows[i + 1]), [p["part_id"], p["name"], p["qty"], f"{p['cost_php']:,.0f}"]):
                    set_text(c, v)
            continue
        if head[:2] == ["#", "action"]:
            for i, a in enumerate(tables.get("capa", [])[: len(rows) - 1]):
                cs = _cells(rows[i + 1])
                for c, v in zip(cs[1:], [a.get("action"), a.get("owner"), a.get("due"), a.get("status", "Open")]):
                    set_text(c, v or "")
            continue
        if head[:2] == ["role", "name / role code"]:
            set_text(_cells(rows[1])[1], inp.get("reported_by") or "")
            set_text(_cells(rows[1])[2], f[2])
            continue
        for r in rows:  # label/value rows
            cs = _cells(r)
            for i in range(0, len(cs) - 1, 2):
                key = cs[i].text.strip().lower()
                if key in ticks:
                    tick(cs[i + 1], ticks[key])
                elif key in label_values:
                    set_text(cs[i + 1], label_values[key])
    buf = io.BytesIO()
    d.save(buf)
    return buf.getvalue()


def soffice_bin() -> str | None:
    return shutil.which("soffice") or shutil.which("libreoffice")


def docx_to_pdf(data: bytes) -> bytes | None:
    exe = soffice_bin()
    if not exe:
        return None
    with tempfile.TemporaryDirectory() as td:
        src = Path(td) / "report.docx"
        src.write_bytes(data)
        subprocess.run([exe, "--headless", "--convert-to", "pdf", "--outdir", td, str(src)], check=True, timeout=90,
                       capture_output=True)
        out = Path(td) / "report.pdf"
        return out.read_bytes() if out.exists() else None
