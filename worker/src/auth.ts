/** Login for technicians (MT-xx) and operators (OP-xx): PBKDF2 password hashes in D1, HMAC-signed session cookie. */
import type { Env } from './env';

export type Role = 'technician' | 'operator';
export interface User { username: string; role: Role; name: string }

const COOKIE = 'gc_session';
const TTL_S = 12 * 3600;
const enc = new TextEncoder();
const b64u = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b as ArrayBuffer))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const hexOf = (b: ArrayBuffer) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');

export async function pbkdf2(password: string, saltHex: string, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const salt = Uint8Array.from(saltHex.match(/../g)!.map(h => parseInt(h, 16)));
  return hexOf(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
}
async function hmac(env: Env, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(env.AUTH_SECRET || 'dev-only-secret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}
const safeEq = (a: string, b: string) => { if (a.length !== b.length) return false; let x = 0; for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i); return x === 0; };

export async function sessionUser(req: Request, env: Env): Promise<User | null> {
  const m = /(?:^|;\s*)gc_session=([^;]+)/.exec(req.headers.get('Cookie') || '');
  const tok = m ? m[1] : (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!tok || !tok.includes('.')) return null;
  const [payload, sig] = tok.split('.');
  if (!safeEq(sig, await hmac(env, payload))) return null;
  try {
    const p = JSON.parse(new TextDecoder().decode(unb64u(payload)));
    if (!p.exp || p.exp < Date.now() / 1000) return null;
    return { username: p.u, role: p.r, name: p.n };
  } catch { return null; }
}

const j = (o: any, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json', ...headers } });

export async function auth(req: Request, env: Env, seg: string[]): Promise<Response> {
  const secure = new URL(req.url).protocol === 'https:' ? '; Secure' : '';
  if (seg[0] === 'login' && req.method === 'POST') {
    let b: any = {};
    try { b = await req.json(); } catch { /* empty */ }
    const username = String(b.username || '').trim().toUpperCase();
    const row = await env.DB.prepare('SELECT username, role, name, salt, hash, iterations FROM users WHERE username = ?').bind(username).first<any>();
    if (!row || !safeEq(await pbkdf2(String(b.password || ''), row.salt, row.iterations), row.hash)) return j({ detail: 'Wrong username or password' }, 401);
    const payload = b64u(enc.encode(JSON.stringify({ u: row.username, r: row.role, n: row.name, exp: Math.floor(Date.now() / 1000) + TTL_S })));
    const tok = `${payload}.${await hmac(env, payload)}`;
    return j({ user: { username: row.username, role: row.role, name: row.name } }, 200,
      { 'Set-Cookie': `${COOKIE}=${tok}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${TTL_S}${secure}` });
  }
  if (seg[0] === 'logout' && req.method === 'POST') return j({ ok: true }, 200, { 'Set-Cookie': `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}` });
  if (seg[0] === 'me' && req.method === 'GET') {
    const u = await sessionUser(req, env);
    return u ? j({ user: u }) : j({ detail: 'Not signed in' }, 401);
  }
  return j({ detail: 'Not Found' }, 404);
}

/** Endpoints a technician may not use (operator-only actions). */
export function technicianBlocked(method: string, path: string): boolean {
  if (path.startsWith('/api/admin/')) return true;
  if (path === '/api/knowledge/upload' || (method === 'DELETE' && path.startsWith('/api/knowledge/'))) return true;
  if (method === 'DELETE' && path.startsWith('/api/incidents/')) return true;
  if (method === 'PUT' && path === '/api/pm/assignments') return true;
  return false;
}
