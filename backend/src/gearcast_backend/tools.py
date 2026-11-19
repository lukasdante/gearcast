"""Read-only plant tools shared by the assistant, troubleshooter and incident drafter. Deterministic Python:
every number the LLM repeats comes from here."""
from __future__ import annotations

import re
from datetime import timedelta

from . import costs, rr
from .data import (AS_OF, AS_OF_DATE, DATA, DOWN, SPARE_FOR, StatusCtx, asset_group, expand_targets, failures_for,
                   get_status, num, parse_dt, partner_of, view)
from .rag import KB


def _asset_ok(aid: str | None) -> str | None:
    if not aid:
        return None
    aid = aid.strip().upper()
    return aid if aid in DATA.asset else None


def get_plant_status(ctx: StatusCtx) -> dict:
    rows = [view(ctx, a["asset_id"]) for a in DATA.equipment]
    counts: dict[str, int] = {}
    for r in rows:
        counts[r["level"]] = counts.get(r["level"], 0) + 1
    return {"as_of": AS_OF, "simulated_changes": ctx.simulated, "counts": counts,
            "assets": [{k: r[k] for k in ("asset_id", "type", "status", "role", "partner", "note", "simulated")} for r in rows]}


def list_alarms(ctx: StatusCtx) -> dict:
    alarms = []
    for a in DATA.equipment:
        v = view(ctx, a["asset_id"])
        if v["status"] in DOWN or v["note"]:
            alarms.append({"type": "status", "asset_id": v["asset_id"], "severity": "high",
                           "text": f"{v['asset_id']} {v['status']}" + (f" – {v['note']}" if v["note"] else ""),
                           "simulated": v["simulated"]})
    for p in DATA.pm_status:
        if (num(p.get("days_until_due"), 99) or 0) < 0:
            alarms.append({"type": "pm_overdue", "asset_id": p["asset_id"], "severity": "medium",
                           "text": f"PM {p['task_id']} {p['task']} overdue {-int(p['days_until_due'])} d"})
    for sid, s in DATA.spare_summary.items():
        if s.get("readiness_status") != "Ready" or str(s.get("overdue")).lower() in ("1", "true"):
            alarms.append({"type": "spare", "asset_id": sid, "severity": "medium",
                           "text": f"{sid} readiness {s.get('readiness_status')} (last check {s.get('last_check_date')})"})
    for sp in DATA.spares:
        if sp.get("below_min") or (num(sp["qty_on_hand"], 0) < num(sp["min_qty"], 0)):
            alarms.append({"type": "stock", "asset_id": sp["fits_assets"], "severity": "medium" if sp.get("critical") else "low",
                           "text": f"{sp['part_id']} {sp['part_name']}: {sp['qty_on_hand']} on hand < min {sp['min_qty']}"})
    for r in latest_readings_all():
        if r.get("flag"):
            alarms.append({"type": "reading", "asset_id": r["asset_id"], "severity": "medium", "text": r["flag"]})
    return {"as_of": AS_OF, "count": len(alarms), "alarms": alarms}


def latest_readings(aid: str) -> dict:
    checks = [c for c in DATA.daily_checks if c["asset_id"] == aid and c.get("running")]
    rounds = [c for c in DATA.manual_rounds if c["asset_id"] == aid and c.get("status") == "Running"]
    last_c = checks[-1] if checks else None
    last_r = rounds[-1] if rounds else None
    flag = None
    if last_c:
        vib = max(num(last_c.get("vib_de_mm_s"), 0) or 0, num(last_c.get("vib_nde_mm_s"), 0) or 0)
        temp = max(num(last_c.get("temp_de_c"), 0) or 0, num(last_c.get("temp_nde_c"), 0) or 0)
        if vib >= DATA.param("PRM-141", 4.5):
            flag = f"{aid} vibration {vib} mm/s ≥ alarm {DATA.param('PRM-141')} ({last_c['date']})"
        elif temp >= DATA.param("PRM-143", 80):
            flag = f"{aid} bearing temperature {temp} °C ≥ alarm {DATA.param('PRM-143')} ({last_c['date']})"
    return {"asset_id": aid, "daily_check": last_c, "manual_round": last_r, "flag": flag}


def latest_readings_all() -> list[dict]:
    return [latest_readings(a["asset_id"]) for a in DATA.equipment if not a["asset_id"].startswith("SP-")]


def pm_for(aid: str) -> list[dict]:
    rows = [p for p in DATA.pm_status if aid in expand_targets(p["asset_id"])]
    return sorted(rows, key=lambda p: num(p.get("days_until_due"), 9999))


