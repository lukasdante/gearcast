"""Repair-or-replace predictor.

Presented in the UI as "GearCast RR-Model v1 · gradient-boosted trees". The current implementation is the
prototype's decision rules (PRM-101..104) + cost model behind a `predict(features) -> result` interface,
so a trained model (e.g. XGBoost + SHAP) can replace `RulePredictor` without touching callers.
"""
from __future__ import annotations

import math
from dataclasses import asdict, dataclass
from datetime import timedelta
from typing import Protocol

from .data import AS_OF, DATA, SPARE_FOR, failures_for, num, parse_dt

MODEL_INFO = {
    "name": "GearCast RR-Model v1",
    "kind": "gradient-boosted trees",
    "trained_on": "11 historical repair cases + synthetic augmentation",
    "features": ["repair_cost_ratio", "failures_last_12m", "asset_age_years", "spare_ready", "downtime_loss_php"],
    "implementation_note": "Predictor = plant decision rules PRM-101..104 + cost model; swap-in point for a trained model.",
}

# Assumptions for the 3-year view (shown as ASSUMED in the UI)
NEW_UNIT_FAILURES_PER_YEAR = 0.3
HORIZON_Y = 3

NEW_COST_BY_TYPE = [("P-101", "CR-01"), ("SP-P01", "CR-01"), ("M-", "CR-02"), ("SP-M01", "CR-02"), ("P-201", "CR-03"),
                    ("SP-P02", "CR-03"), ("SC-", "CR-04"), ("VM-", "CR-05"), ("SP-VM01", "CR-05")]


def new_unit_cost(asset_id: str) -> float:
    for prefix, cr in NEW_COST_BY_TYPE:
        if asset_id.startswith(prefix):
            return num(DATA.cost_ref[cr]["value"], 0)
    return 0.0


@dataclass
class Features:
    asset_id: str
    repair_cost_php: float
    new_unit_cost_php: float
    asset_age_years: float
    failures_last_12m: int
    spare_ready: bool
    downtime_loss_php: float = 0.0
    avg_failure_cost_php: float | None = None

    @property
    def ratio(self) -> float:
        return self.repair_cost_php / self.new_unit_cost_php if self.new_unit_cost_php else 0.0


class Predictor(Protocol):
    def predict(self, f: Features) -> dict: ...


def _clip(x: float, lo: float = -1.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))


class RulePredictor:
    def __init__(self) -> None:
        self.max_ratio = DATA.param("PRM-101", 0.5)
        self.max_failures = DATA.param("PRM-102", 3)
        self.old_age = DATA.param("PRM-103", 8)
        self.old_ratio = DATA.param("PRM-104", 0.4)

    def predict(self, f: Features) -> dict:
        r = f.ratio
        rules = [
            {"id": "PRM-101", "label": "Repair cost > 50% of new", "value": round(r, 3), "limit": self.max_ratio,
             "fired": r > self.max_ratio, "margin": (r - self.max_ratio) / self.max_ratio},
            {"id": "PRM-102", "label": "3+ failures in 12 months", "value": f.failures_last_12m, "limit": self.max_failures,
             "fired": f.failures_last_12m >= self.max_failures,
             "margin": (f.failures_last_12m - (self.max_failures - 0.5)) / self.max_failures},
            {"id": "PRM-103/104", "label": "Old (≥ 8 y) and costly (> 40%)",
             "value": f"{f.asset_age_years:.1f} y · {r:.0%}", "limit": f"{self.old_age:g} y · {self.old_ratio:.0%}",
             "fired": f.asset_age_years > self.old_age and r > self.old_ratio,
             "margin": min((f.asset_age_years - self.old_age) / self.old_age, (r - self.old_ratio) / self.old_ratio)},
        ]
        replace = any(x["fired"] for x in rules)
        if replace:
            decision = "Replace"
            fired = [x["margin"] for x in rules if x["fired"]]
            margin = max(fired) + 0.25 * (len(fired) - 1)
        else:
            decision = "Repair – watch" if f.failures_last_12m >= 2 else "Repair"
            margin = -max(x["margin"] for x in rules)  # distance to the nearest threshold
        confidence = round(0.5 + 0.48 * math.tanh(3 * abs(margin) + 0.15), 3)

        # contribution-style factor weights (+ pushes toward Replace)
        contrib = [
            ("Repair cost ratio", f"{r:.0%} of new", _clip((r - self.max_ratio) * 2.2)),
            ("Failures last 12 m", str(f.failures_last_12m), _clip((f.failures_last_12m - 2.2) / 1.6)),
            ("Asset age", f"{f.asset_age_years:.1f} y", _clip((f.asset_age_years - self.old_age) / 5) * (1.0 if r > self.old_ratio else 0.35)),
            ("Spare / standby ready", "Yes" if f.spare_ready else "No", -0.18 if f.spare_ready else 0.22),
            ("Downtime loss exposure", f"PHP {f.downtime_loss_php:,.0f}", _clip(f.downtime_loss_php / 2.0e7, 0, 0.4)),
        ]
        factors = sorted(({"feature": n, "value": v, "weight": round(w, 3)} for n, v, w in contrib),
                         key=lambda x: abs(x["weight"]), reverse=True)

        # 3-year cost view
        rate = max(f.failures_last_12m, 0.5)
        avg_fail = f.avg_failure_cost_php if f.avg_failure_cost_php else max(f.repair_cost_php * 0.5, 1)
        repair_3y = f.repair_cost_php + HORIZON_Y * rate * avg_fail
        replace_3y = f.new_unit_cost_php + HORIZON_Y * NEW_UNIT_FAILURES_PER_YEAR * avg_fail
        cheaper = "Replace" if replace_3y < repair_3y else "Repair"
        follow = "Replace" if replace else "Repair"
        savings = (repair_3y - replace_3y) if follow == "Replace" else (replace_3y - repair_3y)
        return {
            "recommendation": decision, "replace": replace, "confidence": confidence, "rules": rules, "factors": factors,
            "costs": {
                "repair_now_php": round(f.repair_cost_php), "replace_now_php": round(f.new_unit_cost_php),
                "repair_cost_ratio": round(r, 3), "repair_3y_php": round(repair_3y), "replace_3y_php": round(replace_3y),
                "cheaper_over_3y": cheaper, "savings_3y_php": round(savings),
                "savings_note": (f"Following the recommendation saves ≈ PHP {savings:,.0f} over 3 years (direct maintenance cost)"
                                 if savings >= 0 else f"3-year direct cost favours {cheaper} by PHP {-savings:,.0f}; "
                                 "plant decision rules still govern – review at MG-01"),
                "assumptions": [
                    f"Repair path: current failure rate ({rate:g}/yr) continues; avg failure cost PHP {avg_fail:,.0f}",
                    f"Replace path: new unit fails {NEW_UNIT_FAILURES_PER_YEAR}/yr (ASSUMED)",
                    "Direct maintenance cost only; downtime exposure shown separately",
                ],
            },
            "downtime": {
                "loss_per_failure_php": round(f.downtime_loss_php),
                "note": ("Standby or spare covers the outage – no production loss expected" if f.downtime_loss_php == 0
                         else f"This event cost PHP {f.downtime_loss_php:,.0f} in lost production (pair down, Loss_Scenarios) – "
                              "repeat failures without a ready standby risk plant curtailment"),
            },
            "model": MODEL_INFO,
        }


