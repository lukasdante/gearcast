/** Caster assistant: streaming tool-calling loop with SSE events (port of backend chat.py + ops.py). */
import { CLOCK, D, StatusCtx } from './data';
import { TOOL_SCHEMAS, labelFor, runTool } from './tools';
import { chatCompletions } from './llm';
import { dumps, pyRound } from './py';
import type { Env } from './env';

// ------------------------------------------------------------------ app operations (ops.py)
const ASSET = { type: 'string', description: 'Asset tag, e.g. P-101B' };
const PAGES = ['overview', 'assets', 'pm', 'spares', 'troubleshoot', 'incidents', 'rr', 'knowledge'];
const op = (name: string, desc: string, props: any = {}, req: string[] = [], confirm = false) => ({ name, confirm, schema: { type: 'function', function: {
  name, description: desc + (confirm ? " Requires the user's confirmation in the app." : ''), parameters: { type: 'object', properties: props, required: req } } } });
const OPS = [
  op('open_page', 'Navigate the app to a page, optionally focused on an asset.', { page: { type: 'string', enum: PAGES }, asset_id: ASSET }, ['page']),
  op('create_plant', 'Create a new, empty plant layout and switch to it.', { name: { type: 'string' } }, ['name']),
  op('rename_plant', 'Rename a plant layout.', { plant: { type: 'string', description: 'Current plant name' }, new_name: { type: 'string' } }, ['plant', 'new_name']),
  op('switch_plant', 'Switch the active plant layout.', { plant: { type: 'string' } }, ['plant']),
  op('delete_plant', 'Delete a plant layout permanently.', { plant: { type: 'string' } }, ['plant'], true),
  op('simulate_fault', 'Simulate a fault (Shut Down) on an asset for what-if analysis.', { asset_id: ASSET, reason: { type: 'string' } }, ['asset_id'], true),
  op('clear_fault', 'Clear a simulated status on an asset (back to its recorded status).', { asset_id: ASSET }, ['asset_id']),
  op('reset_simulation', 'Clear every simulated status change.', {}, [], true),
  op('switch_duty', 'Make this asset the duty unit of its pair (its partner becomes standby).', { asset_id: ASSET }, ['asset_id'], true),
  op('assign_pm', 'Assign (delegate) a PM task to a technician, engineer or plant supervisor code (MT-01..MT-04, EN-01, EN-02, PS-01, PS-02); empty assignee unassigns.',
    { task_id: { type: 'string', description: 'e.g. PM-02' }, asset_id: ASSET, assignee: { type: 'string' } }, ['task_id', 'assignee']),
  op('add_spare_part', 'Add a spare part to the inventory.',
    { part_name: { type: 'string' }, fits_assets: { type: 'array', items: { type: 'string' } }, qty_on_hand: { type: 'number' }, min_qty: { type: 'number' },
      unit: { type: 'string' }, category: { type: 'string' }, storage_location: { type: 'string' }, lead_time_days: { type: 'number' },
      unit_cost_php: { type: 'number' }, critical: { type: 'boolean' } }, ['part_name', 'fits_assets', 'qty_on_hand', 'min_qty']),
  op('mark_spare_checked', 'Record that a stored spare unit (SP-…) or spare part (SPP-…) was checked today.', { id: { type: 'string' } }, ['id']),
  op('set_check_frequency', 'Set how often a stored spare unit or spare part must be checked.', { id: { type: 'string' }, days: { type: 'integer' } }, ['id', 'days']),
  op('start_troubleshoot', 'Open the Troubleshoot page and start a session.', { query: { type: 'string' }, asset_id: ASSET }, ['query']),
  op('create_incident', 'Draft and submit an incident report (the app drafts it with the incident writer, then submits). shut_down=true also sets the asset to Shut Down.',
    { asset_id: ASSET, observed: { type: 'string', description: 'What was observed' },
      detected_by: { type: 'string', enum: ['Trip', 'Noise', 'Leak observed', 'Flow drop', 'Rounds reading', 'Inspection'] },
      actions_taken: { type: 'string' }, procedure_used: { type: 'string' }, downtime_h: { type: 'number' }, shut_down: { type: 'boolean' } }, ['asset_id', 'observed'], true),
  op('delete_incident', 'Delete an incident report that was submitted in GearCast (historical records cannot be deleted).', { report_id: { type: 'string' } }, ['report_id'], true),
];
const OP_BY_NAME: Record<string, any> = Object.fromEntries(OPS.map(o => [o.name, o]));
const OP_SCHEMAS = OPS.map(o => o.schema);
const APP_STATE_SCHEMA = { type: 'function', function: { name: 'get_app_state',
  description: "The app's local state: plant layouts (names, active one), PM task assignments, spares added in the app, readiness-check records.",
  parameters: { type: 'object', properties: {}, required: [] } } };
