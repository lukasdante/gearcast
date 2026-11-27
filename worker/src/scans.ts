/** QR scanning (sheets QR_Tags + Scan_Log, batch 2.F): resolve a scanned label to an asset, log the scan in D1, and
 *  return the tag's scan history (seeded pilot log, date-shifted, merged with scans made in GearCast). */
import type { Env } from './env';
import type { User } from './auth';
import RAW from './generated/data.json';
import { CLOCK, D, nowStr } from './data';
import { shiftDates } from './time';
import { parseScan, SCAN_PURPOSES } from './qrparse';
import * as pl from './plants';

export class ScanError extends Error { constructor(public status: number, msg: string) { super(msg); } }

export interface Tag { tag_id: string; asset_id: string; qr_payload: string; location_node: string | null; label_placement: string | null;
  label_material: string | null; environment: string | null; installed_date: string | null; last_verified: string | null; basis?: string | null }
export interface Scan { scan_id: string; scanned_at: string; tag_id: string | null; asset_id: string; user: string; user_role: string | null;
  device_id: string | null; purpose: string | null; action: string | null; linked_wo_id: string | null; online: boolean; source: 'pilot' | 'app' }

const R: any = RAW;
let cache: { offset: number; tags: Tag[]; seed: Scan[] } | null = null;
function tables() {
  if (!cache || cache.offset !== CLOCK.offset) {
    const tags: Tag[] = shiftDates(R.qrTags || [], CLOCK.offset);
    const seed: Scan[] = (shiftDates(R.scanLog || [], CLOCK.offset) as any[]).map(s => ({
      scan_id: s.scan_id, scanned_at: s.scanned_at, tag_id: s.tag_id, asset_id: s.asset_id, user: s.user_role, user_role: roleOf(s.user_role),
      device_id: s.device_id, purpose: s.purpose, action: s.action, linked_wo_id: s.linked_wo_id, online: !!s.online, source: 'pilot' as const,
    }));
    cache = { offset: CLOCK.offset, tags, seed };
  }
  return cache;
}
const roleOf = (u: string | null) => (/^MT-|^EL-/.test(u || '') ? 'technician' : /^EN-/.test(u || '') ? 'engineer' : /^PS-|^OP-/.test(u || '') ? 'supervisor' : null);

/** Every asset gets a tag: the workbook's QR_Tags row, else one derived from the asset id (same QR-<id> style). */
export function tags(): Tag[] {
  const t = tables().tags;
  const have = new Set(t.map(x => x.asset_id));
  const extra: Tag[] = D.equipment.filter(a => !have.has(a.asset_id)).map(a => ({
    tag_id: a.qr_tag_id || `QR-${a.asset_id}`, asset_id: a.asset_id, qr_payload: `gearcast://asset/${a.asset_id}`, location_node: a.location_node ?? null,
    label_placement: null, label_material: null, environment: null, installed_date: null, last_verified: null, basis: 'Not yet tagged',
  }));
  return [...t, ...extra];
}

/** Assets are in the home plant's data (open to everyone); an asset placed only on another plant's layout needs
 *  access to that plant (plants.ts). */
async function access(env: Env, u: User, aid: string): Promise<'ok' | 'forbidden' | 'unknown'> {
  if (D.asset[aid]) return 'ok';
  const has = (doc: any) => (doc?.items || []).some((i: any) => String(i?.assetId || '').toUpperCase() === aid);
  if ((await pl.list(env, u)).plants.some(p => has(p.doc))) return 'ok';
  const rs = await env.DB.prepare('SELECT doc FROM plants WHERE doc LIKE ?').bind(`%${aid.replace(/[%_]/g, '')}%`).all();
  return (rs.results as any[]).some(r => { try { return has(JSON.parse(r.doc)); } catch { return false; } }) ? 'forbidden' : 'unknown';
}

/** Scanned text → asset (or the store location). Throws 404/403. */
export async function resolve(env: Env, u: User, code: string) {
  const s = parseScan(code);
  if (!s) throw new ScanError(422, 'Not a GearCast QR code');
  const all = tags();
  let tag: Tag | undefined, aid: string | null = null;
  if (s.kind === 'tag') { tag = all.find(t => t.tag_id === s.id); aid = tag?.asset_id ?? null; }
  else if (s.kind === 'location') { tag = all.find(t => t.qr_payload.toUpperCase() === `GEARCAST://LOCATION/${s.id}`); aid = tag?.asset_id ?? s.id; }
  else { aid = s.id; tag = all.find(t => t.asset_id === aid && t.qr_payload.startsWith('gearcast://asset/')); }
  if (!aid) throw new ScanError(404, `Unknown tag ${s.id}`);
  if (aid === 'STORE' || s.kind === 'location') {
    return { kind: 'location' as const, asset_id: null, location: aid, tag: tag ?? null,
      assets: D.equipment.filter(a => a.location_node === 'STORE').map(a => a.asset_id) };
  }
  const acc = await access(env, u, aid);
  if (acc === 'unknown') throw new ScanError(404, `Unknown asset ${aid}`);
  if (acc === 'forbidden') throw new ScanError(403, `You do not have access to the plant of ${aid}`);
  return { kind: 'asset' as const, asset_id: aid, location: null, tag: tag ?? tags().find(t => t.asset_id === aid) ?? null, assets: [aid] };
}

