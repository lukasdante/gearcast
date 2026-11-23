/** Render a filled .docx tree to PDF with pdf-lib (port of backend docx_pdf.py, which used reportlab).
 * Same layout rules: template grid widths (scaled to the frame), gridSpan/vMerge, cell shading, bold/colour/size runs,
 * ☐/☒ tick boxes, the "HOW TO FILL IN" page skipped, footer + page numbers, DejaVu Sans Condensed. Reportlab's
 * metrics are reproduced: leading = 1.22 × size, first baseline = top − size, cell padding 3.5/2.5, frame padding 6. */
import { PDFDocument, PDFFont, PDFImage, PDFPage, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { Doc, El, find, iter, kid, kids, textOf } from './xml';
import { layoutChart, type TrendSpec } from './chart';

const TWIP = 1 / 20;
const hex = (h: string) => { const n = parseInt(h.replace('#', ''), 16); return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); };
const GRID = hex('#8a9bb0'), INK = '#1a1a1a';
const FEATURES = { liga: false, clig: false, calt: false, kern: false, rlig: false, dlig: false } as any;

interface Frag { t: string; b: boolean }
interface Para { frags: Frag[]; size: number; color: string; align: 0 | 1 | 2; spaceAfter: number }
interface Line { words: Frag[][]; w: number }
interface Fonts { r: PDFFont; b: PDFFont; wr: Map<string, number>; wb: Map<string, number> }
/** An inline picture: a raster image (rid) or a vector chart (chart index). */
interface Img { k: 'img'; rid: string; chart: number | null; w: number; h: number; align: 0 | 1 | 2 }
type Block = { k: 'p'; p: Para; lines?: Line[] } | Img;

/** Extra content the .docx tree refers to: image bytes by rId, chart specs for gc-chart:N drawings. */
export interface PdfExtras { images?: Record<string, { bytes?: Uint8Array; ext: 'png' | 'jpeg' }>; charts?: TrendSpec[] }
let EXTRAS: PdfExtras = {};

function drawingOf(p: El): Img | null {
  const inl = find(p, 'wp:inline');
  if (!inl) return null;
  const ext = kid(inl, 'wp:extent'), doc = kid(inl, 'wp:docPr'), blip = find(inl, 'a:blip');
  const w = ext ? parseInt(ext.a.cx, 10) / 12700 : 0, h = ext ? parseInt(ext.a.cy, 10) / 12700 : 0;
  const m = /^gc-chart:(\d+)$/.exec(doc?.a.descr || '');
  const chart = m ? parseInt(m[1], 10) : null;
  const rid = blip?.a['r:embed'] || '';
  if (chart !== null ? !EXTRAS.charts?.[chart] : !EXTRAS.images?.[rid]?.bytes) return null;
  const ppr = kid(p, 'w:pPr'), jc = ppr ? kid(ppr, 'w:jc') : undefined;
  const align = jc ? (({ center: 1, right: 2, end: 2 } as any)[jc.a['w:val']] ?? 0) : 0;
  return { k: 'img', rid, chart, w, h, align };
}

function charW(F: Fonts, ch: string, bold: boolean): number {
  const m = bold ? F.wb : F.wr;
  let w = m.get(ch);
  if (w === undefined) { try { w = (bold ? F.b : F.r).widthOfTextAtSize(ch, 1000) / 1000; } catch { w = 0.6; } m.set(ch, w); }
  return w;
}
const strW = (F: Fonts, s: string, bold: boolean, size: number) => { let w = 0; for (const ch of s) w += charW(F, ch, bold); return w * size; };