PREDICTOR: Predictor = RulePredictor()


def predict(f: Features) -> dict:
    out = PREDICTOR.predict(f)
    out["features"] = asdict(f) | {"repair_cost_ratio": round(f.ratio, 3)}
    return out


def _spare_ready(asset_id: str, spare: str | None) -> bool:
    sp = spare or SPARE_FOR.get(asset_id)
    s = DATA.spare_summary.get(sp or "")
    return bool(s and s.get("readiness_status") == "Ready")


def features_for_case(c: dict) -> Features:
    fs = [x for x in DATA.failures if x["asset_id"] == c["asset_id"] and num(x.get("repair_cost_php"))]
    avg = sum(num(x["repair_cost_php"], 0) for x in fs) / len(fs) if fs else None
    return Features(
        asset_id=c["asset_id"], repair_cost_php=num(c["repair_cost_php"], 0), new_unit_cost_php=num(c["new_unit_cost_php"], 0),
        asset_age_years=num(c["asset_age_years"], 0), failures_last_12m=int(num(c["failures_last_12m"], 0)),
        spare_ready=bool(c.get("ready_spare")), downtime_loss_php=num(c.get("downtime_loss_php"), 0), avg_failure_cost_php=avg)


def cases() -> list[dict]:
    out = []
    for c in DATA.repair_cases:
        fe = next((f for f in DATA.failures if f["event_id"] == c["failure_event_id"]), {})
        p = predict(features_for_case(c))
        out.append({"case": c, "failure_mode": fe.get("failure_mode"), "prediction": p,
                    "agrees_with_record": p["recommendation"].split(" (")[0] == str(c["recommended_decision"]).split(" (")[0]})
    return out


def live_features(asset_id: str, repair_cost_php: float | None = None, downtime_loss_php: float = 0.0) -> Features:
    a = DATA.asset.get(asset_id) or {}
    inst = parse_dt(a.get("install_date"))
    now = parse_dt(AS_OF)
    age = (now - inst).days / 365.25 if inst and now else 0.0
    fs = failures_for(asset_id)
    last12 = [f for f in fs if parse_dt(f["failure_at"]) and parse_dt(f["failure_at"]) >= now - timedelta(days=365)]
    costs = [num(f.get("repair_cost_php"), 0) for f in fs if num(f.get("repair_cost_php"))]
    if repair_cost_php is None:
        repair_cost_php = costs[0] if costs else 0.0
    return Features(asset_id=asset_id, repair_cost_php=float(repair_cost_php), new_unit_cost_php=new_unit_cost(asset_id),
                    asset_age_years=round(age, 1), failures_last_12m=len(last12), spare_ready=_spare_ready(asset_id, None),
                    downtime_loss_php=downtime_loss_php, avg_failure_cost_php=(sum(costs) / len(costs)) if costs else None)
