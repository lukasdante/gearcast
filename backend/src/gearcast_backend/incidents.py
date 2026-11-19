"""Incident report: deterministic linked-data gathering + LLM narrative fill of the 37-field template,
validation, DOCX rendering on the client's Word form, and submission storage (IR-YYYY-NNN)."""
from __future__ import annotations

import json
import re
import threading
from datetime import datetime, timedelta

from . import costs, rr
from .config import INCIDENTS_FILE
from .data import AS_OF, DATA, StatusCtx, fmt_date, money, num, parse_dt, partner_of, procedure_for_text, view
from .llm import complete_json
from .tools import pm_for

_lock = threading.Lock()

PICK = {
    3: ["Minor", "Major", "Critical", "Near miss"],
    9: ["Trip", "Noise", "Leak observed", "Flow drop", "Rounds reading", "Inspection"],
    10: ["Running", "Starting", "Standby", "Stopped"],
    18: ["None", "Curtail", "Bypass", "Shutdown"],
    21: ["None", "Near miss", "Injury"],
    30: ["Repair", "Repair – watch", "Replace", "Not required"],
    36: ["No change", "Shut Down", "Under Maintenance"],
}
CHECKLIST = ["Lubrication", "Contamination", "Misalignment", "Wrong part", "End of life", "Handling/storage", "Vibration",
             "Operation error", "Maintenance missed"]
MECHANISMS = ["Wear", "Fatigue", "Corrosion", "Clogging", "Overheating", "Electrical", "Leakage", "Mechanical damage", "Other"]

INDICATORS = [  # (label, table, key, limit text)
    ("Vibration DE (mm/s)", "dc", "vib_de_mm_s", "alarm 4.5 · trip 7.1"),
    ("Vibration NDE (mm/s)", "dc", "vib_nde_mm_s", "alarm 4.5 · trip 7.1"),
    ("Bearing temp DE (°C)", "dc", "temp_de_c", "alarm 80 · stop 90"),
    ("Bearing temp NDE (°C)", "dc", "temp_nde_c", "alarm 80 · stop 90"),
    ("Seal reservoir level (%)", "dc", "seal_reservoir_level_pct", "normal band"),
    ("Flow (m³/h)", "mr", "flow_m3h", "drop > 20% of rated"),
    ("Discharge pressure (bar)", "mr", "discharge_pressure_bar", "normal ≈ 2.1"),
    ("Current (A)", "mr", "current_a", "≤ 105% FLC (13.4 A)"),
]


# --------------------------------------------------------------------------- storage
def _load() -> list[dict]:
    return json.loads(INCIDENTS_FILE.read_text()) if INCIDENTS_FILE.exists() else []


def _save(rows: list[dict]) -> None:
    INCIDENTS_FILE.write_text(json.dumps(rows, indent=1, default=str))


def next_report_id(year: int) -> str:
    ids = [r["report_id"] for r in DATA.incident_reports] + [r["report_id"] for r in _load()]
    nums = [int(m.group(1)) for i in ids if (m := re.match(rf"IR-{year}-(\d+)", i))]
    return f"IR-{year}-{(max(nums) if nums else 0) + 1:03d}"


def list_reports() -> dict:
    hist = [{"report_id": r["report_id"], "asset_id": r["asset_id"], "date": r["incident_date"], "severity": r["severity"],
             "failure_mode": r.get("failure_mode"), "status": r.get("status"), "summary": r.get("expected_report_text"),
             "procedure_used": r.get("procedure_used"), "production_loss_php": num(r.get("production_loss_php")),
             "repair_cost_php": num(r.get("repair_cost_php")), "source": "history"} for r in DATA.incident_reports]
    sub = [{"report_id": r["report_id"], "asset_id": r["asset_id"], "date": (r.get("failure_at") or "")[:10],
            "severity": r["fields_by_no"].get("3", {}).get("value"), "failure_mode": r["fields_by_no"].get("22", {}).get("value"),
            "status": "Submitted", "summary": r.get("summary"), "shut_down": r.get("shut_down"), "submitted_at": r.get("submitted_at"),
            "source": "submitted"} for r in _load()]
    return {"submitted": sorted(sub, key=lambda x: x["report_id"], reverse=True),
            "history": sorted(hist, key=lambda x: x["report_id"], reverse=True)}


