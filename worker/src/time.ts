/** Naive local datetimes as integer minutes since 1970-01-01 00:00 (like Python's naive datetime), plant TZ. */

export const DAY = 1440;
export const dayNum = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d) / 86400000;
export const DATA_CUTOFF = dayNum(2026, 10, 31);

const p2 = (n: number) => String(n).padStart(2, '0');
export function dayStr(day: number): string {
  const d = new Date(day * 86400000);
  return `${String(d.getUTCFullYear()).padStart(4, '0')}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
}
/** "%Y-%m-%d %H:%M" */
export function minStr(m: number): string {
  const d = new Date(m * 60000);
  return `${dayStr(Math.floor(m / DAY))} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
}
export const hourOf = (m: number) => new Date(m * 60000).getUTCHours();
export const yearOf = (m: number) => new Date(m * 60000).getUTCFullYear();

function validYMD(y: number, mo: number, d: number): boolean {
  if (y < 1 || mo < 1 || mo > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, mo, 0)).getUTCDate();
}
const toMin = (y: number, mo: number, d: number, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h, mi) / 60000 - (y < 100 ? 0 : 0);

const MO = '(1[0-2]|0[1-9]|[1-9])', DD = '(3[01]|[12]\\d|0[1-9]|[1-9]| [1-9])';
const RX_DT = new RegExp(`^(\\d{4})-${MO}-${DD}\\s+(2[0-3]|[0-1]\\d|\\d):([0-5]\\d|\\d)$`);
const RX_D = new RegExp(`^(\\d{4})-${MO}-${DD}$`);

/** data.parse_dt */
export function parseDt(s: any): number | null {
  if (s === null || s === undefined || s === '' || s === false) return null;
  let t = String(s).replace(/T/g, ' ');
  t = t.includes(' ') ? t.slice(0, 16) : t.slice(0, 10);
  for (const rx of [RX_DT, RX_D]) {
    const m = rx.exec(t);
    if (!m) continue;
    const y = +m[1], mo = +m[2], d = +m[3].trim();
    if (!validYMD(y, mo, d)) continue;
    return Date.UTC(y, mo - 1, d, m[4] ? +m[4] : 0, m[5] ? +m[5] : 0) / 60000;
  }
  return null;
}
void toMin;

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** data.fmt_date */
export function fmtDate(s: any, withTime = false): string {
  const m = parseDt(s);
  if (m === null) return s ? String(s) : 'Not recorded';
  const d = new Date(m * 60000);
  const base = `${WD[d.getUTCDay()]} ${d.getUTCDate()} ${MN[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  return withTime && /\d{2}:\d{2}/.test(String(s)) ? `${base}, ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}` : base;
}

// ------------------------------------------------------------------ date shift (data.shift_date_str)
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})((?:[ T]\d{2}:\d{2}(?::\d{2})?)?.*)$/;
const EMBED_RE = /(?<![\p{L}\p{N}_-])20\d\d-\d\d-\d\d(?![\p{L}\p{N}_-])/gu;

export function shiftDateStr(v: string, days: number): string {
  if (v.length > 25) return v.replace(EMBED_RE, e => shiftDateStr(e, days));
  const m = DATE_RE.exec(v);
  if (!m) return v;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (!validYMD(y, mo, d)) return v;
  return dayStr(dayNum(y, mo, d) + days) + m[4];
}

export function shiftDates<T>(o: T, days: number): T {
  if (!days) return o;
  if (typeof o === 'string') return shiftDateStr(o, days) as any;
  if (Array.isArray(o)) return o.map(v => shiftDates(v, days)) as any;
  if (o && typeof o === 'object') {
    const out: any = {};
    for (const k in o) out[k] = shiftDates((o as any)[k], days);
    return out;
  }
  return o;
}

// ------------------------------------------------------------------ request clock
export interface Clock { nowMin: number; asOf: string; asOfDate: string; offset: number }

/** "now" in the plant's time zone (Asia/Manila, no DST), or an explicit "YYYY-MM-DD HH:MM" (dev parity). */
export function makeClock(override?: string | null, tzOffsetMin = 480): Clock {
  let nowMin = Math.floor(Date.now() / 60000) + tzOffsetMin;
  const o = override ? parseDt(override) : null;
  if (o !== null) nowMin = o;
  const asOf = minStr(nowMin);
  return { nowMin, asOf, asOfDate: asOf.slice(0, 10), offset: Math.floor(nowMin / DAY) - DATA_CUTOFF };
}
