"""Deterministic cost + production-loss model (port of the prototype's q3RepairCost / q3CostEstimate /
q3ReportLossText). All money comes from Loss_Scenarios, Curtailment_Lines, Cost_Reference and parameters."""
from __future__ import annotations

import re

from .data import DATA, StatusCtx, asset_group, is_down, num, partner_of, procedure_for_text


def repair_cost(procedure_text: str | None) -> dict:
    p = procedure_for_text(procedure_text)
    if not p:
        return {"procedure_id": None, "unknown_procedure": bool(str(procedure_text or "").strip()),
                "labour": 0.0, "parts": 0.0, "part_rows": [], "repair": 0.0}
    electrician = bool(re.search(r"electrical|motor", f"{p.get('category', '')} {p.get('skills', '')}", re.I))
    rate = DATA.param("PRM-111" if electrician else "PRM-110")
    labour = (num(p.get("crew_size"), 0) or 0) * (num(p.get("est_time_h"), 0) or 0) * rate
    parts, rows = 0.0, []
    for pid in re.findall(r"SPP-\d{3}", str(p.get("parts") or "")):
        sp = next((x for x in DATA.spares if x["part_id"] == pid), None)
        if not sp:
            continue
        cost = num(sp.get("unit_cost_php"), 0) or 0
        emergency = (num(sp.get("qty_on_hand"), 0) or 0) == 0
        if emergency:
            cost = cost * (1 + DATA.param("PRM-114")) + DATA.param("PRM-115")
        parts += cost
        rows.append({"part_id": pid, "name": sp["part_name"], "stock": sp.get("qty_on_hand"), "cost_php": round(cost),
                     "emergency": emergency})
    return {"procedure_id": p["procedure_id"], "unknown_procedure": False, "labour": round(labour), "parts": round(parts),
            "part_rows": rows, "repair": round(labour + parts)}


def default_outage_h(asset_id: str) -> float:
    g = asset_group(asset_id)
    return 4 if g == "Screens" else 3 if g == "Sump pumps" else 8


def scenario_loss(group: str | None, hours: float) -> dict:
    """Plant production loss when a whole pair (group) is down `hours` with no standby (Loss_Scenarios, Average inflow)."""
    rows = [x for x in DATA.loss_scenarios if x["asset_group"] == group and not x["standby_ready"] and x["inflow_case"] == "Average"]
    rows.sort(key=lambda x: abs(num(x["outage_h"], 0) - hours))
    sc = next((x for x in rows if num(x["outage_h"]) == hours), rows[0] if rows else None)
    if not sc:
        return {"scenario": None, "production": 0.0, "note": "No matching Loss_Scenarios row"}
    daily = DATA.param("PRM-006")
    cr16 = num(DATA.cost_ref.get("CR-16", {}).get("value"), 3000)
    lines = [DATA.curtail_lines[i.strip()] for i in str(sc.get("lines_curtailed") or "").split(";") if i.strip() in DATA.curtail_lines]
    lines.sort(key=lambda x: x["curtail_order"])
    restart_time_loss = sum(num(x["revenue_share"], 0) * num(x["restart_time_h"], 0) * daily / 24 for x in lines)
    buffer = num(sc.get("buffer_h"), 0) or 0
    exact = num(sc["outage_h"]) == hours
    if exact:
        production = num(sc.get("total_loss_php"), 0)
        lost_rev = num(sc.get("lost_revenue_php"), 0)
        restart = num(sc.get("restart_cost_php"), 0)
        fine = num(sc.get("fine_php"), 0)
        overtime = num(sc.get("overtime_php"), cr16 * hours)
        beyond = num(sc.get("hours_beyond_buffer"), max(0, hours - buffer))
        base = lost_rev - restart_time_loss
    else:
        beyond = max(0.0, hours - buffer)
        share = num(sc.get("revenue_lost_share")) or sum(num(x["revenue_share"], 0) for x in lines)
        base = share * beyond / 24 * daily
        restart = num(sc.get("restart_cost_php")) or sum(num(x["restart_cost_php"], 0) for x in lines)
        fine = num(sc.get("fine_php"), 0)
        overtime = cr16 * hours
        lost_rev = base + restart_time_loss
        production = lost_rev + restart + fine + overtime
    buffer_text = ("No buffer – screens are upstream of the EQ tank; plant stops immediately" if group == "Screens"
                   else "EQ buffer ≈ 2.5 h" if group == "Transfer pumps" else f"Sump buffer ≈ {buffer:.2f} h")
    return {
        "scenario": sc["scenario_id"], "scenario_title": sc["title"], "exact_scenario": exact, "outage_h": hours,
        "buffer_h": buffer, "buffer_text": buffer_text, "hours_beyond_buffer": round(beyond, 2),
        "lines_curtailed": [x["line_name"] for x in lines], "response": sc.get("response"),
        "lost_revenue": round(lost_rev), "base_loss": round(base), "restart_time_loss": round(restart_time_loss),
        "restart_cost": round(restart), "fine": round(fine), "overtime": round(overtime), "production": round(production),
    }


def cost_estimate(ctx: StatusCtx, asset_id: str, hours: float | None = None, procedure_text: str = "",
                  force_down: bool = False) -> dict:
    hours = float(hours if hours is not None else default_outage_h(asset_id))
    partner = partner_of(asset_id)
    own_down = force_down or is_down(ctx, asset_id)
    partner_down = bool(partner) and is_down(ctx, partner)
    pair_down = bool(partner) and own_down and partner_down
    group = asset_group(asset_id)
    rep = repair_cost(procedure_text)
    loss = scenario_loss(group, hours) if pair_down else None
    production = loss["production"] if loss else 0
    if pair_down:
        explanation = f"PHP {production:,.0f} – both {(group or 'units').lower()} down {hours:.1f} h ({loss.get('scenario') or 'loss scenario'})"
    elif partner:
        explanation = f"PHP 0 – standby {partner} available (start within buffer)"
    else:
        explanation = "PHP 0 – no paired unit; no plant loss modelled"
    return {
        "asset_id": asset_id, "group": group, "partner": partner, "standby_ready": bool(partner) and not partner_down,
        "own_down": own_down, "partner_down": partner_down, "pair_down": pair_down, "outage_h": hours,
        "loss": loss, "production_loss": production, "labour": rep["labour"], "parts": rep["parts"],
        "part_rows": rep["part_rows"], "repair": rep["repair"], "procedure_id": rep["procedure_id"],
        "unknown_procedure": rep["unknown_procedure"], "total": round(production + rep["repair"]),
        "explanation": explanation,
    }