def get_report(report_id: str) -> dict | None:
    r = next((x for x in _load() if x["report_id"] == report_id), None)
    if r:
        return r
    h = next((x for x in DATA.incident_reports if x["report_id"] == report_id), None)
    return {"report_id": report_id, "history": h} if h else None


# --------------------------------------------------------------------------- linked data
def _window(rows, aid, end: datetime, days: int):
    start = end - timedelta(days=days)
    return [r for r in rows if r["asset_id"] == aid and start <= (parse_dt(f"{r['date']} {r.get('time') or '00:00'}") or start) <= end]


def readings_table(aid: str, at: datetime) -> list[dict]:
    end = min(at, parse_dt(AS_OF))
    dc = [r for r in DATA.daily_checks if r["asset_id"] == aid and r.get("running")]
    mr = [r for r in DATA.manual_rounds if r["asset_id"] == aid and r.get("status") == "Running"]

    def at_or_before(rows, t):
        rows = [r for r in rows if (parse_dt(f"{r['date']} {r.get('time') or '00:00'}") or t) <= t]
        return rows[-1] if rows else None

    out = []
    for label, tbl, key, limit in INDICATORS:
        rows = [r for r in (dc if tbl == "dc" else mr) if r.get(key) is not None]
        if not rows:
            continue
        a, b = at_or_before(rows, end - timedelta(days=42)), at_or_before(rows, end - timedelta(days=1))
        if not b:
            continue
        va, vb = (a or {}).get(key), b.get(key)
        trend = "" if va is None else ("rising" if vb > va * 1.1 else "falling" if vb < va * 0.9 else "steady")
        out.append({"indicator": label, "six_weeks_before": va, "day_before": vb, "limit": limit,
                    "comment": f"{trend} ({b['date']})".strip()})
    return out


def alerts_for(aid: str, at: datetime) -> list[str]:
    out = []
    for p in pm_for(aid):
        d = num(p.get("days_until_due"))
        if d is not None and d < 0:
            out.append(f"PM {p['task_id']} {p['task']} overdue {-int(d)} d")
        elif p.get("status", "").startswith("Coming up"):
            out.append(f"PM {p['task_id']} {p['task']} due {p['next_due_date']}")
    end = min(at, parse_dt(AS_OF))
    for r in _window(DATA.daily_checks, aid, end, 14):
        vib = max(num(r.get("vib_de_mm_s"), 0) or 0, num(r.get("vib_nde_mm_s"), 0) or 0)
        if vib >= 2.8:
            out.append(f"{r['date']}: vibration {vib} mm/s ≥ 2.8 (AR-01 advance alignment/bearing check)")
            break
    sp = DATA.spare_summary.get(aid)
    if sp and str(sp.get("overdue")).lower() in ("1", "true"):
        out.append(f"Standby check overdue (last {sp['last_check_date']})")
    return out or ["None fired in the 14 days before the failure"]


def gather(ctx: StatusCtx, f: dict) -> dict:
    aid = f["asset_id"].upper()
    a = DATA.asset[aid]
    at = parse_dt(f.get("failure_at")) or parse_dt(AS_OF)
    fe = next((x for x in DATA.failures if x["asset_id"] == aid and abs(((parse_dt(x["failure_at"]) or at) - at).total_seconds()) < 86400), None)
    proc = procedure_for_text(f.get("procedure_used"))
    hours = num(f.get("downtime_h"))
    est = costs.cost_estimate(ctx, aid, hours, f.get("procedure_used") or "", force_down=bool(f.get("shut_down")))
    rr_out = rr.predict(rr.live_features(aid, est["repair"] or None, est["production_loss"]))
    partner = partner_of(aid)
    pv = view(ctx, partner) if partner else None
    from .data import SPARE_FOR

    spare = SPARE_FOR.get(aid)
    if pv:
        standby = f"Started – {partner}" if pv["status"] == "In Service" else f"Not available – {partner} {pv['status']}"
    else:
        standby = "None"
    wos = sorted([w for w in DATA.work_orders if w["asset_id"] == aid], key=lambda w: w["reported_at"], reverse=True)
    node = DATA.nodes.get(a.get("location_node") or "", {})
    similar = [x for x in DATA.failures if x["asset_id"].rstrip("AB") == aid.rstrip("AB")][-4:]
    return {
        "asset": a, "node": node, "failure_event": fe, "procedure": proc, "cost": est, "rr": rr_out, "standby": standby,
        "spare": spare, "partner": partner, "partner_status": pv["status"] if pv else None,
        "readings": readings_table(aid, at), "alerts": alerts_for(aid, at),
        "work_orders": [{k: w.get(k) for k in ("wo_id", "title", "reported_at", "status", "total_cost_php")} for w in wos[:3]],
        "open_work_orders": [w["wo_id"] for w in wos if w.get("status") != "Closed"],
        "pm": [{k: p.get(k) for k in ("task_id", "task", "next_due_date", "status")} for p in pm_for(aid)[:4]],
        "similar_failures": [{k: x.get(k) for k in ("event_id", "asset_id", "failure_at", "symptom", "failure_mode", "root_cause",
                                                    "repair_action", "lesson_learned")} for x in similar],
    }