const str = (v: any, n: number) => (v === null || v === undefined || v === '' ? null : String(v).slice(0, n));
const purposeOf = (v: any) => (SCAN_PURPOSES as readonly string[]).includes(v) ? String(v) : null;

/** POST /api/scans: resolve + log. Offline scans replayed later keep their own time (up to 7 days back). */
export async function log(env: Env, u: User, b: any) {
  const r = await resolve(env, u, String(b?.code ?? ''));
  const now = nowStr();
  let at = now;
  const ts = str(b?.scanned_at, 16);
  if (ts && /^\d{4}-\d\d-\d\d \d\d:\d\d$/.test(ts) && ts <= now) {
    const age = (Date.parse(now.replace(' ', 'T') + 'Z') - Date.parse(ts.replace(' ', 'T') + 'Z')) / 86400e3;
    if (age <= 7) at = ts;
  }
  const scan: Scan = {
    scan_id: 'SCN-' + crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase(), scanned_at: at, tag_id: r.tag?.tag_id ?? null,
    asset_id: r.asset_id ?? r.location!, user: u.username, user_role: u.role, device_id: str(b?.device_id, 40), purpose: purposeOf(b?.purpose),
    action: str(b?.action, 80) ?? (r.kind === 'location' ? 'Viewed store' : 'Viewed profile'), linked_wo_id: str(b?.linked_wo_id, 20),
    online: b?.online !== false, source: 'app',
  };
  const seq = ((await env.DB.prepare('SELECT MAX(seq) AS n FROM scan_log').first<number>('n')) || 0) + 1;
  await env.DB.prepare(`INSERT INTO scan_log (scan_id, seq, scanned_at, tag_id, asset_id, username, user_role, device_id, purpose, action, linked_wo_id, online, code)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(scan.scan_id, seq, scan.scanned_at, scan.tag_id, scan.asset_id, scan.user, scan.user_role,
    scan.device_id, scan.purpose, scan.action, scan.linked_wo_id, scan.online ? 1 : 0, String(b?.code ?? '').slice(0, 200)).run();
  return { ...r, scan };
}

/** PATCH /api/scans/{id}: what the user did next (purpose, action, linked work order). Own scans only. */
export async function update(env: Env, u: User, id: string, b: any) {
  const row = await env.DB.prepare('SELECT username FROM scan_log WHERE scan_id = ?').bind(id).first<any>();
  if (!row) throw new ScanError(404, 'not found');
  if (row.username !== u.username) throw new ScanError(403, 'You can only update your own scans');
  const sets: string[] = [], vals: any[] = [];
  if (b && 'purpose' in b) { sets.push('purpose = ?'); vals.push(purposeOf(b.purpose)); }
  if (b && 'action' in b) { sets.push('action = ?'); vals.push(str(b.action, 80)); }
  if (b && 'linked_wo_id' in b) { sets.push('linked_wo_id = ?'); vals.push(str(b.linked_wo_id, 20)); }
  if (sets.length) await env.DB.prepare(`UPDATE scan_log SET ${sets.join(', ')} WHERE scan_id = ?`).bind(...vals, id).run();
  return (await history(env, null, 1, id))[0];
}

const fromRow = (r: any): Scan => ({ scan_id: r.scan_id, scanned_at: r.scanned_at, tag_id: r.tag_id, asset_id: r.asset_id, user: r.username, user_role: r.user_role,
  device_id: r.device_id, purpose: r.purpose, action: r.action, linked_wo_id: r.linked_wo_id, online: !!r.online, source: 'app' });

/** GET /api/scans?asset_id=…: newest first, pilot log + GearCast scans. */
export async function history(env: Env, assetId: string | null, limit = 50, scanId?: string): Promise<Scan[]> {
  limit = Math.max(1, Math.min(500, limit || 50));
  const rs = scanId
    ? await env.DB.prepare('SELECT * FROM scan_log WHERE scan_id = ?').bind(scanId).all()
    : assetId
      ? await env.DB.prepare('SELECT * FROM scan_log WHERE asset_id = ? ORDER BY scanned_at DESC, seq DESC LIMIT ?').bind(assetId, limit).all()
      : await env.DB.prepare('SELECT * FROM scan_log ORDER BY scanned_at DESC, seq DESC LIMIT ?').bind(limit).all();
  const app = (rs.results as any[]).map(fromRow);
  if (scanId) return app;
  const now = nowStr(); // the pilot log is shifted to end today: hide rows later than now
  const seed = tables().seed.filter(s => (!assetId || s.asset_id === assetId) && s.scanned_at <= now);
  return [...app, ...seed].sort((a, b) => (a.scanned_at < b.scanned_at ? 1 : a.scanned_at > b.scanned_at ? -1 : 0)).slice(0, limit);
}