const OPS_PROMPT = `Operations: you can act in the app with the operation tools (open_page, create/rename/switch/delete_plant,
simulate_fault, clear_fault, reset_simulation, switch_duty, assign_pm, add_spare_part, mark_spare_checked,
set_check_frequency, start_troubleshoot, create_incident, delete_incident). Use them only when the user asks for an
action. Call get_app_state first when you need plant names or assignments. Operations run in the user's app; ones that
need confirmation show a Confirm button — say plainly what will happen and that it waits for their confirmation.
Never claim an operation is finished unless the tool result says so.
When a user message says a photo is attached and the user asks for an incident report, call create_incident: the app
adds the photo as Photo 1 of the report (you cannot see the photo; rely on the user's description for "observed").
Operations the user's role may not run come back as "Not allowed"; tell them who can do it.`;

const system = (asOf: string) => `You are Caster, GearCast's assistant for the Head of Operations of the wastewater treatment plant (WWTP)
at a coconut processing plant (Franklin Baker – Darong). Tracked assets: transfer pumps P-101A/B (motors M-101A/B),
sump pumps P-201A/B, vibrating screens SC-101A/B (vibrator motors VM-101A/B), stored spares SP-P01, SP-P02, SP-M01,
SP-VM01. Data as of ${asOf}.

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
- Numbered steps for procedures or actions; short \`###\` headings only when there are several blocks.
- **Bold** key values; put asset tags and part/procedure ids in \`code\`.
- Money in PHP with thousands separators.
- End with a brief line: "Based on: …" naming the sources (asset tags, procedure ids, failure ids, manual pages).
- Keep it tight: no more than ~12 table rows and at most 4 short columns (the chat panel is narrow); no filler.

Do not narrate what you are about to do before calling tools — call them, then answer.

Actions: when useful, call propose_action together with your data tools or before writing the final answer to give the user one-click buttons (max 3): open_asset, open_troubleshoot,
draft_incident, open_repair_replace. Out of scope (not WWTP equipment/operations): say so briefly. Safety emergencies (injury, fire,
structural): tell them to call the supervisor / emergency response first.`;

const ACTION_TOOL = { type: 'function', function: {
  name: 'propose_action',
  description: 'Show the user a button in the chat. kind=open_asset (asset_id), open_troubleshoot (query describing the symptom, asset_id), draft_incident (asset_id; only when an asset has failed or must be taken out of service), open_repair_replace (asset_id; opens the repair-or-replace decision for that asset).',
  parameters: { type: 'object', properties: {
    kind: { type: 'string', enum: ['open_asset', 'open_troubleshoot', 'draft_incident', 'open_repair_replace'] },
    asset_id: { type: 'string' }, query: { type: 'string' }, label: { type: 'string', description: 'Short button text' } }, required: ['kind'] } } };

const sse = (o: any) => `data: ${JSON.stringify(o)}\n\n`;

/** Parse an OpenAI-style SSE stream; yields the chunk objects of each network read as one batch (linear time). */
async function* batches(r: Response): AsyncGenerator<any[]> {
  const dec = new TextDecoder();
  let rest = '';
  for await (const value of slices(r.body!)) {
    const lines = (rest + dec.decode(value, { stream: true })).split('\n');
    rest = lines.pop() ?? '';
    const out: any[] = [];
    let end = false;
    for (const l of lines) {
      if (!l.startsWith('data:')) continue;
      const data = l.slice(5).trim();
      if (data === '[DONE]') { end = true; break; }
      try { out.push(JSON.parse(data)); } catch { /* keep-alive / partial */ }
    }
    if (out.length) yield out;
    if (end) return;
  }
}

/** Network bytes in slices of >= 4 KB (BYOB readAtLeast, a Workers extension): each JS-side read() costs ~0.1 ms of
 * CPU, and a reasoning model streams hundreds of tiny chunks, so per-chunk reads alone would exceed the free plan's
 * CPU budget. Text still reaches the client in small bursts (every ~100–200 ms). */
async function* slices(body: ReadableStream<Uint8Array>): AsyncGenerator<Uint8Array> {
  let reader: any;
  try { reader = (body as any).getReader({ mode: 'byob' }); } catch { reader = null; }
  if (!reader || typeof reader.readAtLeast !== 'function') {
    if (reader) reader.releaseLock();
    const rd = body.getReader();
    for (;;) { const { done, value } = await rd.read(); if (done) return; yield value; }
  }
  let buf = new ArrayBuffer(64 * 1024);
  for (;;) {
    const { done, value } = await reader.readAtLeast(4096, new Uint8Array(buf));
    if (value && value.byteLength) { yield value.slice(); buf = value.buffer; }
    if (done) return;
  }
}