def _severity(f: dict, g: dict) -> str:
    if g["cost"]["pair_down"] or g["cost"]["production_loss"] > 0:
        return "Critical"
    if f.get("shut_down") or (num(f.get("downtime_h"), 0) or 0) >= 4:
        return "Major"
    return "Minor"


# --------------------------------------------------------------------------- draft
NARRATIVE_SYSTEM = """You fill the narrative fields of a wastewater-treatment-plant equipment incident report from the
technician's notes and the linked records. Facts only: never invent readings, times, costs or part numbers. If the notes
do not say something, write "Not recorded" (or for engineer fields, a clearly-marked suggestion). Plain, short sentences.
Return JSON with keys:
 symptom_observed (str, cleaned-up facts from the notes),
 detected_by (one of: Trip, Noise, Leak observed, Flow drop, Rounds reading, Inspection),
 operating_condition (one of: Running, Starting, Standby, Stopped),
 actions (list of {"time": "HH:MM" or "", "action": str, "by": role code or ""} parsed from the notes, in order),
 failure_mode (short, ISO 14224 style, e.g. "Mechanical seal leak"),
 failure_mechanism (one of: Wear, Fatigue, Corrosion, Clogging, Overheating, Electrical, Leakage, Mechanical damage, Other),
 direct_cause (str, suggested), whys (list of up to 5 short "why" answers, suggested),
 root_cause_checklist (subset of: Lubrication, Contamination, Misalignment, Wrong part, End of life, Handling/storage,
   Vibration, Operation error, Maintenance missed),
 repair_done (str or "Not recorded"),
 corrective_actions (list of up to 3 {"action": str, "owner": role, "due": "YYYY-MM-DD", "status": "Open"}),
 lesson_learned (1–2 sentences),
 summary (one paragraph in the style of the example report text, using only given facts and numbers)."""


def _llm_narrative(f: dict, g: dict) -> dict:
    ex = next((r["expected_report_text"] for r in DATA.incident_reports if r.get("failure_event_id")), "")
    facts = {
        "asset": f"{g['asset']['asset_id']} – {g['asset']['description']}", "failure_at": f.get("failure_at"),
        "technician_notes": f.get("observed"), "actions_taken_notes": f.get("actions_taken"), "detected_by_hint": f.get("detected_by"),
        "procedure_used": f.get("procedure_used"), "parts_used": f.get("parts_used"), "downtime_h": f.get("downtime_h"),
        "shut_down_decision": bool(f.get("shut_down")), "standby": g["standby"],
        "production_loss_php": g["cost"]["production_loss"], "repair_estimate_php": g["cost"]["repair"],
        "repair_or_replace": g["rr"]["recommendation"], "readings_before": g["readings"], "alerts": g["alerts"],
        "matching_failure_record": g["failure_event"], "similar_past_failures": g["similar_failures"],
        "report_date": AS_OF[:10],
    }
    return complete_json(NARRATIVE_SYSTEM, f"Example report text:\n{ex}\n\nFacts (JSON):\n{json.dumps(facts, default=str)}",
                         max_tokens=2200)


def _pick(v, allowed, default):
    if not v:
        return default
    for a in allowed:
        if str(v).strip().lower() == a.lower() or str(v).lower().startswith(a.lower()):
            return a
    return default


