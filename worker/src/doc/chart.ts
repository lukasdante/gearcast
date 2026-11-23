/** Trend chart layout shared by the app (SVG), the PDF (pdf-lib vector drawing) and the DOCX (PNG from the SVG).
 *  layoutChart turns a spec into primitive ops in a top-left-origin box (like SVG); each renderer only maps ops. */

export interface TrendSeries { name: string; color: string; pts: [number, number][] }
export interface TrendSpec {
  title: string; unit: string; x0: number; x1: number; y_min: number | null;
  ticks: { x: number; label: string }[]; end_label: string; start_date: string; end_date: string;
  series: TrendSeries[]; limits: { v: number; label: string; color: string }[];
  bands: { from: number; to: number; color: string }[]; summary: string;
  /** Window before the failure (days) the user picked; absent on reports made before the picker existed (6 weeks). */
  window_days?: number; window_label?: string;
}

export type Op =
  | { t: 'rect'; x: number; y: number; w: number; h: number; fill: string }
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; stroke: string; width: number; dash?: number[] }
  | { t: 'poly'; pts: [number, number][]; stroke: string; width: number }
  | { t: 'dot'; x: number; y: number; r: number; fill: string }
  | { t: 'text'; x: number; y: number; s: string; size: number; color: string; anchor: 'start' | 'middle' | 'end'; bold?: boolean };

const AXIS = '#5b6770', GRIDC = '#dfe4e8', INKC = '#26323a';

function niceStep(range: number, target: number) {
  const raw = range / Math.max(1, target), mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
}
const fmt = (v: number, step: number) => (step < 1 ? v.toFixed(step < 0.1 ? 2 : 1) : String(Math.round(v)));

