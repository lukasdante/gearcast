/** Approval queue (MVP Changes RBAC): records a technician files that only count once a Plant Supervisor or Engineer
 *  approves them — PM findings (tablet form or scanned job sheet), deployment of a major spare (pump, motor, stored
 *  unit), and an Engineer's plant-layout edits (Plant Supervisor only). Records by reviewers are approved at once. */
import type { Env } from './env';
import type { User } from './auth';
import { REVIEWERS, can, MAJOR_SPARE } from './rbac';
import { D, nowStr } from './data';

export type Kind = 'pm_findings' | 'spare_deploy' | 'layout_change';
export const KINDS: Kind[] = ['pm_findings', 'spare_deploy', 'layout_change'];
export interface Approval {
  id: string; kind: Kind; status: 'pending' | 'approved' | 'rejected'; title: string; payload: any;
  file: { type: string; name: string; bytes: number } | null;
  created_by: string; created_role: string; created_at: string;
  reviewed_by: string | null; reviewed_at: string | null; review_note: string | null;
}
export class ApprovalError extends Error { constructor(public status: number, msg: string) { super(msg); } }

export const MAX_SCAN_BYTES = 8 * 1024 * 1024;
export const fileKey = (id: string) => `approvals/${id}`;

const str = (v: any, n = 2000) => String(v ?? '').slice(0, n);
const bool = (v: any) => v === true || v === 'true' || v === '1' || v === 1;

/** Validate and normalise the payload of each kind (only known fields are kept). */
function clean(kind: Kind, p: any): { title: string; payload: any } {
  if (!p || typeof p !== 'object') throw new ApprovalError(422, 'payload required');
  if (kind === 'pm_findings') {
    const status_id = str(p.status_id, 40);
    // task and asset come from the PM schedule, not from the client
    const pm = D.pmStatus.find((r: any) => r.status_id === status_id);
    if (!pm) throw new ApprovalError(422, `Unknown PM task ${status_id || '(status_id required)'}`);
    const task_id = String(pm.task_id), asset_id = String(pm.asset_id);
    const done_at = /^\d{4}-\d{2}-\d{2}/.test(str(p.done_at)) ? str(p.done_at, 16) : nowStr();
    if (done_at.slice(0, 10) > nowStr().slice(0, 10)) throw new ApprovalError(422, 'done_at cannot be in the future');
    const readings = (Array.isArray(p.readings) ? p.readings : []).slice(0, 12).map((r: any) => ({
      label: str(r?.label, 60), unit: str(r?.unit, 12), value: r?.value === '' || r?.value == null || !Number.isFinite(Number(r.value)) ? null : Number(r.value) }))
      .filter((r: any) => r.label && r.value !== null);
    const checklist = (Array.isArray(p.checklist) ? p.checklist : []).slice(0, 40).map((c: any) => ({ item: str(c?.item, 300), result: ['ok', 'not_ok', 'na'].includes(c?.result) ? c.result : 'na', note: str(c?.note, 300) }));
    return {
      title: `${task_id} ${asset_id} – PM findings`,
      payload: { status_id, task_id, asset_id, task: String(pm.task ?? str(p.task, 200)), done_at, mode: p.mode === 'scan' ? 'scan' : 'form', checklist, readings,
        measurements: str(p.measurements), findings: str(p.findings), parts_used: str(p.parts_used, 500), hours: Number(p.hours) || null,
        followup: bool(p.followup), followup_note: str(p.followup_note, 500) },
    };
  }
  if (kind === 'spare_deploy') {
    const item_id = str(p.item_id, 40).toUpperCase(), qty = Math.max(1, Math.round(Number(p.qty) || 1));
    if (!item_id) throw new ApprovalError(422, 'item_id required');
    // major/accessory is decided from the server's spare register (a client cannot relabel a pump part as a valve);
    // only parts added in the app (not in the register) fall back to the category the client sends
    const known = D.spares.find((x: any) => String(x.part_id).toUpperCase() === item_id);
    const category = known ? String(known.category ?? '') : str(p.category, 60);
    return {
      title: `Deploy ${qty} × ${item_id}${p.asset_id ? ` → ${str(p.asset_id, 40).toUpperCase()}` : ''}`,
      payload: { item_id, name: known ? String(known.part_name) : str(p.name, 200), category, qty, asset_id: str(p.asset_id, 40).toUpperCase() || null, reason: str(p.reason, 500),
        major: MAJOR_SPARE(category, item_id) || (!known && !category) },
    };
  }
  // layout_change
  const plant_id = str(p.plant_id, 80);
  if (!plant_id || !p.doc || typeof p.doc !== 'object') throw new ApprovalError(422, 'plant_id and doc required');
  const doc = JSON.stringify(p.doc);
  if (doc.length > 900_000) throw new ApprovalError(413, 'layout too large');
  return { title: `Layout change – ${str(p.plant_name || p.doc.name, 120) || plant_id}`, payload: { plant_id, plant_name: str(p.plant_name || p.doc.name, 120), note: str(p.note, 500), doc: p.doc } };
}