def build_draft(f: dict, sim: dict | None, use_llm: bool = True) -> dict:
    aid = (f.get("asset_id") or "").upper()
    if aid not in DATA.asset:
        raise ValueError(f"Unknown asset {aid}")
    f["asset_id"] = aid
    ctx = StatusCtx.from_client(sim)
    g = gather(ctx, f)
    ai = _llm_narrative(f, g) if use_llm else {}
    at = parse_dt(f.get("failure_at")) or parse_dt(AS_OF)
    rid = next_report_id(at.year)
    c, fe, proc = g["cost"], g["failure_event"] or {}, g["procedure"]
    loss = c["loss"] or {}
    actions = ai.get("actions") or []
    whys = (ai.get("whys") or [])[:5]
    capa = (ai.get("corrective_actions") or [])[:4]
    parts_rows = c["part_rows"]
    parts_text = f.get("parts_used") or ("; ".join(f"{p['part_id']} × 1 · PHP {p['cost_php']:,}{' (emergency)' if p['emergency'] else ''}"
                                               for p in parts_rows) or "None")
    sev = _pick(f.get("severity"), PICK[3], _severity(f, g))
    prod_impact = "Shutdown" if c["pair_down"] and (loss.get("response") or "") == "None" else (
        "Curtail" if c["pair_down"] else "None")
    resulting = "Shut Down" if f.get("shut_down") else "No change"

    def F(no, value, source):
        t = next(x for x in DATA.ir_template if x["field_no"] == no)
        return {"field_no": no, "section": t["section"], "field": t["field"], "filled_by": t["filled_by"],
                "allowed_values": t["allowed_values"], "value": value, "source": source}

    ai_src = "ai" if ai else "data"
    fields = [
        F(1, rid, "data"), F(2, f.get("report_date") or fmt_date(datetime.now().strftime("%Y-%m-%d %H:%M"), True), "data"),
        F(3, sev, "user" if f.get("severity") else "data"),
        F(4, " · ".join(x for x in [fe.get("event_id"), fe.get("main_wo_id"), *g["open_work_orders"][:2], loss.get("scenario")] if x)
          or "New event – no failure record or open work order yet", "data"),
        F(5, f"{aid} – {g['asset']['description']}", "data"),
        F(6, f"{g['asset'].get('location_node')} – {g['node'].get('node_name', 'Not recorded')}", "data"),
        F(7, fmt_date(f.get("failure_at"), True), "user"),
        F(8, f"{f.get('shift') or _shift(at)} · {f.get('reported_by') or 'Not recorded'}", "user" if f.get("reported_by") else "data"),
        F(9, _pick(f.get("detected_by") or ai.get("detected_by"), PICK[9], "Inspection"), "user" if f.get("detected_by") else ai_src),
        F(10, _pick(f.get("operating_condition") or ai.get("operating_condition"), PICK[10], "Running"),
          "user" if f.get("operating_condition") else ai_src),
        F(11, ai.get("symptom_observed") or f.get("observed") or "Not recorded", ai_src if ai.get("symptom_observed") else "user"),
        F(12, "\n".join(f"{r['indicator']}: {r['six_weeks_before']} → {r['day_before']} ({r['comment']}; limit {r['limit']})"
                        for r in g["readings"]) or "Not recorded", "data"),
        F(13, "\n".join(g["alerts"]), "data"),
        F(14, "\n".join(f"{a.get('time') or '--:--'} {a.get('action')}" + (f" ({a['by']})" if a.get("by") else "") for a in actions)
          or f.get("actions_taken") or "Not recorded", ai_src if actions else "user"),
        F(15, f"{proc['procedure_id']} · {proc['title']}" if proc else (f.get("procedure_used") or "Not recorded"), "user" if f.get("procedure_used") else "data"),
        F(16, f.get("standby_used") or g["standby"], "user" if f.get("standby_used") else "data"),
        F(17, f"{f['downtime_h']} h (so far)" if f.get("downtime_h") not in (None, "") else "Not recorded", "user"),
        F(18, prod_impact, "data"),
        F(19, c["explanation"], "data"),
        F(20, f"Bypass 0 h · fine {money(loss.get('fine', 0))}" if c["pair_down"] else "None – standby covered (no bypass)", "data"),
        F(21, _pick(f.get("safety_injury"), PICK[21], "None"), "user" if f.get("safety_injury") else "data"),
        F(22, ai.get("failure_mode") or fe.get("failure_mode") or "Not recorded", "ai" if ai.get("failure_mode") else "data"),
        F(23, _pick(ai.get("failure_mechanism"), MECHANISMS, "Other") if ai else "Not recorded", ai_src),
        F(24, ai.get("direct_cause") or "Not recorded", ai_src),
        F(25, "\n".join(f"Why {i + 1}: {w}" for i, w in enumerate(whys)) or fe.get("root_cause") or "Not recorded", ai_src),
        F(26, ", ".join(x for x in (ai.get("root_cause_checklist") or []) if x in CHECKLIST) or "Not recorded", ai_src),
        F(27, ai.get("repair_done") or f.get("repair_done") or fe.get("repair_action") or "Not recorded", ai_src),
        F(28, parts_text, "user" if f.get("parts_used") else "data"),
        F(29, f"{money(c['repair'])} (labour {money(c['labour'])} + parts {money(c['parts'])})" if c["repair"] else "Not recorded", "data"),
        F(30, _pick(g["rr"]["recommendation"], PICK[30], "Repair") + f" · RR-Model v1, confidence {g['rr']['confidence']:.0%}", "data"),
        F(31, "\n".join(f"{i + 1}. {a.get('action')} – {a.get('owner')} – due {a.get('due')} – {a.get('status', 'Open')}"
                        for i, a in enumerate(capa)) or "Not recorded", ai_src),
        F(32, ai.get("lesson_learned") or "Not recorded", ai_src),
        F(33, f"Prepared by: {f.get('reported_by') or '—'} · {fmt_date(AS_OF)}\nReviewed by: Pending\nApproved by: Pending", "data"),
        F(34, "Not recorded", "data"),
        F(35, "See Section 10 photos", "data"),
        F(36, f"{resulting}" + (f" · {fmt_date(f.get('failure_at'), True)} · Authorised by Head of Operations" if f.get("shut_down") else ""), "user"),
        F(37, "Not recorded – pending repair", "data"),
    ]
    warnings = validate(fields)
    return {
        "report_id": rid, "asset_id": aid, "failure_at": f.get("failure_at"), "shut_down": bool(f.get("shut_down")),
        "inputs": f, "fields": fields, "summary": ai.get("summary"), "warnings": warnings,
        "tables": {"readings": g["readings"], "actions": actions, "whys": whys, "capa": capa,
                   "parts": [{"part_id": p["part_id"], "name": p["name"], "qty": 1, "cost_php": p["cost_php"]} for p in parts_rows],
                   "labour_php": c["labour"], "repair_php": c["repair"]},
        "linked": {"failure_event": g["failure_event"], "work_orders": g["work_orders"], "open_work_orders": g["open_work_orders"],
                   "pm": g["pm"], "cost": c, "repair_or_replace": {k: g["rr"][k] for k in ("recommendation", "confidence", "factors", "costs")},
                   "standby": g["standby"], "spare": g["spare"]},
        "llm_used": bool(ai),
    }


