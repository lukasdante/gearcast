"""In-memory plant data (from ref/prototype_data_extracted.json) + status logic ported from the frontend
(app/src/domain/status.ts). Read-only; the client's simulated overrides are applied per request."""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from datetime import datetime
from functools import lru_cache

from .config import DATA_JSON

AS_OF = "2026-10-31 23:59"
AS_OF_DATE = AS_OF[:10]


def num(v, default=None):
    if v is None or v == "":
        return default
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


@lru_cache(maxsize=1)
def _raw() -> dict:
    return json.loads(DATA_JSON.read_text())


class D:
    """Namespace for loaded tables (batch2 / G4 are typed; workbook mostly strings)."""

    def __init__(self) -> None:
        r = _raw()
        wb, b2, g4, fd = r["workbook"], r["batch2"], r["G4"], r["FORM_DATA"]
        self.equipment = g4["equipmentRegister"]
        self.asset = {a["asset_id"]: a for a in self.equipment}
        self.equipment_status = {s["asset_id"]: s for s in wb["equipmentStatus"]}
        self.duty_rotation = wb["dutyRotation"]
        self.nodes = {n["node_id"]: n for n in wb["nodes"]}
        self.pm_status = b2["pmStatus"]
        self.pm_tasks = {t["task_id"]: t for t in b2["pmTasks"]}
        self.failures = b2["failures"]
        self.work_orders = b2["workOrders"]
        self.parts_used = b2["partsUsed"]
        self.spares = b2["spareInventory"]
        self.spare_summary = {s["asset_id"]: s for s in g4["spareSummary"]}
        self.spare_readiness = b2["spareReadiness"]
        self.manual_rounds = b2["manualRounds"]
        self.daily_checks = b2["dailyChecks"]
        self.procedures = {p["procedure_id"]: p for p in b2["procedures"]}
        self.steps: dict[str, list] = {}
        for s in sorted(b2["procedureSteps"], key=lambda s: (s["procedure_id"], s["step_no"])):
            self.steps.setdefault(s["procedure_id"], []).append(s)
        self.figures: dict[str, list] = {}
        for f in sorted(b2["procedureFigures"], key=lambda f: f.get("show_order") or 0):
            self.figures.setdefault(f["procedure_id"], []).append(f)
        self.key_points: dict[str, list] = {}
        for k in sorted(b2["procedureKeyPoints"], key=lambda k: k["point_order"]):
            self.key_points.setdefault(k["procedure_id"], []).append(k)
        self.symptoms = {s["symptom_id"]: s for s in b2["symptoms"]}
        self.symptom_phrases = b2["symptomPhrases"]
        self.questions = {q["question_id"]: q for q in b2["diagnosticQuestions"]}
        self.status_history = g4["statusHistoryFull"]
        self.incident_reports = wb["incidentReports"]
        self.repair_cases = g4["repairCases"]
        self.cost_ref = {c["cost_id"]: c for c in g4["costReference"]}
        self.loss_scenarios = g4["lossScenariosFull"]
        self.curtail_lines = {c["line_id"]: c for c in g4["curtailmentLinesFull"]}
        self.suppliers = {s["supplier_id"]: s for s in g4["suppliers"]}
        self.params = {p["param_id"]: p for p in wb["parameters"]}
        self.plant_params = {p["param_id"]: p for p in wb["allPlantParameters"]}
        self.ir_template = fd["Incident_Report_Template"]
        self.response_records = fd["Response_Records"]

    def param(self, pid: str, default: float = 0.0) -> float:
        p = self.params.get(pid) or self.plant_params.get(pid)
        return num(p.get("value"), default) if p else default


DATA = D()

# ---------------------------------------------------------------- status logic (port of status.ts)
DOWN = {"Shut Down", "Under Maintenance", "Not Available"}
DRIVER_OF = {"P-101A": "M-101A", "P-101B": "M-101B", "SC-101A": "VM-101A", "SC-101B": "VM-101B"}
SPARE_FOR = {
    "P-101A": "SP-P01", "P-101B": "SP-P01", "P-201A": "SP-P02", "P-201B": "SP-P02",
    "M-101A": "SP-M01", "M-101B": "SP-M01", "VM-101A": "SP-VM01", "VM-101B": "SP-VM01",
}
GROUP_OF = [(r"^(P-101|M-101|SP-P01|SP-M01)", "Transfer pumps"), (r"^(P-201|SP-P02)", "Sump pumps"),
            (r"^(SC-|VM-|SP-VM01)", "Screens")]


def asset_group(asset_id: str) -> str | None:
    for rx, g in GROUP_OF:
        if re.match(rx, asset_id):
            return g
    return None


@dataclass
class StatusCtx:
    status: dict[str, dict] = field(default_factory=dict)
    roles: dict[str, dict] = field(default_factory=dict)
    simulated: list[str] = field(default_factory=list)

    @classmethod
    def from_client(cls, sim: dict | None) -> "StatusCtx":
        sim = sim or {}
        st = {k: dict(v) for k, v in DATA.equipment_status.items()}
        changed = []
        for aid, ov in (sim.get("overrides") or {}).items():
            if aid in st and isinstance(ov, dict) and ov.get("current_status"):
                if ov["current_status"] != st[aid]["current_status"]:
                    changed.append(aid)
                st[aid].update({k: ov[k] for k in ("current_status", "status_since") if k in ov})
                st[aid]["status_source"] = "Simulated"
        return cls(status=st, roles=sim.get("roleOverrides") or {}, simulated=changed)

    def own(self, aid: str) -> str:
        return (self.status.get(aid) or {}).get("current_status", "Not recorded")


