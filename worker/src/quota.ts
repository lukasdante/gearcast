/** Hard daily caps on everything that can cost money or exhaust a free tier (DeepSeek, Workers AI, R2).
 *  Counters live in D1 (`usage`), keyed by Manila date; `day = 'all'` holds running totals (R2 bytes stored).
 *  Limits come from wrangler vars, so they can be changed without a code change. */
import type { Env } from './env';

export class QuotaError extends Error {
  kind = 'DailyLimitReached';
  constructor(public what: string, public limit: number) { super(`Daily limit reached for ${what} (${limit}). Resets at midnight (Manila).`); }
}

const DEFAULTS = {
  LIMIT_LLM_CALLS_DAY: 300,      // DeepSeek requests (one Caster message = 1..6)
  LIMIT_EMBED_TEXTS_DAY: 5000,   // texts sent to Workers AI bge-small (≈ 5k neurons worst case, free tier is 10k/day)
  LIMIT_UPLOADS_DAY: 30,         // knowledge uploads
  LIMIT_UPLOAD_MB_DAY: 200,      // upload bytes written to R2 per day
  LIMIT_PDF_WRITES_DAY: 300,     // incident PDFs written to R2 per day
  LIMIT_PHOTOS_DAY: 100,         // incident photos written to R2 per day (≤ 4 per report, ≤ 3 MB each)
  LIMIT_STORAGE_MB: 2048,        // total GearCast bytes in R2 (uploads + PDFs); account free tier is 10 GB
} as const;
type LimitName = keyof typeof DEFAULTS;

export function limit(env: Env, name: LimitName): number {
  const v = Number((env as any)[name]);
  return Number.isFinite(v) && v >= 0 ? v : DEFAULTS[name];
}

const today = (env: Env) => new Date(Date.now() + Number(env.TZ_OFFSET_MIN || 480) * 60_000).toISOString().slice(0, 10);

/** Atomically add n to a counter and return the new value. */
async function bump(env: Env, day: string, k: string, n: number): Promise<number> {
  const r: any = await env.DB.prepare(
    'INSERT INTO usage (day, k, n) VALUES (?, ?, ?) ON CONFLICT(day, k) DO UPDATE SET n = n + excluded.n RETURNING n',
  ).bind(day, k, n).first();
  return Number(r?.n ?? n);
}

/** Reserve n units of a daily counter; throws QuotaError (and gives the units back) if it would pass the cap. */
export async function charge(env: Env, k: string, name: LimitName, n = 1): Promise<void> {
  const cap = limit(env, name), day = today(env);
  const after = await bump(env, day, k, n);
  if (after > cap) { await bump(env, day, k, -n); throw new QuotaError(k, cap); }
}

/** Reserve bytes of R2 storage against the daily write cap (uploads only) and the total stored cap. */
export async function chargeStorage(env: Env, bytes: number, dailyKey: 'upload_bytes' | null): Promise<void> {
  if (dailyKey) await charge(env, dailyKey, 'LIMIT_UPLOAD_MB_DAY', bytes / 1048576);
  const cap = limit(env, 'LIMIT_STORAGE_MB');
  const after = await bump(env, 'all', 'r2_bytes', bytes);
  if (after / 1048576 > cap) {
    await bump(env, 'all', 'r2_bytes', -bytes);
    if (dailyKey) await bump(env, today(env), dailyKey, -bytes / 1048576);
    throw new QuotaError('storage', cap);
  }
}

export const releaseStorage = (env: Env, bytes: number) => (bytes > 0 ? bump(env, 'all', 'r2_bytes', -bytes) : Promise.resolve(0));

/** Today's counters and the caps, for GET /api/usage. */
export async function usage(env: Env) {
  const rows = ((await env.DB.prepare("SELECT day, k, n FROM usage WHERE day IN (?, 'all')").bind(today(env)).all()).results as any[]);
  const get = (day: string, k: string) => Number(rows.find(r => r.day === day && r.k === k)?.n ?? 0);
  const d = today(env);
  return {
    day: d,
    llm_calls: { used: get(d, 'llm'), limit: limit(env, 'LIMIT_LLM_CALLS_DAY') },
    embed_texts: { used: get(d, 'embed'), limit: limit(env, 'LIMIT_EMBED_TEXTS_DAY') },
    uploads: { used: get(d, 'upload'), limit: limit(env, 'LIMIT_UPLOADS_DAY') },
    upload_mb: { used: +get(d, 'upload_bytes').toFixed(2), limit: limit(env, 'LIMIT_UPLOAD_MB_DAY') },
    pdf_writes: { used: get(d, 'pdf'), limit: limit(env, 'LIMIT_PDF_WRITES_DAY') },
    photos: { used: get(d, 'photo'), limit: limit(env, 'LIMIT_PHOTOS_DAY') },
    storage_mb: { used: +(get('all', 'r2_bytes') / 1048576).toFixed(2), limit: limit(env, 'LIMIT_STORAGE_MB') },
  };
}