/** Does this record need a reviewer, given who files it? */
function needsReview(kind: Kind, u: User, payload: any): boolean {
  if (kind === 'layout_change') return !can(u.role, 'layout.publish');
  if (kind === 'spare_deploy') return !!payload.major && !can(u.role, 'spare.deploy.major');
  return !can(u.role, 'approve'); // pm_findings
}

const row2 = (r: any): Approval => ({
  id: r.id, kind: r.kind, status: r.status, title: r.title, payload: JSON.parse(r.payload),
  file: r.file_type ? { type: r.file_type, name: r.file_name, bytes: r.file_bytes } : null,
  created_by: r.created_by, created_role: r.created_role, created_at: r.created_at,
  reviewed_by: r.reviewed_by, reviewed_at: r.reviewed_at, review_note: r.review_note,
});

export async function list(env: Env, kind: string | null, status: string | null, light = false): Promise<Approval[]> {
  const where: string[] = [], args: any[] = [];
  if (kind) { where.push('kind = ?'); args.push(kind); }
  if (status) { where.push('status = ?'); args.push(status); }
  const rs = await env.DB.prepare(`SELECT * FROM approvals ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY seq DESC LIMIT 500`).bind(...args).all();
  const out = (rs.results as any[]).map(row2);
  if (light) for (const a of out) if (a.kind === 'layout_change') a.payload = { ...a.payload, doc: undefined };
  return out;
}

export async function get(env: Env, id: string): Promise<Approval | null> {
  const r = await env.DB.prepare('SELECT * FROM approvals WHERE id = ?').bind(id).first<any>();
  return r ? row2(r) : null;
}

export interface FileMeta { type: string; name: string; bytes: number }
export const MAX_PHOTOS = 6, MAX_PHOTO_BYTES = 4 * 1024 * 1024;
export const photoKey = (id: string, n: number) => `approvals/${id}/photo/${n}`;

export async function create(env: Env, u: User, kind: string, payload: any, file: FileMeta | null, photos: FileMeta[] = []): Promise<Approval> {
  if (!KINDS.includes(kind as Kind)) throw new ApprovalError(422, `kind must be one of ${KINDS.join(', ')}`);
  if (kind === 'layout_change' && !can(u.role, 'layout.edit')) throw new ApprovalError(403, 'Your role cannot edit plant layouts');
  const k = kind as Kind;
  const c = clean(k, payload);
  if (k === 'pm_findings') c.payload.photos = photos.slice(0, MAX_PHOTOS).map((ph, i) => ({ n: i + 1, ...ph, caption: str(payload?.photo_captions?.[i], 200) }));
  const review = needsReview(k, u, c.payload);
  const seq = ((await env.DB.prepare('SELECT MAX(seq) AS n FROM approvals').first<number>('n')) || 0) + 1;
  const id = `AP-${String(seq).padStart(4, '0')}`;
  const now = nowStr();
  await env.DB.prepare(`INSERT INTO approvals (id, seq, kind, status, title, payload, file_type, file_name, file_bytes, created_by, created_role, created_at, reviewed_by, reviewed_at, review_note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, seq, k, review ? 'pending' : 'approved', c.title, JSON.stringify(c.payload),
    file?.type ?? null, file?.name ?? null, file?.bytes ?? null, u.username, u.role, now,
    review ? null : u.username, review ? null : now,
    review ? null : (k === 'spare_deploy' && !c.payload.major && !can(u.role, 'spare.deploy.major') ? 'Accessory – no approval needed' : 'Filed by a reviewer')).run();
  return (await get(env, id))!;
}

/** Approve or reject a pending record; returns the updated record (side effects are applied by the caller). */
export async function review(env: Env, u: User, id: string, decision: string, note: string): Promise<Approval> {
  const a = await get(env, id);
  if (!a) throw new ApprovalError(404, 'not found');
  if (!(REVIEWERS[a.kind] || []).includes(u.role)) throw new ApprovalError(403, a.kind === 'layout_change' ? 'Only a Plant Supervisor can approve layout changes' : 'Only a Plant Supervisor or Engineer can approve this');
  if (a.status !== 'pending') throw new ApprovalError(409, `already ${a.status}`);
  if (!['approve', 'reject'].includes(decision)) throw new ApprovalError(422, 'decision must be approve or reject');
  if (decision === 'reject' && !note.trim()) throw new ApprovalError(422, 'give a reason when rejecting');
  await env.DB.prepare('UPDATE approvals SET status = ?, reviewed_by = ?, reviewed_at = ?, review_note = ? WHERE id = ? AND status = ?')
    .bind(decision === 'approve' ? 'approved' : 'rejected', u.username, nowStr(), str(note, 500) || null, id, 'pending').run();
  return (await get(env, id))!;
}