export function runChat(env: Env, messages: any[], sim: any, clientState: any): ReadableStream {
  const { readable, writable } = new TransformStream();
  const w = writable.getWriter();
  const enc = new TextEncoder();
  const emit = (o: any) => w.write(enc.encode(sse(o)));
  (async () => {
    const ctx = StatusCtx.fromClient(sim);
    const convo: any[] = [{ role: 'system', content: system(CLOCK.asOf) + '\n\n' + OPS_PROMPT }];
    if (ctx.simulated.length) convo.push({ role: 'system', content: 'Simulated status changes active: ' + ctx.simulated.map(a => `${a} → ${ctx.own(a)}`).join(', ') });
    for (const m of (messages || []).slice(-12)) if (['user', 'assistant'].includes(m?.role) && m.content) convo.push({ role: m.role, content: String(m.content).slice(0, 4000) });
    const actions: any[] = [];
    const t0 = Date.now();
    for (let turn = 0; turn < 6; turn++) {
      let content = '', reasoning = '';
      const calls = new Map<number, { id: string; name: string; args: string }>();
      try {
        const r = await chatCompletions(env, { messages: convo, tools: [...TOOL_SCHEMAS, ACTION_TOOL, APP_STATE_SCHEMA, ...OP_SCHEMAS], stream: true, max_tokens: 1600, reasoning_effort: 'low' });
        for await (const batch of batches(r)) {
          let text = '';
          for (const ch of batch) {
            if (!ch.choices || !ch.choices.length) continue;
            const d = ch.choices[0].delta || {};
            if (d.reasoning_content) reasoning += d.reasoning_content;
            if (d.content) { content += d.content; text += d.content; }
            for (const tc of d.tool_calls || []) {
              const c = calls.get(tc.index) || { id: '', name: '', args: '' };
              calls.set(tc.index, c);
              c.id = tc.id || c.id;
              if (tc.function?.name) c.name = tc.function.name;
              if (tc.function?.arguments) c.args += tc.function.arguments;
            }
          }
          if (text) await emit({ type: 'delta', text }); // deltas of one network read coalesced (same event shape)
        }
      } catch (e: any) {
        await emit({ type: 'error', message: `Assistant unavailable (${e?.kind || e?.name || 'Error'}).` });
        break;
      }
      if (!calls.size) break;
      const list = [...calls.values()];
      const onlyActions = list.every(c => c.name === 'propose_action' || c.name in OP_BY_NAME);
      if (content && !onlyActions) await emit({ type: 'reset_text' });
      const msg: any = { role: 'assistant', content: content || null, tool_calls: list.map(c => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.args || '{}' } })) };
      if (reasoning) msg.reasoning_content = reasoning;
      convo.push(msg);
      for (const c of list) {
        let args: any;
        try { args = JSON.parse(c.args || '{}'); } catch { args = {}; }
        let result: any;
        if (c.name === 'get_app_state') result = clientState || { note: 'No app state was sent.' };
        else if (c.name in OP_BY_NAME) {
          const o = OP_BY_NAME[c.name];
          await emit({ type: 'op', id: c.id, name: c.name, args, confirm: o.confirm });
          result = { status: o.confirm ? 'awaiting_user_confirmation' : 'sent_to_app',
            note: o.confirm ? 'Shown to the user with a Confirm button; not done until they confirm.' : 'The app executes this immediately.' };
        } else if (c.name === 'propose_action') {
          const aid = String(args.asset_id || '').toUpperCase() || null;
          if (args.kind && (aid === null || aid in D.asset) && actions.length < 3) actions.push({ ...args, asset_id: aid });
          result = { ok: true };
        } else {
          await emit({ type: 'tool', id: c.id, name: c.name, label: labelFor(c.name, args), status: 'start' });
          try { result = await runTool(env, ctx, c.name, args); } catch (e: any) { result = { error: `${e?.name || 'Error'}: ${e?.message || e}` }; }
          await emit({ type: 'tool', id: c.id, name: c.name, label: labelFor(c.name, args), status: 'done' });
        }
        convo.push({ role: 'tool', tool_call_id: c.id, content: dumps(result).slice(0, 12000) });
      }
      if (onlyActions && content.trim()) break;
    }
    if (actions.length) await emit({ type: 'actions', actions });
    await emit({ type: 'done', elapsed_s: pyRound((Date.now() - t0) / 1000, 1) });
  })().catch(async e => { try { await emit({ type: 'error', message: `Assistant unavailable (${e?.name || 'Error'}).` }); await emit({ type: 'done', elapsed_s: 0 }); } catch { /* closed */ } })
    .finally(() => w.close().catch(() => {}));
  return readable;
}