def _shift(at: datetime) -> str:
    h = at.hour
    return "Day" if 6 <= h < 14 else "Swing" if 14 <= h < 22 else "Night"


def validate(fields: list[dict]) -> list[str]:
    w = []
    by = {f["field_no"]: f for f in fields}
    for no, allowed in PICK.items():
        v = str(by[no]["value"]).split(" ·")[0].strip()
        if v not in allowed:
            w.append(f"Field {no} '{by[no]['field']}': '{v}' not in allowed values")
    if not re.match(r"^IR-\d{4}-\d{3}$", str(by[1]["value"])):
        w.append("Field 1 Report ID format")
    for no in (7, 11):
        if by[no]["value"] in ("", "Not recorded", None):
            w.append(f"Field {no} '{by[no]['field']}' is required")
    return w


def submit(draft: dict) -> dict:
    with _lock:
        rows = _load()
        at = parse_dt(draft.get("failure_at")) or parse_dt(AS_OF)
        rid = draft.get("report_id")
        if not rid or any(r["report_id"] == rid for r in rows) or rid in {r["report_id"] for r in DATA.incident_reports}:
            rid = next_report_id(at.year)
        for fld in draft.get("fields", []):
            if fld["field_no"] == 1:
                fld["value"] = rid
        rec = {**draft, "report_id": rid, "submitted_at": datetime.now().strftime("%Y-%m-%d %H:%M"),
               "fields_by_no": {str(x["field_no"]): x for x in draft.get("fields", [])}}
        rows.append(rec)
        _save(rows)
    return {"report_id": rid, "shut_down": bool(draft.get("shut_down")), "asset_id": draft.get("asset_id"),
            "status_change": ({"asset_id": draft.get("asset_id"), "new_status": "Shut Down",
                               "reason": f"Shut down per incident report {rid}"} if draft.get("shut_down") else None)}