def is_spare(aid: str) -> bool:
    return aid.startswith("SP-")


def get_status(ctx: StatusCtx, aid: str) -> str:
    a = DATA.asset.get(aid) or {}
    if a.get("parent_asset") and ctx.own(a["parent_asset"]) in DOWN:
        return "Stopped"
    drv = DRIVER_OF.get(aid)
    if drv and ctx.own(drv) in DOWN:
        return "Not Available"
    return ctx.own(aid)


def partner_of(aid: str) -> str | None:
    a = DATA.asset.get(aid)
    if not a or not a.get("pair_id"):
        return None
    for o in DATA.equipment:
        if o["asset_id"] != aid and o.get("pair_id") == a["pair_id"] and o["asset_type"] == a["asset_type"]:
            return o["asset_id"]
    return None


_ROT = sorted([r for r in DATA.duty_rotation if r["date"] <= AS_OF_DATE], key=lambda r: r["date"], reverse=True)


def rotation_role(ctx: StatusCtx, aid: str) -> str:
    a = DATA.asset.get(aid) or {}
    ov = ctx.roles.get(a.get("pair_id") or "")
    if ov:
        if ov.get("duty_asset") == aid:
            return "DUTY"
        if ov.get("standby_asset") == aid:
            return "STBY"
    if re.match(r"^M-101[AB]$", aid):
        return rotation_role(ctx, "P-101" + aid[-1])
    if a.get("parent_asset"):
        return rotation_role(ctx, a["parent_asset"])
    if is_spare(aid) or ctx.own(aid) == "In Storage":
        return "STORED"
    for r in _ROT:
        if aid in (r["duty_asset"], r["standby_asset"]):
            return "DUTY" if r["duty_asset"] == aid else "STBY"
    return "NONE"


def view(ctx: StatusCtx, aid: str) -> dict:
    a = DATA.asset.get(aid) or {}
    status = get_status(ctx, aid)
    role = rotation_role(ctx, aid)
    p = partner_of(aid)
    note = None
    if status in ("Shut Down", "Not Available"):
        level = "fault"
    elif status == "Under Maintenance":
        level = "maintenance"
    elif status == "Stopped":
        level = "stopped"
    elif status == "In Storage" or is_spare(aid):
        level = "stored"
    elif role == "STBY":
        level = "standby"
        if p and not a.get("parent_asset") and get_status(ctx, p) in DOWN:
            note = "START NEEDED – partner is down"
    else:
        level = "running"
    return {
        "asset_id": aid, "type": a.get("asset_type"), "description": a.get("description"),
        "status": status, "role": role, "level": level, "partner": p, "note": note,
        "simulated": aid in ctx.simulated, "status_since": (ctx.status.get(aid) or {}).get("status_since"),
    }


def is_down(ctx: StatusCtx, aid: str) -> bool:
    return get_status(ctx, aid) in DOWN


# ---------------------------------------------------------------- helpers
def expand_targets(target: str) -> list[str]:
    """'P-101A/B' -> ['P-101A','P-101B']; 'P-101A; SP-P01' -> list."""
    out = []
    for t in re.split(r"[;,]\s*", target or ""):
        t = t.strip()
        m = re.match(r"^(.*?)([A-Z])/([A-Z])$", t)
        out += [m.group(1) + m.group(2), m.group(1) + m.group(3)] if m else ([t] if t else [])
    return out


def parse_dt(s: str | None) -> datetime | None:
    if not s:
        return None
    s = str(s).replace("T", " ")
    for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            return datetime.strptime(s[:16] if " " in s else s[:10], fmt)
        except ValueError:
            continue
    return None


def money(v) -> str:
    v = num(v)
    return "Not recorded" if v is None else f"PHP {v:,.0f}"


def fmt_date(s: str | None, with_time: bool = False) -> str:
    d = parse_dt(s)
    if not d:
        return s or "Not recorded"
    base = d.strftime("%a ") + str(d.day) + d.strftime(" %b %Y")
    return f"{base}, {d.strftime('%H:%M')}" if with_time and re.search(r"\d{2}:\d{2}", str(s)) else base


def failures_for(aid: str, since_install: bool = True) -> list[dict]:
    inst = (DATA.asset.get(aid) or {}).get("install_date") or "0000"
    rows = [f for f in DATA.failures if f["asset_id"] == aid and (not since_install or f["failure_at"][:10] >= inst[:10])]
    return sorted(rows, key=lambda f: f["failure_at"], reverse=True)


def procedure_for_text(text: str | None) -> dict | None:
    m = re.search(r"\b([A-Z]{2}-\d{2})\b", str(text or "").upper())
    return DATA.procedures.get(m.group(1)) if m else None
