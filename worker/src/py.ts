/** Python-compatible helpers so numbers/strings come out exactly like the Python backend's. */

export const isNone = (v: any) => v === null || v === undefined;

/** Python truthiness. */
export function truthy(v: any): boolean {
  if (v === null || v === undefined || v === false || v === 0 || v === '') return false;
  if (typeof v === 'number' && Number.isNaN(v)) return true;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v).length > 0;
  return true;
}

/** Python `a or b`. */
export const or = <A, B>(a: A, b: B): A | B => (truthy(a) ? a : b);

/** data.num(): float(v) or default for None / "" / unparsable. */
export function num(v: any, def: any = null): any {
  if (v === null || v === undefined || v === '') return def;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const s = v.trim();
    if (!/^[+-]?(\d[\d_]*\.?\d*(e[+-]?\d+)?|\.\d+(e[+-]?\d+)?|inf(inity)?|nan)$/i.test(s)) return def;
    const n = Number(s.replace(/_/g, '').replace(/^([+-]?)inf(inity)?$/i, '$1Infinity'));
    return Number.isNaN(n) && !/nan/i.test(s) ? def : n;
  }
  return def;
}

function incDigits(d: string): string {
  const a = d.split('');
  let i = a.length - 1;
  for (; i >= 0; i--) {
    if (a[i] === '9') a[i] = '0';
    else { a[i] = String.fromCharCode(a[i].charCodeAt(0) + 1); break; }
  }
  return i < 0 ? '1' + a.join('') : a.join('');
}

/** Python format(x, f".{d}f"): exact binary value, round-half-even. */
export function fixed(x: number, d: number): string {
  if (!Number.isFinite(x)) return Number.isNaN(x) ? 'nan' : x > 0 ? 'inf' : '-inf';
  const neg = x < 0 || Object.is(x, -0);
  const s = Math.abs(x).toFixed(Math.min(100, d + 70));
  const [ip, fp = ''] = s.split('.');
  const keep = fp.slice(0, d), rest = fp.slice(d);
  let up = false;
  if (rest.length) {
    const c = rest.charCodeAt(0) - 48;
    if (c > 5) up = true;
    else if (c === 5) up = /[1-9]/.test(rest.slice(1)) || Number(d ? keep[d - 1] : ip[ip.length - 1]) % 2 === 1;
  }
  let digits = ip + keep;
  if (up) digits = incDigits(digits);
  digits = digits.replace(/^0+(?=\d)/, '');
  if (digits.length <= d) digits = '0'.repeat(d - digits.length + 1) + digits;
  const out = d ? `${digits.slice(0, digits.length - d)}.${digits.slice(digits.length - d)}` : digits;
  return (neg ? '-' : '') + out;
}

/** Python round(x, n) (half-even on the exact value). */
export function pyRound(x: number, n = 0): number {
  if (!Number.isFinite(x)) return x;
  const v = Number(fixed(x, n));
  return v === 0 ? 0 : v;
}

const commas = (s: string) => {
  const neg = s.startsWith('-');
  const [ip, fp] = (neg ? s.slice(1) : s).split('.');
  return (neg ? '-' : '') + ip.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (fp !== undefined ? '.' + fp : '');
};
/** f"{x:,.{d}f}" */
export const fmtComma = (x: number, d = 0) => commas(fixed(x, d));
/** f"{n:,}" for an int (floats print with Python repr). */
export const fmtInt = (x: number) => (Number.isInteger(x) ? commas(String(x)) : commas(pyFloat(x)));
/** f"{x:.0%}" */
export const pct0 = (x: number) => fixed(x * 100, 0) + '%';

/** f"{x:g}" */
export function fmtG(x: number): string {
  if (x === 0) return Object.is(x, -0) ? '-0' : '0';
  if (!Number.isFinite(x)) return Number.isNaN(x) ? 'nan' : x > 0 ? 'inf' : '-inf';
  const e = Math.floor(Math.log10(Math.abs(Number(x.toPrecision(6)))));
  if (e < -4 || e >= 6) {
    let [m, ex] = x.toExponential(5).split('e');
    m = m.replace(/\.?0+$/, '');
    const n = Number(ex);
    return `${m}e${n < 0 ? '-' : '+'}${String(Math.abs(n)).padStart(2, '0')}`;
  }
  return fixed(x, Math.max(0, 5 - e)).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}

/** repr(float) */
export function pyFloat(x: number): string {
  if (!Number.isFinite(x)) return Number.isNaN(x) ? 'nan' : x > 0 ? 'inf' : '-inf';
  if (Number.isInteger(x) && Math.abs(x) < 1e16) return (Object.is(x, -0) ? '-0' : String(x)) + '.0';
  const a = Math.abs(x);
  if (a >= 1e16 || a < 1e-4) {
    const [m, ex] = x.toExponential().split('e');
    const n = Number(ex);
    return `${m}e${n < 0 ? '-' : '+'}${String(Math.abs(n)).padStart(2, '0')}`;
  }
  return String(x);
}

/** str(v) for JSON-ish values (ints and floats are indistinguishable in JS; data ints print as ints). */
export function pyStr(v: any): string {
  if (v === null || v === undefined) return 'None';
  if (v === true) return 'True';
  if (v === false) return 'False';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  return pyRepr(v);
}

function pyRepr(v: any): string {
  if (v === null || v === undefined) return 'None';
  if (v === true) return 'True';
  if (v === false) return 'False';
  if (typeof v === 'string') return `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) return `[${v.map(pyRepr).join(', ')}]`;
  return `{${Object.entries(v).map(([k, x]) => `${pyRepr(k)}: ${pyRepr(x)}`).join(', ')}}`;
}

/** json.dumps(o, default=str) – Python separators and ensure_ascii. */
export const dumps = (o: any): string => pyDumps(o);
function esc(s: string): string {
  return JSON.stringify(s).replace(/[\u007f-￿]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}
function pyDumps(o: any): string {
  if (o === null || o === undefined) return 'null';
  if (o === true) return 'true';
  if (o === false) return 'false';
  if (typeof o === 'number') return Number.isFinite(o) ? String(o) : Number.isNaN(o) ? 'NaN' : o > 0 ? 'Infinity' : '-Infinity';
  if (typeof o === 'string') return esc(o);
  if (Array.isArray(o)) return `[${o.map(pyDumps).join(', ')}]`;
  if (typeof o === 'object') return `{${Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => `${esc(k)}: ${pyDumps(v)}`).join(', ')}}`;
  return esc(String(o));
}

/** {k: o.get(k) for k in keys} */
export function pick(o: any, keys: readonly string[]): Record<string, any> {
  const out: Record<string, any> = {};
  for (const k of keys) out[k] = o && o[k] !== undefined ? o[k] : null;
  return out;
}

/** Python sorted(key=...) with optional reverse (stable in both directions). */
export function sortBy<T>(rows: T[], key: (r: T) => any, reverse = false): T[] {
  const cmp = (a: any, b: any) => (a < b ? -1 : a > b ? 1 : 0);
  return rows.map((r, i) => ({ r, k: key(r), i })).sort((a, b) => (reverse ? cmp(b.k, a.k) : cmp(a.k, b.k)) || a.i - b.i).map(x => x.r);
}

export const strip = (s: string) => s.replace(/^[\s\u001c-\u001f\u0085]+|[\s\u001c-\u001f\u0085]+$/g, '');