// ------------------------------------------------------------------ docx → paragraphs (docx_pdf._runs_markup / _para)
function runsMarkup(p: El, defSize: number): { frags: Frag[]; size: number; color: string | null } {
  const frags: Frag[] = [];
  let size = defSize, color: string | null = null, any = false;
  for (const r of iter(p, 'w:r')) {
    if (r === p) continue;
    const rpr = kid(r, 'w:rPr');
    const bEl = rpr ? kid(rpr, 'w:b') : undefined;
    const bold = !!bEl && !['0', 'false'].includes(bEl.a['w:val']);
    if (rpr) {
      const sz = kid(rpr, 'w:sz');
      if (sz) size = any ? Math.max(size, parseInt(sz.a['w:val'], 10) / 2) : parseInt(sz.a['w:val'], 10) / 2;
      const c = kid(rpr, 'w:color');
      if (c && color === null && c.a['w:val'] !== undefined && c.a['w:val'] !== 'auto') color = '#' + c.a['w:val'];
    }
    let txt = '';
    for (const node of kids(r)) {
      if (node.n === 'w:t') txt += textOf(node);
      else if (node.n === 'w:tab') txt += '    ';
      else if ((node.n === 'w:br' || node.n === 'w:cr') && node.a['w:type'] !== 'page') txt += '\n';
      else if (node.n === 'w:sym') txt += ['2612', 'F0FE'].includes((node.a['w:char'] || '').toUpperCase()) ? '☒' : '☐';
    }
    if (txt) { frags.push({ t: txt, b: bold }); any = true; }
  }
  return { frags, size, color };
}

function para(p: El, def = 8.5, align: 0 | 1 | 2 = 0, inCell = false): Para | null {
  const { frags, size, color } = runsMarkup(p, def);
  if (!frags.map(f => f.t).join('').trim()) return null;
  const ppr = kid(p, 'w:pPr');
  const jc = ppr ? kid(ppr, 'w:jc') : undefined;
  if (jc) align = ({ center: 1, right: 2, end: 2 } as any)[jc.a['w:val']] ?? align;
  return { frags, size, color: color || INK, align, spaceAfter: inCell ? 0 : 2 };
}

// ------------------------------------------------------------------ paragraph wrapping (reportlab breakLines, simplified)
function words(frags: Frag[]): (Frag[] | null)[] {
  // null = forced line break (<br/>)
  const out: (Frag[] | null)[] = [];
  let cur: Frag[] = [];
  const flush = () => { if (cur.length) out.push(cur); cur = []; };
  for (const f of frags) {
    const parts = f.t.split(/(\n|[ \t\r\f\v]+)/);
    for (const s of parts) {
      if (!s) continue;
      if (s === '\n') { flush(); out.push(null); }
      else if (/^[ \t\r\f\v]+$/.test(s)) flush();
      else cur.push({ t: s, b: f.b });
    }
  }
  flush();
  return out;
}

function wrap(F: Fonts, p: Para, maxW: number): Line[] {
  const lines: Line[] = [];
  let line: Line = { words: [], w: 0 };
  const sp = (w: Frag[]) => strW(F, ' ', w[w.length - 1].b, p.size);
  const ww = (w: Frag[]) => w.reduce((a, f) => a + strW(F, f.t, f.b, p.size), 0);
  for (const w of words(p.frags)) {
    if (w === null) { lines.push(line); line = { words: [], w: 0 }; continue; }
    let wW = ww(w);
    const gap = line.words.length ? sp(line.words[line.words.length - 1]) : 0;
    if (!line.words.length || line.w + gap + wW <= maxW + 1e-8) { line.words.push(w); line.w += gap + wW; continue; }
    if (wW > maxW) { // split long word by characters
      let piece: Frag[] = [], pw = 0;
      lines.push(line); line = { words: [], w: 0 };
      for (const f of w) for (const ch of f.t) {
        const cw = strW(F, ch, f.b, p.size);
        if (pw + cw > maxW && pw > 0) { line.words.push(piece); line.w = pw; lines.push(line); line = { words: [], w: 0 }; piece = []; pw = 0; }
        const last = piece[piece.length - 1];
        if (last && last.b === f.b) last.t += ch; else piece.push({ t: ch, b: f.b });
        pw += cw;
      }
      line.words.push(piece); line.w = pw; wW = 0;
      continue;
    }
    lines.push(line);
    line = { words: [w], w: wW };
  }
  if (line.words.length || !lines.length) lines.push(line);
  return lines;
}

