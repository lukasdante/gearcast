"""Apply ref/data_patches/pump_areas.json (3 pumping areas, 6 transfer pumps; placeholder until the raw data update)
to the app's plant.json and the Worker's generated data.json. Idempotent; build_data.py calls patch_data() too.

    python3 worker/scripts/apply_pump_areas.py
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PATCH = ROOT / "ref" / "data_patches" / "pump_areas.json"


def _upsert(rows: list, new: list, key: str = "asset_id") -> None:
    have = {r[key]: i for i, r in enumerate(rows)}
    for r in new:
        if r[key] in have: rows[have[r[key]]] = r
        else: rows.append(r)


def _rotation(rows: list, patch: dict, template_pair: str = "PR-TRANSFER") -> None:
    """Duty rotation for the new pairs: same daily A/B pattern as the transfer pumps."""
    tmpl = [r for r in rows if r["pair_id"] == template_pair]
    pairs = {a["pair_id"]: a["assets"] for a in patch["areas"]}
    rows[:] = [r for r in rows if r["pair_id"] not in pairs]
    for pair, (a, b) in pairs.items():
        for r in tmpl:
            duty_a = r["duty_asset"].endswith("A")
            rows.append({**r, "pair_id": pair, "duty_asset": a if duty_a else b, "standby_asset": b if duty_a else a, "remarks": None})


def _tags(nodes: list, patch: dict) -> None:
    for n in nodes:
        add = patch["node_tags"].get(n["node_id"])
        if not add: continue
        cur = [t.strip() for t in (n.get("equipment_tags") or "").split(";") if t.strip()]
        n["equipment_tags"] = "; ".join(cur + [t for t in add if t not in cur])


def _qr_tags(tags: list, patch: dict) -> None:
    """QR tags for the new pumps (same label spec as the existing transfer pumps; placeholder until the raw data update)."""
    tmpl = next((t for t in tags if t["asset_id"] == "P-101A"), {})
    new = [{**tmpl, "tag_id": e.get("qr_tag_id") or f"QR-{e['asset_id']}", "asset_id": e["asset_id"], "qr_payload": f"gearcast://asset/{e['asset_id']}",
            "location_node": e.get("location_node"), "installed_date": None, "last_verified": None, "basis": e.get("basis")} for e in patch["equipment"]]
    _upsert(tags, new, "tag_id")


def patch_data(data: dict, patch: dict | None = None) -> dict:
    patch = patch or json.loads(PATCH.read_text())
    _upsert(data["equipment"], patch["equipment"])
    _upsert(data["equipmentStatus"], patch["equipmentStatus"])
    _rotation(data["dutyRotation"], patch)
    _tags(data["nodes"], patch)
    if "qrTags" in data:  # Worker data.json only (the app reads tags from /api/qr/tags)
        _qr_tags(data["qrTags"], patch)
    return data


def main() -> None:
    patch = json.loads(PATCH.read_text())
    for path in (ROOT / "app" / "src" / "data" / "plant.json", ROOT / "worker" / "src" / "generated" / "data.json"):
        d = json.loads(path.read_text())
        patch_data(d, patch)
        path.write_text(json.dumps(d, ensure_ascii=path.name == "plant.json", separators=(",", ":")))
        print(f"patched {path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