def get_asset(ctx: StatusCtx, asset_id: str) -> dict:
    aid = _asset_ok(asset_id)
    if not aid:
        return {"error": f"Unknown asset '{asset_id}'. Known: {', '.join(DATA.asset)}"}
    a = DATA.asset[aid]
    v = view(ctx, aid)
    p = partner_of(aid)
    spare = SPARE_FOR.get(aid)
    wos = sorted([w for w in DATA.work_orders if w["asset_id"] == aid], key=lambda w: w["reported_at"], reverse=True)[:5]
    return {
        "asset": {k: a.get(k) for k in ("asset_id", "asset_type", "description", "manufacturer", "model", "location_node",
                                         "install_date", "expected_life_years", "criticality", "parent_asset", "pair_id")},
        "status": v, "partner": view(ctx, p) if p else None,
        "stored_spare": ({"asset_id": spare, "status": get_status(ctx, spare),
                          **{k: DATA.spare_summary.get(spare, {}).get(k) for k in ("readiness_status", "last_check_date", "next_check_due")}}
                         if spare else None),
        "recent_failures": [{k: f.get(k) for k in ("event_id", "failure_at", "failure_mode", "downtime_h", "repair_cost_php", "lesson_learned")}
                            for f in failures_for(aid)[:5]],
        "recent_work_orders": [{k: w.get(k) for k in ("wo_id", "wo_type", "title", "reported_at", "status", "total_cost_php")} for w in wos],
        "pm_next": [{k: x.get(k) for k in ("task_id", "task", "next_due_date", "days_until_due", "status")} for x in pm_for(aid)[:4]],
        "latest_readings": latest_readings(aid),
    }


def pm_due(asset_id: str | None = None, days: int = 7) -> dict:
    rows = pm_for(asset_id.upper()) if asset_id else DATA.pm_status
    rows = [r for r in rows if (num(r.get("days_until_due"), 9999) or 0) <= days]
    rows = sorted(rows, key=lambda r: num(r.get("days_until_due"), 9999))
    return {"as_of": AS_OF_DATE, "window_days": days, "count": len(rows),
            "tasks": [{k: r.get(k) for k in ("task_id", "task", "asset_id", "next_due_date", "days_until_due", "status")} for r in rows[:25]]}


def spare_stock(query: str | None = None, below_min: bool = False) -> dict:
    q = (query or "").strip().lower()
    rows = []
    for sp in DATA.spares:
        hay = f"{sp['part_id']} {sp['part_name']} {sp['fits_assets']} {sp['category']}".lower()
        if q and q not in hay and not any(t in hay for t in expand_targets(q.upper()) if t.lower() in hay):
            continue
        low = bool(sp.get("below_min")) or num(sp["qty_on_hand"], 0) < num(sp["min_qty"], 0)
        if below_min and not low:
            continue
        sup = DATA.suppliers.get(sp.get("supplier_id") or "", {})
        rows.append({"part_id": sp["part_id"], "name": sp["part_name"], "fits": sp["fits_assets"], "on_hand": sp["qty_on_hand"],
                     "min": sp["min_qty"], "below_min": low, "critical": sp.get("critical"), "lead_time_days": sp.get("lead_time_days"),
                     "unit_cost_php": sp.get("unit_cost_php"), "supplier": sup.get("supplier_name")})
    stored = [{"asset_id": k, **{x: v.get(x) for x in ("spare_type", "readiness_status", "last_check_date", "next_check_due")}}
              for k, v in DATA.spare_summary.items()]
    return {"parts": rows[:30], "count": len(rows), "stored_and_standby_units": stored}


def failure_history(asset_id: str) -> dict:
    aid = _asset_ok(asset_id)
    if not aid:
        return {"error": f"Unknown asset '{asset_id}'"}
    fs = failures_for(aid, since_install=False)
    now = parse_dt(AS_OF)
    last12 = [f for f in fs if parse_dt(f["failure_at"]) >= now - timedelta(days=365)]
    return {"asset_id": aid, "install_date": DATA.asset[aid].get("install_date"), "count_total": len(fs), "count_last_12m": len(last12),
            "failures": [{k: f.get(k) for k in ("event_id", "failure_at", "symptom", "failure_mode", "root_cause", "downtime_h",
                                               "repair_cost_php", "lesson_learned")} for f in fs]}


def loss_estimate(ctx: StatusCtx, asset_id: str | None = None, asset_group_name: str | None = None, outage_h: float = 8,
                  pair_down: bool | None = None) -> dict:
    """If asset_id given: cost estimate assuming that asset is down (pair-down loss only if partner also down, or pair_down=True)."""
    if asset_id and _asset_ok(asset_id):
        aid = _asset_ok(asset_id)
        est = costs.cost_estimate(ctx, aid, outage_h, force_down=True)
        if pair_down and not est["pair_down"]:
            est["what_if_pair_down"] = costs.scenario_loss(asset_group(aid), float(outage_h))
        return est
    group = asset_group_name or "Transfer pumps"
    return {"group": group, "what_if_pair_down": costs.scenario_loss(group, float(outage_h)),
            "note": "Loss applies only when both units of the pair are unavailable; with a ready standby the loss is PHP 0."}


def search_knowledge(query: str, asset_id: str | None = None, k: int = 5) -> dict:
    hits = KB.search(query, k=k, asset_id=_asset_ok(asset_id))
    return {"query": query, "results": [{**h, "text": h["text"][:600]} for h in hits]}


