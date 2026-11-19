"""Assistant agent: streaming tool-calling loop (SSE events)."""
from __future__ import annotations

import json
import time
from collections.abc import Iterator

from .data import AS_OF, DATA, StatusCtx
from .llm import MODEL, client
from .tools import TOOL_SCHEMAS, label_for, run_tool
from . import ops as appops

SYSTEM = f"""You are Caster, GearCast's assistant for the Head of Operations of the wastewater treatment plant (WWTP)
at a coconut processing plant (Franklin Baker – Darong). Tracked assets: transfer pumps P-101A/B (motors M-101A/B),
sump pumps P-201A/B, vibrating screens SC-101A/B (vibrator motors VM-101A/B), stored spares SP-P01, SP-P02, SP-M01,
SP-VM01. Data as of {AS_OF}.

Voice: friendly and informative, not chatty. Short, warm, plain sentences; no gushing; at most one light touch of
personality per reply; no emoji (one at most, rarely).

Facts:
- Use the tools for every fact. Never invent numbers, dates, stock levels or costs; quote them exactly as the tools
  return. If a tool has no data, say it is not recorded.
- Statuses include the user's simulated changes (flagged simulated) — treat them as the current situation.
- Backups: for a paired asset the backup is the partner unit (installed standby), then the stored spare.

Format when delivering information (markdown):
- One short lead sentence with the answer, then structured content.
- Use GFM tables for lists of assets, spares, PM tasks or cost comparisons (e.g. | Asset | Status | Backup | Ready |).
- Numbered steps for procedures or actions; short `###` headings only when there are several blocks.
- **Bold** key values; put asset tags and part/procedure ids in `code`.
- Money in PHP with thousands separators.
- End with a brief line: "Based on: …" naming the sources (asset tags, procedure ids, failure ids, manual pages).
- Keep it tight: no more than ~12 table rows and at most 4 short columns (the chat panel is narrow); no filler.

Do not narrate what you are about to do before calling tools — call them, then answer.

Actions: when useful, call propose_action together with your data tools or before writing the final answer to give the user one-click buttons (max 3): open_asset, open_troubleshoot,
draft_incident. Out of scope (not WWTP equipment/operations): say so briefly. Safety emergencies (injury, fire,
structural): tell them to call the supervisor / emergency response first."""

ACTION_TOOL = {"type": "function", "function": {
    "name": "propose_action",
    "description": "Show the user a button in the chat. kind=open_asset (asset_id), open_troubleshoot (query describing the symptom, asset_id), draft_incident (asset_id; only when an asset has failed or must be taken out of service).",
    "parameters": {"type": "object", "properties": {
        "kind": {"type": "string", "enum": ["open_asset", "open_troubleshoot", "draft_incident"]},
        "asset_id": {"type": "string"}, "query": {"type": "string"}, "label": {"type": "string", "description": "Short button text"}},
        "required": ["kind"]}}}


def sse(obj: dict) -> str:
    return f"data: {json.dumps(obj, default=str)}\n\n"


def run_chat(messages: list[dict], sim: dict | None, client_state: dict | None = None) -> Iterator[str]:
    ctx = StatusCtx.from_client(sim)
    convo: list[dict] = [{"role": "system", "content": SYSTEM + "\n\n" + appops.PROMPT}]
    if ctx.simulated:
        convo.append({"role": "system", "content": "Simulated status changes active: " + ", ".join(
            f"{a} → {ctx.own(a)}" for a in ctx.simulated)})
    for m in messages[-12:]:
        if m.get("role") in ("user", "assistant") and m.get("content"):
            convo.append({"role": m["role"], "content": str(m["content"])[:4000]})
    actions: list[dict] = []
    t0 = time.time()
    for _ in range(6):
        try:
            stream = client.chat.completions.create(model=MODEL, messages=convo, tools=TOOL_SCHEMAS + [ACTION_TOOL, appops.APP_STATE_SCHEMA] + appops.OP_SCHEMAS, stream=True,
                                                    max_tokens=1600, reasoning_effort="low")
            content, reasoning, calls = "", "", {}
            for ch in stream:
                if not ch.choices:
                    continue
                d = ch.choices[0].delta
                if getattr(d, "reasoning_content", None):
                    reasoning += d.reasoning_content
                if d.content:
                    content += d.content
                    yield sse({"type": "delta", "text": d.content})
                for tc in d.tool_calls or []:
                    c = calls.setdefault(tc.index, {"id": "", "name": "", "args": ""})
                    c["id"] = tc.id or c["id"]
                    if tc.function and tc.function.name:
                        c["name"] = tc.function.name
                    if tc.function and tc.function.arguments:
                        c["args"] += tc.function.arguments
        except Exception as e:  # noqa: BLE001
            yield sse({"type": "error", "message": f"Assistant unavailable ({type(e).__name__})."})
            break
        if not calls:
            break
        only_actions = all(c["name"] == "propose_action" or c["name"] in appops.OP_BY_NAME for c in calls.values())
        if content and not only_actions:  # interim narration before data tools: drop it from the visible answer
            yield sse({"type": "reset_text"})
        msg = {"role": "assistant", "content": content or None, "tool_calls": [
            {"id": c["id"], "type": "function", "function": {"name": c["name"], "arguments": c["args"] or "{}"}} for c in calls.values()]}
        if reasoning:
            msg["reasoning_content"] = reasoning
        convo.append(msg)
        for c in calls.values():
            try:
                args = json.loads(c["args"] or "{}")
            except json.JSONDecodeError:
                args = {}
            if c["name"] == "get_app_state":
                result = client_state or {"note": "No app state was sent."}
            elif c["name"] in appops.OP_BY_NAME:
                op = appops.OP_BY_NAME[c["name"]]
                yield sse({"type": "op", "id": c["id"], "name": c["name"], "args": args, "confirm": op["confirm"]})
                result = {"status": "awaiting_user_confirmation" if op["confirm"] else "sent_to_app",
                          "note": "Shown to the user with a Confirm button; not done until they confirm." if op["confirm"]
                          else "The app executes this immediately."}
            elif c["name"] == "propose_action":
                aid = (args.get("asset_id") or "").upper() or None
                if args.get("kind") and (aid is None or aid in DATA.asset) and len(actions) < 3:
                    actions.append({**args, "asset_id": aid})
                result = {"ok": True}
            else:
                yield sse({"type": "tool", "id": c["id"], "name": c["name"], "label": label_for(c["name"], args), "status": "start"})
                try:
                    result = run_tool(ctx, c["name"], args)
                except Exception as e:  # noqa: BLE001
                    result = {"error": f"{type(e).__name__}: {e}"}
                yield sse({"type": "tool", "id": c["id"], "name": c["name"], "label": label_for(c["name"], args), "status": "done"})
            convo.append({"role": "tool", "tool_call_id": c["id"], "content": json.dumps(result, default=str)[:12000]})
        if only_actions and content.strip():
            break  # answer already given; buttons attached — no need for another model turn
    if actions:
        yield sse({"type": "actions", "actions": actions})
    yield sse({"type": "done", "elapsed_s": round(time.time() - t0, 1)})
