"""Caster operations: the app's write capabilities exposed as tools (an MCP-style registry).

The model calls these like any tool. Most app state (plant layouts, simulated statuses, PM assignments, spare
records) lives in the user's browser, so each call is forwarded to the app as an `op` event; the app runs it
through its own operation registry (app/src/ai/ops.ts), asking the user to confirm destructive ones.
"""
from __future__ import annotations

ASSET = {"type": "string", "description": "Asset tag, e.g. P-101B"}
PAGES = ["overview", "assets", "pm", "spares", "troubleshoot", "incidents", "rr", "knowledge"]


def _op(name: str, desc: str, props: dict | None = None, req: list[str] | None = None, confirm: bool = False) -> dict:
    return {"name": name, "confirm": confirm, "schema": {"type": "function", "function": {
        "name": name, "description": desc + (" Requires the user's confirmation in the app." if confirm else ""),
        "parameters": {"type": "object", "properties": props or {}, "required": req or []}}}}


OPS = [
    _op("open_page", "Navigate the app to a page, optionally focused on an asset.",
        {"page": {"type": "string", "enum": PAGES}, "asset_id": ASSET}, ["page"]),
    _op("create_plant", "Create a new, empty plant layout and switch to it.", {"name": {"type": "string"}}, ["name"]),
    _op("rename_plant", "Rename a plant layout.", {"plant": {"type": "string", "description": "Current plant name"},
                                                    "new_name": {"type": "string"}}, ["plant", "new_name"]),
    _op("switch_plant", "Switch the active plant layout.", {"plant": {"type": "string"}}, ["plant"]),
    _op("delete_plant", "Delete a plant layout permanently.", {"plant": {"type": "string"}}, ["plant"], confirm=True),
    _op("simulate_fault", "Simulate a fault (Shut Down) on an asset for what-if analysis.",
        {"asset_id": ASSET, "reason": {"type": "string"}}, ["asset_id"], confirm=True),
    _op("clear_fault", "Clear a simulated status on an asset (back to its recorded status).", {"asset_id": ASSET}, ["asset_id"]),
    _op("reset_simulation", "Clear every simulated status change.", {}, None, confirm=True),
    _op("switch_duty", "Make this asset the duty unit of its pair (its partner becomes standby).", {"asset_id": ASSET}, ["asset_id"], confirm=True),
    _op("assign_pm", "Assign (delegate) a PM task to a technician/operator code (MT-01..MT-04, OP-01, OP-02); empty assignee unassigns.",
        {"task_id": {"type": "string", "description": "e.g. PM-02"}, "asset_id": ASSET, "assignee": {"type": "string"}}, ["task_id", "assignee"]),
    _op("add_spare_part", "Add a spare part to the inventory.",
        {"part_name": {"type": "string"}, "fits_assets": {"type": "array", "items": {"type": "string"}},
         "qty_on_hand": {"type": "number"}, "min_qty": {"type": "number"}, "unit": {"type": "string"},
         "category": {"type": "string"}, "storage_location": {"type": "string"}, "lead_time_days": {"type": "number"},
         "unit_cost_php": {"type": "number"}, "critical": {"type": "boolean"}},
        ["part_name", "fits_assets", "qty_on_hand", "min_qty"]),
    _op("mark_spare_checked", "Record that a stored spare unit (SP-…) or spare part (SPP-…) was checked today.",
        {"id": {"type": "string"}}, ["id"]),
    _op("set_check_frequency", "Set how often a stored spare unit or spare part must be checked.",
        {"id": {"type": "string"}, "days": {"type": "integer"}}, ["id", "days"]),
    _op("start_troubleshoot", "Open the Troubleshoot page and start a session.",
        {"query": {"type": "string"}, "asset_id": ASSET}, ["query"]),
    _op("create_incident", "Draft and submit an incident report (the app drafts it with the incident writer, then submits). "
        "shut_down=true also sets the asset to Shut Down.",
        {"asset_id": ASSET, "observed": {"type": "string", "description": "What was observed"},
         "detected_by": {"type": "string", "enum": ["Trip", "Noise", "Leak observed", "Flow drop", "Rounds reading", "Inspection"]},
         "actions_taken": {"type": "string"}, "procedure_used": {"type": "string"}, "downtime_h": {"type": "number"},
         "shut_down": {"type": "boolean"}}, ["asset_id", "observed"], confirm=True),
    _op("delete_incident", "Delete an incident report that was submitted in GearCast (historical records cannot be deleted).",
        {"report_id": {"type": "string"}}, ["report_id"], confirm=True),
]
OP_BY_NAME = {o["name"]: o for o in OPS}
OP_SCHEMAS = [o["schema"] for o in OPS]

APP_STATE_SCHEMA = {"type": "function", "function": {
    "name": "get_app_state",
    "description": "The app's local state: plant layouts (names, active one), PM task assignments, spares added in the app, readiness-check records.",
    "parameters": {"type": "object", "properties": {}, "required": []}}}

PROMPT = """Operations: you can act in the app with the operation tools (open_page, create/rename/switch/delete_plant,
simulate_fault, clear_fault, reset_simulation, switch_duty, assign_pm, add_spare_part, mark_spare_checked,
set_check_frequency, start_troubleshoot, create_incident, delete_incident). Use them only when the user asks for an
action. Call get_app_state first when you need plant names or assignments. Operations run in the user's app; ones that
need confirmation show a Confirm button — say plainly what will happen and that it waits for their confirmation.
Never claim an operation is finished unless the tool result says so."""