const leading = (p: Para) => p.size * 1.22;

function drawLines(page: PDFPage, F: Fonts, p: Para, lines: Line[], x: number, top: number, maxW: number) {
  const color = hex(p.color);
  let y = top - p.size;
  for (const ln of lines) {
    let cx = x + (p.align === 1 ? (maxW - ln.w) / 2 : p.align === 2 ? maxW - ln.w : 0);
    ln.words.forEach((w, wi) => {
      if (wi) cx += strW(F, ' ', ln.words[wi - 1][ln.words[wi - 1].length - 1].b, p.size);
      for (const f of w) {
        page.drawText(f.t, { x: cx, y, size: p.size, font: f.b ? F.b : F.r, color });
        cx += strW(F, f.t, f.b, p.size);
      }
    });
    y -= leading(p);
  }
}

// ------------------------------------------------------------------ tables
interface Cell { blocks: Block[]; h: number; span: number; rowSpan: number; fill: string | null; covered?: boolean }
const IMG_GAP = 3;
interface Table { widths: number[]; rows: Cell[][]; heights: number[]; width: number }
const PAD_L = 3.5, PAD_R = 3.5, PAD_T = 2.5, PAD_B = 2.5;

function table(F: Fonts, tbl: El, availW: number): Table {
  const tg = kid(tbl, 'w:tblGrid');
  const grid = tg ? kids(tg, 'w:gridCol').map(g => parseInt(g.a['w:w'], 10) * TWIP) : [];
  const trs = kids(tbl, 'w:tr');
  const gsum = grid.reduce((a, b) => a + b, 0);
  const scale = grid.length && gsum ? Math.min(1.0, availW / gsum) : 1.0;
  const ncols = grid.length || Math.max(...trs.map(tr => kids(tr, 'w:tc').length));
  const widths = grid.length ? grid.map(g => g * scale) : Array(ncols).fill(availW / ncols);
  const rows: Cell[][] = [];
  const vopen: Record<number, number> = {};
  trs.forEach((tr, ri) => {
    const row: Cell[] = Array.from({ length: ncols }, () => ({ blocks: [] as Block[], h: 0, span: 1, rowSpan: 1, fill: null }));
    let ci = 0;
    for (const tc of kids(tr, 'w:tc')) {
      if (ci >= ncols) break;
      const tcpr = kid(tc, 'w:tcPr');
      let span = 1, fill: string | null = null;
      if (tcpr) {
        const gs = kid(tcpr, 'w:gridSpan');
        span = gs ? parseInt(gs.a['w:val'], 10) : 1;
        const shd = kid(tcpr, 'w:shd');
        const fl = shd ? shd.a['w:fill'] : undefined;
        if (fl && !['auto', 'ffffff'].includes(fl.toLowerCase())) fill = '#' + fl;
        const vm = kid(tcpr, 'w:vMerge');
        if (vm) {
          if (vm.a['w:val'] === 'restart') vopen[ci] = ri;
          else if (ci in vopen) { rows[vopen[ci]][ci].rowSpan = ri - vopen[ci] + 1; row[ci].covered = true; }
        }
      }
      const cell = row[ci];
      cell.blocks = kids(tc, 'w:p').map((p): Block | null => { const d = drawingOf(p); if (d) return d; const q = para(p, 8.5, 0, true); return q ? { k: 'p', p: q } : null; })
        .filter((b): b is Block => !!b);
      cell.span = span; cell.fill = fill;
      for (let k = 1; k < span && ci + k < ncols; k++) row[ci + k].covered = true;
      ci += span;
    }
    rows.push(row);
  });
  // row heights (reportlab: flowable cells = Σ paragraph heights + padding; empty cells = one 12 pt line + padding)
  const heights = rows.map(row => {
    let h = 0;
    row.forEach((c, ci) => {
      if (c.covered) return;
      const w = widths.slice(ci, ci + c.span).reduce((a, b) => a + b, 0) - PAD_L - PAD_R;
      for (const b of c.blocks) if (b.k === 'p') b.lines = wrap(F, b.p, w); else if (b.w > w) { b.h *= w / b.w; b.w = w; }
      const t = c.blocks.length ? c.blocks.reduce((a, b) => a + (b.k === 'p' ? b.lines!.length * leading(b.p) : b.h + IMG_GAP * 2), 0) + PAD_T + PAD_B : 12 + PAD_T + PAD_B;
      c.h = t;
      if (c.rowSpan === 1 && t > h) h = t;
    });
    return h;
  });
  return { widths, rows, heights, width: widths.reduce((a, b) => a + b, 0) };
}

