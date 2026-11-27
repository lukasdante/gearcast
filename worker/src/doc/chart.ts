/** Trend chart layout shared by the app (SVG), the PDF (pdf-lib vector drawing) and the DOCX (PNG from the SVG).
 *  layoutChart turns a spec into primitive ops in a top-left-origin box (like SVG); each renderer only maps ops. */

export interface TrendSeries {
  name: string; color: string; pts: [number, number][];
  /** Spread of the readings in each point's bin: [x, min, max] (drawn as a shaded envelope behind the line). */
  band?: [number, number, number][];
}
export interface TrendLimit { v: number; label: string; color: string; /** reference value (normal / rated), not an alarm */ ref?: boolean }
export interface TrendSpec {
  title: string; unit: string; x0: number; x1: number; y_min: number | null;
  ticks: { x: number; label: string }[]; end_label: string; start_date: string; end_date: string;
  series: TrendSeries[]; limits: TrendLimit[];
  bands: { from: number; to: number; color: string }[]; summary: string;
  /** Window before the failure (days) the user picked; absent on reports made before the picker existed (6 weeks). */
  window_days?: number; window_label?: string;
  /** x of the failure (days; 0). Older specs put the failure on the right edge (x1). */
  fail_x?: number;
  /** How readings were aggregated, e.g. "weekly mean · shaded: min–max". */
  agg?: string;
}

export type Op =
  | { t: 'rect'; x: number; y: number; w: number; h: number; fill: string }
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; stroke: string; width: number; dash?: number[] }
  | { t: 'poly'; pts: [number, number][]; stroke: string; width: number }
  | { t: 'area'; pts: [number, number][]; fill: string; opacity: number }
  | { t: 'dot'; x: number; y: number; r: number; fill: string; ring?: string }
  | { t: 'text'; x: number; y: number; s: string; size: number; color: string; anchor: 'start' | 'middle' | 'end'; bold?: boolean };

const AXIS = '#5b6770', GRIDC = '#dfe4e8', INKC = '#26323a', FAIL = '#c0392b', REF = '#6b7a86';

function niceStep(range: number, target: number) {
  const raw = range / Math.max(1, target), mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
}
const fmt = (v: number, step: number) => (step < 0.1 ? v.toFixed(2) : step < 1 || step % 1 ? v.toFixed(1) : String(Math.round(v)));
/** `c` mixed with white (k = share of c), as #rrggbb. */
const tint = (c: string, k: number) => '#' + [1, 3, 5].map(i => Math.round(255 - (255 - parseInt(c.slice(i, i + 2), 16)) * k).toString(16).padStart(2, '0')).join('');
/** Rough text width (DejaVu Sans Condensed averages ~0.52 em). */
const textW = (s: string, size: number) => s.length * size * 0.52;