/** Chart in a W × H box (points). Fonts: `size` is the base text size. */
export function layoutChart(spec: TrendSpec, W: number, H: number, size = 7): Op[] {
  const ops: Op[] = [];
  const vals = spec.series.flatMap(s => s.pts.map(p => p[1]));
  if (!vals.length) {
    ops.push({ t: 'rect', x: 0, y: 0, w: W, h: H, fill: '#f6f7f8' });
    ops.push({ t: 'text', x: W / 2, y: H / 2, s: `${spec.title}: no readings in this window`, size, color: AXIS, anchor: 'middle' });
    return ops;
  }
  const dMax = Math.max(...vals), dMin = Math.min(...vals);
  // show the next limit above the data so the reader sees the margin to it
  const above = spec.limits.map(l => l.v).filter(v => v > dMax).sort((a, b) => a - b)[0];
  let yMax = Math.max(dMax * 1.12, above !== undefined ? above * 1.06 : 0, ...spec.limits.filter(l => l.v <= dMax).map(l => l.v * 1.06));
  let yMin = spec.y_min ?? Math.max(0, dMin - (dMax - dMin) * 0.25 - 1);
  if (spec.y_min === null) yMin = Math.min(yMin, ...spec.limits.map(l => l.v).filter(v => v < yMin).map(v => v - 2));
  if (yMax - yMin < 1e-6) yMax = yMin + 1;
  const step = niceStep(yMax - yMin, 4);
  yMin = Math.floor(yMin / step) * step; yMax = Math.ceil(yMax / step) * step;

  const L = size * 4.2, R = size * 5.2, T = size * 3.1, B = size * 2.6;
  const pw = W - L - R, ph = H - T - B;
  const X = (x: number) => L + ((x - spec.x0) / (spec.x1 - spec.x0)) * pw;
  const Y = (v: number) => T + ph - ((Math.min(Math.max(v, yMin), yMax) - yMin) / (yMax - yMin)) * ph;

  ops.push({ t: 'rect', x: 0, y: 0, w: W, h: H, fill: '#ffffff' });
  for (const b of spec.bands) {
    const top = Math.min(b.to, yMax), bot = Math.max(b.from, yMin);
    if (top > bot) ops.push({ t: 'rect', x: L, y: Y(top), w: pw, h: Y(bot) - Y(top), fill: b.color });
  }
  for (let v = yMin; v <= yMax + step / 2; v += step) {
    ops.push({ t: 'line', x1: L, y1: Y(v), x2: L + pw, y2: Y(v), stroke: GRIDC, width: 0.5 });
    ops.push({ t: 'text', x: L - size * 0.5, y: Y(v) + size * 0.35, s: fmt(v, step), size: size * 0.95, color: AXIS, anchor: 'end' });
  }
  for (const tk of spec.ticks) {
    ops.push({ t: 'line', x1: X(tk.x), y1: T + ph, x2: X(tk.x), y2: T + ph + size * 0.4, stroke: AXIS, width: 0.6 });
    ops.push({ t: 'text', x: X(tk.x), y: T + ph + size * 1.5, s: tk.label, size: size * 0.95, color: AXIS, anchor: 'middle' });
  }
  ops.push({ t: 'line', x1: L, y1: T, x2: L, y2: T + ph, stroke: AXIS, width: 0.7 });
  ops.push({ t: 'line', x1: L, y1: T + ph, x2: L + pw, y2: T + ph, stroke: AXIS, width: 0.7 });
  for (const l of spec.limits) {
    if (l.v < yMin || l.v > yMax) continue;
    ops.push({ t: 'line', x1: L, y1: Y(l.v), x2: L + pw, y2: Y(l.v), stroke: l.color, width: 0.9, dash: [3, 2] });
    ops.push({ t: 'text', x: L + pw + size * 0.4, y: Y(l.v) + size * 0.35, s: `${l.label} ${l.v}`, size: size * 0.9, color: l.color, anchor: 'start' });
  }
  // failure marker
  ops.push({ t: 'line', x1: X(spec.x1), y1: T, x2: X(spec.x1), y2: T + ph, stroke: '#c0392b', width: 0.9, dash: [2, 2] });
  ops.push({ t: 'text', x: X(spec.x1) - size * 0.3, y: T - size * 0.35, s: spec.end_label, size: size * 0.9, color: '#c0392b', anchor: 'end', bold: true });
  for (const s of spec.series) {
    if (!s.pts.length) continue;
    const pts = s.pts.map(([x, v]) => [X(x), Y(v)] as [number, number]);
    if (pts.length > 1) ops.push({ t: 'poly', pts, stroke: s.color, width: 1.3 });
    if (pts.length <= 60) for (const [x, y] of pts) ops.push({ t: 'dot', x, y, r: size * 0.22, fill: s.color });
  }
  // title + unit + legend (top row)
  ops.push({ t: 'text', x: 0, y: size * 1.1, s: spec.title, size: size * 1.1, color: INKC, anchor: 'start', bold: true });
  ops.push({ t: 'text', x: L - size * 0.5, y: T - size * 0.6, s: spec.unit, size: size * 0.9, color: AXIS, anchor: 'end' });
  let lx = W - size * 0.3;
  for (const s of [...spec.series].reverse()) {
    if (!s.pts.length) continue;
    ops.push({ t: 'text', x: lx, y: size * 1.1, s: s.name, size: size * 0.95, color: INKC, anchor: 'end' });
    lx -= s.name.length * size * 0.55 + size * 0.5;
    ops.push({ t: 'line', x1: lx - size * 1.8, y1: size * 0.75, x2: lx, y2: size * 0.75, stroke: s.color, width: 2 });
    lx -= size * 3.6;
  }
  return ops;
}

/** SVG markup for a spec (app view, print, and the DOCX PNG). */
export function chartSvg(spec: TrendSpec, W: number, H: number, size = 7): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const parts = layoutChart(spec, W, H, size).map(o => {
    switch (o.t) {
      case 'rect': return `<rect x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" fill="${o.fill}"/>`;
      case 'line': return `<line x1="${o.x1}" y1="${o.y1}" x2="${o.x2}" y2="${o.y2}" stroke="${o.stroke}" stroke-width="${o.width}"${o.dash ? ` stroke-dasharray="${o.dash.join(' ')}"` : ''}/>`;
      case 'poly': return `<polyline points="${o.pts.map(p => p.map(n => n.toFixed(2)).join(',')).join(' ')}" fill="none" stroke="${o.stroke}" stroke-width="${o.width}" stroke-linejoin="round"/>`;
      case 'dot': return `<circle cx="${o.x.toFixed(2)}" cy="${o.y.toFixed(2)}" r="${o.r}" fill="${o.fill}"/>`;
      case 'text': return `<text x="${o.x.toFixed(2)}" y="${o.y.toFixed(2)}" font-size="${o.size}" fill="${o.color}" text-anchor="${o.anchor}"${o.bold ? ' font-weight="700"' : ''}>${esc(o.s)}</text>`;
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="DejaVu Sans Condensed, Arial Narrow, Arial, sans-serif">${parts.join('')}</svg>`;
}
