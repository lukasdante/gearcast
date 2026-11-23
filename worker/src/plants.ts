/** Plant layouts shared between users (were browser-only) and plant access (MVP Changes RBAC): everyone works on the
 *  home plant; other plants open only for people assigned to them or given temporary (emergency) access by a Plant
 *  Supervisor. Supervisors see every plant (they manage and grant access). */
import type { Env } from './env';
import type { User } from './auth';
import { can } from './rbac';
import { nowStr } from './data';

export const HOME_PLANT = 'default'; // id of the seeded Franklin Baker WWTP layout (app/src/domain/layout.ts)
export class PlantError extends Error { constructor(public status: number, msg: string) { super(msg); } }

export interface Grant { username: string; plant_id: string; expires_at: string | null; granted_by: string; granted_at: string; reason: string | null; active: boolean }

const active = (g: { expires_at: string | null }) => !g.expires_at || g.expires_at > nowStr();

export async function grants(env: Env, username?: string): Promise<Grant[]> {
  const rs = username
    ? await env.DB.prepare('SELECT * FROM plant_access WHERE username = ? ORDER BY granted_at DESC').bind(username).all()
    : await env.DB.prepare('SELECT * FROM plant_access ORDER BY granted_at DESC').all();
  return (rs.results as any[]).map(g => ({ ...g, active: active(g) }));
}

/** Plant ids this user may open (HOME_PLANT always; '*' = all, for supervisors). */
async function accessible(env: Env, u: User): Promise<{ all: boolean; ids: Map<string, Grant | null> }> {
  const ids = new Map<string, Grant | null>([[HOME_PLANT, null]]);
  if (can(u.role, 'access.grant')) return { all: true, ids };
  for (const g of await grants(env, u.username)) if (g.active) ids.set(g.plant_id, g);
  return { all: false, ids };
}

export async function list(env: Env, u: User) {
  const acc = await accessible(env, u);
  const rs = await env.DB.prepare('SELECT id, name, doc, updated_at, updated_by FROM plants ORDER BY seq').all();
  const rows = (rs.results as any[]).filter(r => acc.all || acc.ids.has(r.id));
  const access = (id: string) => (id === HOME_PLANT ? 'home' : acc.all ? 'manager' : acc.ids.get(id)?.expires_at ? 'temporary' : 'assigned');
  return {
    home: HOME_PLANT,
    plants: rows.map(r => ({ id: r.id, name: r.name, doc: JSON.parse(r.doc), updated_at: r.updated_at, updated_by: r.updated_by,
      access: access(r.id), expires_at: acc.ids.get(r.id)?.expires_at ?? null })),
    // ids the user may open that have no shared layout yet (the seeded home plant until someone publishes it)
    unpublished: [...acc.ids.keys()].filter(id => !rows.some(r => r.id === id)),
  };
}

export async function publish(env: Env, id: string, doc: any, by: string) {
  if (!id || !doc || typeof doc !== 'object' || !Array.isArray(doc.items)) throw new PlantError(422, 'layout doc with items required');
  const text = JSON.stringify({ ...doc, id });
  if (text.length > 900_000) throw new PlantError(413, 'layout too large');
  const name = String(doc.name || id).slice(0, 80);
  const seq = ((await env.DB.prepare('SELECT MAX(seq) AS n FROM plants').first<number>('n')) || 0) + 1;
  await env.DB.prepare(`INSERT INTO plants (id, seq, name, doc, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, doc = excluded.doc, updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
    .bind(id, seq, name, text, nowStr(), by).run();
}

export async function remove(env: Env, id: string) {
  if (id === HOME_PLANT) throw new PlantError(400, 'The home plant cannot be deleted');
  await env.DB.prepare('DELETE FROM plants WHERE id = ?').bind(id).run();
  await env.DB.prepare('DELETE FROM plant_access WHERE plant_id = ?').bind(id).run();
}

/** Supervisor grants access: hours > 0 = temporary (emergency), hours = 0/absent = assigned until revoked. */
export async function grant(env: Env, by: User, b: any) {
  const username = String(b?.username || '').trim().toUpperCase(), plant_id = String(b?.plant_id || '');
  if (!/^[A-Z]{2}-\d{2}$/.test(username) || !plant_id) throw new PlantError(422, 'username and plant_id required');
  if (!(await env.DB.prepare('SELECT 1 FROM users WHERE username = ?').bind(username).first())) throw new PlantError(404, `No account ${username}`);
  if (plant_id !== HOME_PLANT && !(await env.DB.prepare('SELECT 1 FROM plants WHERE id = ?').bind(plant_id).first())) throw new PlantError(404, 'Unknown plant (publish its layout first)');
  const hours = Number(b?.hours) || 0;
  if (hours < 0 || hours > 24 * 90) throw new PlantError(422, 'hours must be between 0 and 2160');
  let expires: string | null = null;
  if (hours > 0) {
    const t = new Date(nowStr().replace(' ', 'T') + ':00Z').getTime() + hours * 3600e3;
    expires = new Date(t).toISOString().slice(0, 16).replace('T', ' ');
  }
  await env.DB.prepare(`INSERT INTO plant_access (username, plant_id, expires_at, granted_by, granted_at, reason) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(username, plant_id) DO UPDATE SET expires_at = excluded.expires_at, granted_by = excluded.granted_by, granted_at = excluded.granted_at, reason = excluded.reason`)
    .bind(username, plant_id, expires, by.username, nowStr(), String(b?.reason || '').slice(0, 300) || null).run();
  return { username, plant_id, expires_at: expires };
}

export async function revoke(env: Env, username: string, plantId: string) {
  await env.DB.prepare('DELETE FROM plant_access WHERE username = ? AND plant_id = ?').bind(username.toUpperCase(), plantId).run();
}

export async function users(env: Env) {
  const rs = await env.DB.prepare('SELECT username, role, name FROM users ORDER BY username').all();
  return rs.results as any[];
}