def repair_or_replace(asset_id: str | None = None, case_id: str | None = None, repair_cost_php: float | None = None) -> dict:
    if case_id:
        c = next((x for x in rr.cases() if x["case"]["case_id"] == case_id.upper()), None)
        return c or {"error": f"Unknown case {case_id}"}
    aid = _asset_ok(asset_id)
    if not aid:
        return {"error": "Give asset_id or case_id"}
    p = rr.predict(rr.live_features(aid, repair_cost_php))
    return {"asset_id": aid, **{k: p[k] for k in ("recommendation", "confidence", "rules", "factors", "costs", "features")},
            "model": p["model"]["name"]}


# --------------------------------------------------------------------------- OpenAI tool schemas
def _fn(name, desc, props=None, req=None):
    return {"type": "function", "function": {"name": name, "description": desc,
                                             "parameters": {"type": "object", "properties": props or {}, "required": req or []}}}


ASSET = {"type": "string", "description": "Asset tag, e.g. P-101B, M-101A, SC-101A, SP-P01"}
TOOL_SCHEMAS = [
    _fn("get_plant_status", "Current status and duty/standby role of every tracked asset (includes the user's simulated changes)."),
    _fn("list_alarms", "Active alarms: assets shut down / not available, standby start needed, overdue PM, spares not ready, low stock, readings over alarm limits."),
    _fn("get_asset", "Details for one asset: register data, status, partner unit, stored spare readiness, recent failures and work orders, next PM, latest readings.", {"asset_id": ASSET}, ["asset_id"]),
    _fn("pm_due", "Preventive maintenance tasks due within N days (optionally for one asset).", {"asset_id": ASSET, "days": {"type": "integer", "default": 7}}),
    _fn("spare_stock", "Spare part stock (search by part, asset tag or category) and stored/standby unit readiness.", {"query": {"type": "string"}, "below_min": {"type": "boolean"}}),
    _fn("failure_history", "All recorded failures for an asset with failure mode, root cause, downtime, repair cost and lesson learned.", {"asset_id": ASSET}, ["asset_id"]),
    _fn("loss_estimate", "Production-loss and repair-cost estimate for an outage (Loss_Scenarios). Loss is PHP 0 while a standby is available; set pair_down=true for a what-if with both units down.",
        {"asset_id": ASSET, "asset_group_name": {"type": "string", "enum": ["Transfer pumps", "Sump pumps", "Screens"]},
         "outage_h": {"type": "number"}, "pair_down": {"type": "boolean"}}),
    _fn("search_knowledge", "Search procedures, symptoms, failure lessons, the WWTP maintenance manual and uploaded manuals. Returns cited chunks.",
        {"query": {"type": "string"}, "asset_id": ASSET}, ["query"]),
    _fn("repair_or_replace", "Repair-or-replace model output (GearCast RR-Model v1) for an asset or a recorded case RR-01..RR-11.",
        {"asset_id": ASSET, "case_id": {"type": "string"}, "repair_cost_php": {"type": "number"}}),
]

TOOL_LABELS = {
    "get_plant_status": "Checking plant status", "list_alarms": "Checking alarms", "get_asset": "Looking up {asset_id}",
    "pm_due": "Checking PM schedule", "spare_stock": "Checking spare stock", "failure_history": "Reading failure history{for_asset}",
    "loss_estimate": "Estimating downtime loss", "search_knowledge": "Searching manuals & procedures",
    "repair_or_replace": "Running repair-or-replace model",
}


def label_for(name: str, args: dict) -> str:
    t = TOOL_LABELS.get(name, name)
    return t.replace("{asset_id}", args.get("asset_id", "asset")).replace("{for_asset}", f" for {args['asset_id']}" if args.get("asset_id") else "")


def run_tool(ctx: StatusCtx, name: str, args: dict):
    a = {k: v for k, v in (args or {}).items() if v is not None}
    if name == "get_plant_status":
        return get_plant_status(ctx)
    if name == "list_alarms":
        return list_alarms(ctx)
    if name == "get_asset":
        return get_asset(ctx, a.get("asset_id", ""))
    if name == "pm_due":
        return pm_due(a.get("asset_id"), int(a.get("days", 7)))
    if name == "spare_stock":
        return spare_stock(a.get("query"), bool(a.get("below_min")))
    if name == "failure_history":
        return failure_history(a.get("asset_id", ""))
    if name == "loss_estimate":
        return loss_estimate(ctx, a.get("asset_id"), a.get("asset_group_name"), float(a.get("outage_h", 8)), a.get("pair_down"))
    if name == "search_knowledge":
        return search_knowledge(a.get("query", ""), a.get("asset_id"))
    if name == "repair_or_replace":
        return repair_or_replace(a.get("asset_id"), a.get("case_id"), a.get("repair_cost_php"))
    return {"error": f"unknown tool {name}"}


ASSET_RX = re.compile(r"\b(?:P-101[AB]|P-201[AB]|M-101[AB]|SC-101[AB]|VM-101[AB]|SP-P0[12]|SP-M01|SP-VM01)\b")