function drawRows(page: PDFPage, F: Fonts, t: Table, x0: number, top: number, r0: number, r1: number, imgs: Map<string, PDFImage>) {
  const colX = [x0];
  for (const w of t.widths) colX.push(colX[colX.length - 1] + w);
  const rowY = [top];
  for (let r = r0; r < r1; r++) rowY.push(rowY[rowY.length - 1] - t.heights[r]);
  const geo: [Cell, number, number, number, number][] = [];
  for (let r = r0; r < r1; r++) t.rows[r].forEach((c, ci) => {
    if (c.covered) return;
    const re = Math.min(r1, r + c.rowSpan);
    geo.push([c, colX[ci], rowY[r - r0], colX[Math.min(ci + c.span, t.widths.length)] - colX[ci], rowY[r - r0] - rowY[re - r0]]);
  });
  for (const [c, x, y, w, h] of geo) if (c.fill) page.drawRectangle({ x, y: y - h, width: w, height: h, color: hex(c.fill), borderWidth: 0 });
  for (const [c, x, y, w] of geo) {
    let cy = y - PAD_T;
    for (const b of c.blocks) {
      if (b.k === 'p') { drawLines(page, F, b.p, b.lines!, x + PAD_L, cy, w - PAD_L - PAD_R); cy -= b.lines!.length * leading(b.p); continue; }
      const iw = w - PAD_L - PAD_R;
      drawImg(page, F, b, x + PAD_L + (b.align === 1 ? (iw - b.w) / 2 : b.align === 2 ? iw - b.w : 0), cy - IMG_GAP, imgs);
      cy -= b.h + IMG_GAP * 2;
    }
  }
  for (const [, x, y, w, h] of geo) page.drawRectangle({ x, y: y - h, width: w, height: h, borderColor: GRID, borderWidth: 0.5 });
}

