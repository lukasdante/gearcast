/** Minimal, fast XML tree for WordprocessingML (no DTDs). Shared by the Worker and the browser. */
export interface El { n: string; a: Record<string, string>; c: Node[]; p?: El }
export type Node = El | string;

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unesc = (s: string) => (s.indexOf('&') < 0 ? s : s.replace(/&(#x[0-9a-fA-F]+|#\d+|\w+);/g, (m, e) =>
  e[0] === '#' ? String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e] ?? m));
const escT = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escA = (s: string) => escT(s).replace(/"/g, '&quot;');
const ATTR = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g;

export interface Doc { prolog: string; root: El }

export function parse(xml: string): Doc {
  const root: El = { n: '#root', a: {}, c: [] };
  let cur = root, i = 0, prolog = '';
  const L = xml.length;
  while (i < L) {
    const lt = xml.indexOf('<', i);
    if (lt < 0) { if (i < L) cur.c.push(unesc(xml.slice(i))); break; }
    if (lt > i) cur.c.push(unesc(xml.slice(i, lt)));
    const c1 = xml.charCodeAt(lt + 1);
    if (c1 === 63 /* ? */) { const e = xml.indexOf('?>', lt); if (cur === root) prolog += xml.slice(lt, e + 2); i = e + 2; continue; }
    if (c1 === 33 /* ! */) {
      if (xml.startsWith('<![CDATA[', lt)) { const e = xml.indexOf(']]>', lt); cur.c.push(xml.slice(lt + 9, e)); i = e + 3; continue; }
      const e = xml.startsWith('<!--', lt) ? xml.indexOf('-->', lt) + 3 : xml.indexOf('>', lt) + 1; i = e; continue;
    }
    const gt = xml.indexOf('>', lt);
    if (c1 === 47 /* / */) { cur = cur.p || root; i = gt + 1; continue; }
    const selfClose = xml.charCodeAt(gt - 1) === 47;
    const body = xml.slice(lt + 1, selfClose ? gt - 1 : gt);
    const sp = body.search(/\s/);
    const n = sp < 0 ? body : body.slice(0, sp);
    const a: Record<string, string> = {};
    if (sp >= 0) { ATTR.lastIndex = 0; let m: RegExpExecArray | null; while ((m = ATTR.exec(body))) a[m[1]] = unesc(m[3] ?? m[4] ?? ''); }
    const el: El = { n, a, c: [], p: cur };
    cur.c.push(el);
    if (!selfClose) cur = el;
    i = gt + 1;
  }
  const top = root.c.find(x => typeof x !== 'string') as El;
  top.p = undefined;
  return { prolog, root: top };
}

export function serialize(d: Doc): string {
  const out: string[] = [d.prolog || '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'];
  const w = (e: El) => {
    out.push('<', e.n);
    for (const k in e.a) out.push(' ', k, '="', escA(e.a[k]), '"');
    if (!e.c.length) { out.push('/>'); return; }
    out.push('>');
    for (const c of e.c) typeof c === 'string' ? out.push(escT(c)) : w(c);
    out.push('</', e.n, '>');
  };
  w(d.root);
  return out.join('');
}

export const kids = (e: El, n?: string): El[] => e.c.filter((c): c is El => typeof c !== 'string' && (!n || c.n === n));
export const kid = (e: El, n: string): El | undefined => e.c.find((c): c is El => typeof c !== 'string' && c.n === n);
export function* iter(e: El, n?: string): Generator<El> {
  if (!n || e.n === n) yield e;
  for (const c of e.c) if (typeof c !== 'string') yield* iter(c, n);
}
export const find = (e: El, n: string): El | undefined => { for (const x of iter(e, n)) if (x !== e) return x; return undefined; };
export const textOf = (e: El): string => e.c.map(c => (typeof c === 'string' ? c : '')).join('');
export function el(n: string, a: Record<string, string> = {}, c: Node[] = []): El {
  const e: El = { n, a, c };
  for (const x of c) if (typeof x !== 'string') x.p = e;
  return e;
}
export function remove(e: El) { if (e.p) { const i = e.p.c.indexOf(e); if (i >= 0) e.p.c.splice(i, 1); } }
export function append(parent: El, child: El) { child.p = parent; parent.c.push(child); }