/** Chart in a W × H box (points). Fonts: `size` is the base text size. */
export function layoutChart(spec: TrendSpec, W: number, H: number, size = 7): Op[] {
  const ops: Op[] = [];
  const vals = spec.series.flatMap(s => [...s.pts.map(p => p[1]), ...(s.band ?? []).flatMap(b => [b[1], b[2]])]);
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

  const L = size * 4.2, R = size * 6.4, T = size * 3.3, B = size * 2.6;
  const pw = W - L - R, ph = H - T - B;
  const X = (x: number) => L + ((x - spec.x0) / (spec.x1 - spec.x0)) * pw;
  const Y = (v: number) => T + ph - ((Math.min(Math.max(v, yMin), yMax) - yMin) / (yMax - yMin)) * ph;
  const failX = X(spec.fail_x ?? spec.x1);

  ops.push({ t: 'rect', x: 0, y: 0, w: W, h: H, fill: '#ffffff' });
  for (const b of spec.bands) {
    const top = Math.min(b.to, yMax), bot = Math.max(b.from, yMin);
    if (top > bot) ops.push({ t: 'rect', x: L, y: Y(top), w: pw, h: Y(bot) - Y(top), fill: b.color });
  }
  // after the failure: hatched-looking grey strip (no readings are charted there)
  if (failX < L + pw - 0.5) ops.push({ t: 'rect', x: failX, y: T, w: L + pw - failX, h: ph, fill: '#eceff1' });
  for (let v = yMin; v <= yMax + step / 2; v += step) {
    ops.push({ t: 'line', x1: L, y1: Y(v), x2: L + pw, y2: Y(v), stroke: GRIDC, width: 0.5 });
    ops.push({ t: 'text', x: L - size * 0.5, y: Y(v) + size * 0.35, s: fmt(v, step), size: size * 0.95, color: AXIS, anchor: 'end' });
  }
  for (const tk of spec.ticks) {
    if (tk.x < spec.x0 - 1e-6 || tk.x > spec.x1 + 1e-6) continue;
    ops.push({ t: 'line', x1: X(tk.x), y1: T + ph, x2: X(tk.x), y2: T + ph + size * 0.4, stroke: AXIS, width: 0.6 });
    ops.push({ t: 'text', x: X(tk.x), y: T + ph + size * 1.5, s: tk.label, size: size * 0.95, color: AXIS, anchor: 'middle' });
  }
  ops.push({ t: 'line', x1: L, y1: T, x2: L, y2: T + ph, stroke: AXIS, width: 0.7 });
  ops.push({ t: 'line', x1: L, y1: T + ph, x2: L + pw, y2: T + ph, stroke: AXIS, width: 0.7 });
  // limit lines; labels on the right, nudged apart when two limits are close
  let lastLabelY = -Infinity;
  for (const l of [...spec.limits].sort((a, b) => b.v - a.v)) {
    if (l.v < yMin || l.v > yMax) continue;
    const c = l.ref ? REF : l.color;
    ops.push({ t: 'line', x1: L, y1: Y(l.v), x2: L + pw, y2: Y(l.v), stroke: c, width: l.ref ? 0.7 : 0.9, dash: l.ref ? [1, 2] : [3, 2] });
    const ly = Math.max(Y(l.v) + size * 0.35, lastLabelY + size * 0.95);
    lastLabelY = ly;
    ops.push({ t: 'text', x: L + pw + size * 0.4, y: ly, s: `${l.label} ${l.v}`, size: size * 0.85, color: c, anchor: 'start' });
  }
  // series: min–max envelope, then the line, then dots (all when few points; always on abnormal ones)
  const alarms = spec.limits.filter(l => !l.ref).sort((a, b) => a.v - b.v);
  const levelOf = (v: number) => { let hit: (typeof alarms)[number] | null = null; for (const a of alarms) if (v >= a.v) hit = a; return hit; };
  for (const s of spec.series) {
    const band = s.band ?? [];
    if (band.length > 1) {
      const up = s.band!.map(([x, , hi]) => [X(x), Y(hi)] as [number, number]);
      const dn = s.band!.map(([x, lo]) => [X(x), Y(lo)] as [number, number]).reverse();
      ops.push({ t: 'area', pts: [...up, ...dn], fill: tint(s.color, 0.22), opacity: 1 }); // pre-blended: renderers without fill-opacity
    } else {
      for (const [x, lo, hi] of band) if (hi > lo) ops.push({ t: 'line', x1: X(x), y1: Y(lo), x2: X(x), y2: Y(hi), stroke: s.color, width: 0.5 });
    }
  }
  for (const s of spec.series) {
    if (!s.pts.length) continue;
    const pts = s.pts.map(([x, v]) => [X(x), Y(v)] as [number, number]);
    if (pts.length > 1) ops.push({ t: 'poly', pts, stroke: s.color, width: 1.3 });
    const hiAt = new Map((s.band ?? []).map(b => [b[0], b[2]]));
    s.pts.forEach(([x, v], i) => {
      const lvl = levelOf(Math.max(v, hiAt.get(x) ?? v));
      if (lvl) ops.push({ t: 'dot', x: pts[i][0], y: Y(Math.max(v, hiAt.get(x) ?? v)), r: size * 0.36, fill: '#ffffff', ring: lvl.color });
      if (s.pts.length <= 60 || pts.length === 1) ops.push({ t: 'dot', x: pts[i][0], y: pts[i][1], r: size * 0.22, fill: s.color });
    });
  }
  // failure marker: solid red line, triangle and a red label at the top of the plot
  ops.push({ t: 'line', x1: failX, y1: T, x2: failX, y2: T + ph, stroke: FAIL, width: 1.4 });
  ops.push({ t: 'area', pts: [[failX - size * 0.45, T - size * 0.55], [failX + size * 0.45, T - size * 0.55], [failX, T]], fill: FAIL, opacity: 1 });
  const fs = size * 0.9, flw = textW(spec.end_label, fs) + size * 0.9;
  const fx = Math.min(failX + flw / 2, W - 1) - flw;
  ops.push({ t: 'rect', x: fx, y: T - size * 0.6 - fs * 1.35, w: flw, h: fs * 1.35, fill: FAIL });
  ops.push({ t: 'text', x: fx + flw / 2, y: T - size * 0.6 - fs * 0.35, s: spec.end_label, size: fs, color: '#ffffff', anchor: 'middle', bold: true });
  // title (+ aggregation note) + unit + legend (top row)
  ops.push({ t: 'text', x: 0, y: size * 1.1, s: spec.title, size: size * 1.1, color: INKC, anchor: 'start', bold: true });
  ops.push({ t: 'text', x: L - size * 0.5, y: T - size * 0.6, s: spec.unit, size: size * 0.9, color: AXIS, anchor: 'end' });
  if (spec.agg) ops.push({ t: 'text', x: L + size * 0.3, y: T - size * 0.6, s: spec.agg, size: size * 0.85, color: AXIS, anchor: 'start' });
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
  const pts = (p: [number, number][]) => p.map(q => q.map(n => n.toFixed(2)).join(',')).join(' ');
  const parts = layoutChart(spec, W, H, size).map(o => {
    switch (o.t) {
      case 'rect': return `<rect x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" fill="${o.fill}"/>`;
      case 'line': return `<line x1="${o.x1}" y1="${o.y1}" x2="${o.x2}" y2="${o.y2}" stroke="${o.stroke}" stroke-width="${o.width}"${o.dash ? ` stroke-dasharray="${o.dash.join(' ')}"` : ''}/>`;
      case 'poly': return `<polyline points="${pts(o.pts)}" fill="none" stroke="${o.stroke}" stroke-width="${o.width}" stroke-linejoin="round"/>`;
      case 'area': return `<polygon points="${pts(o.pts)}" fill="${o.fill}" fill-opacity="${o.opacity}" stroke="none"/>`;
      case 'dot': return `<circle cx="${o.x.toFixed(2)}" cy="${o.y.toFixed(2)}" r="${o.r}" fill="${o.fill}"${o.ring ? ` stroke="${o.ring}" stroke-width="1.1"` : ''}/>`;
      case 'text': return `<text x="${o.x.toFixed(2)}" y="${o.y.toFixed(2)}" font-size="${o.size}" fill="${o.color}" text-anchor="${o.anchor}"${o.bold ? ' font-weight="700"' : ''}>${esc(o.s)}</text>`;
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="DejaVu Sans Condensed, Arial Narrow, Arial, sans-serif">${parts.join('')}</svg>`;
}