// ------------------------------------------------------------------ pictures and charts
function drawChart(page: PDFPage, F: Fonts, spec: TrendSpec, x: number, top: number, w: number, h: number) {
  const Y = (y: number) => top - y;
  for (const o of layoutChart(spec, w, h, 7)) {
    if (o.t === 'rect') page.drawRectangle({ x: x + o.x, y: Y(o.y + o.h), width: o.w, height: o.h, color: hex(o.fill), borderWidth: 0 });
    else if (o.t === 'line') page.drawLine({ start: { x: x + o.x1, y: Y(o.y1) }, end: { x: x + o.x2, y: Y(o.y2) }, thickness: o.width, color: hex(o.stroke), dashArray: o.dash });
    else if (o.t === 'poly') page.drawSvgPath('M ' + o.pts.map(p => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(' L '), { x, y: top, borderColor: hex(o.stroke), borderWidth: o.width, borderLineCap: 1 as any });
    else if (o.t === 'dot') page.drawCircle({ x: x + o.x, y: Y(o.y), size: o.r, color: hex(o.fill), borderWidth: 0 });
    else {
      const tw = strW(F, o.s, !!o.bold, o.size);
      const tx = o.anchor === 'end' ? o.x - tw : o.anchor === 'middle' ? o.x - tw / 2 : o.x;
      page.drawText(o.s, { x: x + tx, y: Y(o.y), size: o.size, font: o.bold ? F.b : F.r, color: hex(o.color) });
    }
  }
  page.drawRectangle({ x, y: top - h, width: w, height: h, borderColor: GRID, borderWidth: 0.5 });
}
function drawImg(page: PDFPage, F: Fonts, b: Img, x: number, top: number, imgs: Map<string, PDFImage>) {
  if (b.chart !== null) { drawChart(page, F, EXTRAS.charts![b.chart], x, top, b.w, b.h); return; }
  const im = imgs.get(b.rid);
  if (im) page.drawImage(im, { x, y: top - b.h, width: b.w, height: b.h });
}

// ------------------------------------------------------------------ document
type Flow = { k: 'p'; p: Para } | { k: 'space'; h: number } | { k: 'tbl'; t: Table } | { k: 'break' } | { k: 'img'; img: Img };

export interface PdfFonts { regular: Uint8Array | ArrayBuffer; bold: Uint8Array | ArrayBuffer }

export async function docToPdf(doc: Doc, fonts: PdfFonts, footer = '', skipInstructions = true, extras: PdfExtras = {}): Promise<Uint8Array> {
  EXTRAS = extras;
  const pdf = await PDFDocument.create();
  const imgs = new Map<string, PDFImage>();
  for (const [rid, im] of Object.entries(extras.images || {})) {
    if (!im.bytes) continue;
    try { imgs.set(rid, im.ext === 'png' ? await pdf.embedPng(im.bytes) : await pdf.embedJpg(im.bytes)); } catch { /* unreadable image: left out */ }
  }
  pdf.registerFontkit(fontkit);
  const F: Fonts = {
    r: await pdf.embedFont(fonts.regular, { subset: true, features: FEATURES }),
    b: await pdf.embedFont(fonts.bold, { subset: true, features: FEATURES }), wr: new Map(), wb: new Map(),
  };
  pdf.setTitle('Equipment incident report');
  pdf.setProducer('GearCast'); pdf.setCreator('GearCast');
  const body = kid(doc.root, 'w:body')!;
  const sect = kid(body, 'w:sectPr');
  const pgSz = sect && kid(sect, 'w:pgSz'), pgMar = sect && kid(sect, 'w:pgMar');
  const tw = (e: El | undefined, k: string, d: number) => (e && e.a[k] ? parseInt(e.a[k], 10) * TWIP || d : d);
  const pageW = tw(pgSz, 'w:w', 595.2755905511812), pageH = tw(pgSz, 'w:h', 841.8897637795277);
  const lm = tw(pgMar, 'w:left', 36), rm = tw(pgMar, 'w:right', 36), tm = tw(pgMar, 'w:top', 36), bm = tw(pgMar, 'w:bottom', 36);
  const avail = pageW - lm - rm;
  const frameW = avail - 12;

  const story: Flow[] = [];
  let skipping = false;
  const hasPageBreak = (e: El) => { for (const b of iter(e, 'w:br')) if (b.a['w:type'] === 'page') return true; return false; };
  for (const e of kids(body)) {
    const text = [...iter(e, 'w:t')].map(textOf).join('').trim();
    if (skipInstructions && e.n === 'w:p' && text.toUpperCase().startsWith('HOW TO FILL IN')) skipping = true;
    if (skipping) { if (hasPageBreak(e)) skipping = false; continue; }
    if (e.n === 'w:p') {
      if (hasPageBreak(e)) { story.push({ k: 'break' }); continue; }
      const d = drawingOf(e);
      if (d) { if (d.w > frameW) { d.h *= frameW / d.w; d.w = frameW; } story.push({ k: 'img', img: d }, { k: 'space', h: 3 }); continue; }
      const p = para(e);
      story.push(p ? { k: 'p', p } : { k: 'space', h: 4 });
    } else if (e.n === 'w:tbl') {
      story.push({ k: 'tbl', t: table(F, e, avail) }, { k: 'space', h: 5 });
    }
  }

  // frame layout (SimpleDocTemplate: one frame per page, 6 pt padding)
  const fx = lm + 6, fTop = pageH - tm - 6, fBottom = bm + 6;
  let page = pdf.addPage([pageW, pageH]);
  let y = fTop, onPage = 0;
  const newPage = () => { page = pdf.addPage([pageW, pageH]); y = fTop; onPage = 0; };
  // keep-with-next: a section bar (one-row table) or a heading paragraph stays on the page of what follows it
  const head = (fl: Flow | undefined) => (!fl ? 0 : fl.k === 'tbl' ? fl.t.heights[0] + (fl.t.heights[1] ?? 0) : fl.k === 'img' ? fl.img.h
    : fl.k === 'p' ? leading(fl.p) * Math.min(2, wrap(F, fl.p, frameW).length) : 0);
  const nextReal = (i: number) => { for (let j = i + 1; j < story.length; j++) if (story[j].k !== 'space') return story[j]; return undefined; };
  story.forEach((fl, i) => {
    const nx = nextReal(i);
    const isBar = fl.k === 'tbl' && fl.t.rows.length === 1 && nx?.k === 'tbl';
    const isCaption = fl.k === 'p' && nx?.k === 'img';
    if (isBar || isCaption) (fl as any).keep = head(fl) + 5 + head(nx);
  });
  for (const fl of story) {
    if ((fl as any).keep && onPage && y - (fl as any).keep < fBottom) newPage();
    if (fl.k === 'break') { if (onPage) newPage(); continue; }
    if (fl.k === 'space') { if (y - fl.h < fBottom) { newPage(); continue; } y -= fl.h; onPage++; continue; }
    if (fl.k === 'img') {
      const b = fl.img;
      if (y - b.h < fBottom && onPage) newPage();
      drawImg(page, F, b, fx + (b.align === 1 ? (frameW - b.w) / 2 : b.align === 2 ? frameW - b.w : 0), y, imgs);
      y -= b.h; onPage++;
      continue;
    }
    if (fl.k === 'p') {
      const lines = wrap(F, fl.p, frameW);
      const L = leading(fl.p);
      let i = 0;
      while (i < lines.length) {
        let fit = Math.floor((y - fBottom + 1e-6) / L);
        const rest = lines.length - i;
        if (fit < rest && (fit < 1 || (i === 0 && fit === 1 && rest > 1))) { if (onPage) { newPage(); continue; } fit = Math.max(1, fit); }
        const n = Math.min(fit, rest);
        drawLines(page, F, fl.p, lines.slice(i, i + n), fx, y, frameW);
        y -= n * L; i += n; onPage++;
        if (i < lines.length) newPage();
      }
      y -= fl.p.spaceAfter;
      continue;
    }
    const t = fl.t;
    const x0 = fx + (frameW - t.width) / 2;
    let r = 0;
    while (r < t.rows.length) {
      let h = 0, n = 0;
      while (r + n < t.rows.length && y - h - t.heights[r + n] >= fBottom - 1e-6) { h += t.heights[r + n]; n++; }
      if (n === 0) { if (onPage) { newPage(); continue; } h = t.heights[r]; n = 1; }
      drawRows(page, F, t, x0, y, r, r + n, imgs);
      y -= h; r += n; onPage++;
      if (r < t.rows.length) newPage();
    }
  }
  // footer on every page
  const grey = hex('#777777');
  pdf.getPages().forEach((pg, i) => {
    if (footer) pg.drawText(footer, { x: lm, y: bm * 0.45, size: 6.5, font: F.r, color: grey });
    const s = `Page ${i + 1}`;
    pg.drawText(s, { x: pageW - rm - strW(F, s, false, 6.5), y: bm * 0.45, size: 6.5, font: F.r, color: grey });
  });
  return pdf.save();
}
export { find };
