/** Fill the client's Incident_Report_Form_v1.2.docx with a draft (port of backend render.py). */
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { Doc, El, append, el, find, iter, kids, parse, remove, serialize, textOf } from './xml';
import { fmtComma, pyStr, strip } from '../py';
import type { TrendSpec } from './chart';

/** An image placed in the document: pixel size for the aspect ratio; bytes only when writing a .docx or PDF. */
export interface DocImage { w: number; h: number; ext: 'png' | 'jpeg'; bytes?: Uint8Array }
export interface FillOptions {
  /** rId → image. Photos: gcPhoto1..4. Chart PNGs (DOCX only): gcChart0..1. */
  images?: Record<string, DocImage>;
  /** true for the PDF: charts are drawn as vector graphics from draft.tables.trends, no PNG needed. */
  vectorCharts?: boolean;
}
export const photoRid = (i: number) => `gcPhoto${i + 1}`;
export const chartRid = (i: number) => `gcChart${i}`;
export const CHART_W = 515, CHART_H = 165; // points (content width of the form)
const EMU = 12700;
let drawingId = 1000;

/** <w:p> holding one inline picture (WordprocessingML drawing). descr carries the marker the PDF renderer reads. */
function drawingPara(rid: string, descr: string, wPt: number, hPt: number, center = false): El {
  const cx = String(Math.round(wPt * EMU)), cy = String(Math.round(hPt * EMU)), id = String(++drawingId);
  const pic = el('pic:pic', { 'xmlns:pic': 'http://schemas.openxmlformats.org/drawingml/2006/picture' }, [
    el('pic:nvPicPr', {}, [el('pic:cNvPr', { id, name: rid }), el('pic:cNvPicPr')]),
    el('pic:blipFill', {}, [el('a:blip', { 'r:embed': rid }), el('a:stretch', {}, [el('a:fillRect')])]),
    el('pic:spPr', {}, [el('a:xfrm', {}, [el('a:off', { x: '0', y: '0' }), el('a:ext', { cx, cy })]), el('a:prstGeom', { prst: 'rect' }, [el('a:avLst')])]),
  ]);
  const inline = el('wp:inline', { distT: '0', distB: '0', distL: '0', distR: '0' }, [
    el('wp:extent', { cx, cy }), el('wp:docPr', { id, name: rid, descr }),
    el('wp:cNvGraphicFramePr', {}, [el('a:graphicFrameLocks', { 'xmlns:a': 'http://schemas.openxmlformats.org/drawingml/2006/main', noChangeAspect: '1' })]),
    el('a:graphic', { 'xmlns:a': 'http://schemas.openxmlformats.org/drawingml/2006/main' }, [
      el('a:graphicData', { uri: 'http://schemas.openxmlformats.org/drawingml/2006/picture' }, [pic])]),
  ]);
  const pPr = el('w:pPr', {}, [el('w:spacing', { 'w:before': '40', 'w:after': '40' }), ...(center ? [el('w:jc', { 'w:val': 'center' })] : [])]);
  return el('w:p', {}, [pPr, el('w:r', {}, [el('w:drawing', {}, [inline])])]);
}
function textPara(text: string, size = 8.5, bold = false, color = '101010', jc = '', keepNext = false): El {
  const rPr = el('w:rPr', {}, [el('w:rFonts', { 'w:ascii': 'Arial', 'w:hAnsi': 'Arial' }), ...(bold ? [el('w:b')] : []), el('w:color', { 'w:val': color }), el('w:sz', { 'w:val': String(Math.round(size * 2)) })]);
  const pPr = el('w:pPr', {}, [...(keepNext ? [el('w:keepNext')] : []), el('w:spacing', { 'w:before': '20', 'w:after': '40' }), ...(jc ? [el('w:jc', { 'w:val': jc })] : [])]);
  return el('w:p', {}, [pPr, el('w:r', {}, [rPr, el('w:t', { 'xml:space': 'preserve' }, [text])])]);
}
/** Full-width 2-column table: shaded title row, item rows, bold TOTAL row (the shutdown cost breakdown). */
function costTableEl(ct: any): El {
  const W1 = 7738, W2 = 2580;
  const border = (side: string) => el(`w:${side}`, { 'w:val': 'single', 'w:sz': '4', 'w:color': '9AA8B8' });
  const tc = (w: number, kids: El[], fill = '', span = 1) => el('w:tc', {}, [el('w:tcPr', {}, [el('w:tcW', { 'w:type': 'dxa', 'w:w': String(w) }),
    ...(span > 1 ? [el('w:gridSpan', { 'w:val': String(span) })] : []),
    el('w:tcBorders', {}, ['top', 'left', 'bottom', 'right'].map(border)), ...(fill ? [el('w:shd', { 'w:val': 'clear', 'w:color': 'auto', 'w:fill': fill })] : [])]), ...kids]);
  const tr = (cs: El[]) => el('w:tr', {}, cs);
  const php = (v: any) => `PHP ${fmtComma(Number(v || 0), 0)}`;
  return el('w:tbl', {}, [
    el('w:tblPr', {}, [el('w:tblW', { 'w:type': 'dxa', 'w:w': String(W1 + W2) })]),
    el('w:tblGrid', {}, [el('w:gridCol', { 'w:w': String(W1) }), el('w:gridCol', { 'w:w': String(W2) })]),
    tr([tc(W1 + W2, [textPara(ct.title.toUpperCase(), 9, true, 'FFFFFF')], '1F3864', 2)]),
    tr([tc(W1 + W2, [textPara(ct.note, 7.5, false, '37434A')], 'F3F5F7', 2)]),
    ...ct.rows.map((r: any[]) => tr([tc(W1, [textPara(r[0])]), tc(W2, [textPara(php(r[1]), 8.5, false, '101010', 'right')])])),
    tr([tc(W1, [textPara('TOTAL COST ESTIMATE', 9.5, true)], 'E3EAF2'), tc(W2, [textPara(php(ct.total), 9.5, true, 'B00020', 'right')], 'E3EAF2')]),
  ]);
}
/** Summary beside Photo 1 (2 columns, placed under "Symptom observed"); without a photo the summary spans the row. */
function summaryTableEl(summary: string, photo: any, img: DocImage | undefined): El {
  const W1 = photo ? 6118 : 10318, W2 = 4200;
  const border = (side: string) => el(`w:${side}`, { 'w:val': 'single', 'w:sz': '4', 'w:color': '9AA8B8' });
  const tc = (w: number, kids: El[], fill = '') => el('w:tc', {}, [el('w:tcPr', {}, [el('w:tcW', { 'w:type': 'dxa', 'w:w': String(w) }),
    el('w:tcBorders', {}, ['top', 'left', 'bottom', 'right'].map(border)), ...(fill ? [el('w:shd', { 'w:val': 'clear', 'w:color': 'auto', 'w:fill': fill })] : [])]), ...kids]);
  const left = tc(W1, [textPara('Summary', 8.5, true, '1F3864'), ...String(summary || '—').split('\n').map(t => textPara(t, 8.5))], 'F7F9FB');
  const cellsOut = [left];
  if (photo) {
    const kidsR: El[] = [textPara('Photo 1', 8.5, true, '1F3864')];
    if (img) { const [w, h] = fit(img.w, img.h, 200, 150); kidsR.push(drawingPara(photoRid(0), 'gc-photo:0', w, h, true)); }
    else kidsR.push(textPara('(photo stored in GearCast)', 7.5, false, '777777'));
    if (photo.caption) kidsR.push(textPara(photo.caption, 7.5, false, '37434A', 'center'));
    cellsOut.push(tc(W2, kidsR));
  }
  return el('w:tbl', {}, [
    el('w:tblPr', {}, [el('w:tblW', { 'w:type': 'dxa', 'w:w': String(photo ? W1 + W2 : W1) })]),
    el('w:tblGrid', {}, [el('w:gridCol', { 'w:w': String(W1) }), ...(photo ? [el('w:gridCol', { 'w:w': String(W2) })] : [])]),
    el('w:tr', {}, cellsOut),
  ]);
}
function insertAfter(ref: El, nodes: El[]) {
  const p = ref.p!; const i = p.c.indexOf(ref);
  nodes.forEach(n => (n.p = p));
  p.c.splice(i + 1, 0, ...nodes);
}
const fit = (w: number, h: number, maxW: number, maxH: number) => { const k = Math.min(maxW / w, maxH / h); return [w * k, h * k]; };

/** python-docx Run.text */
function runText(r: El): string {
  let s = '';
  for (const c of kids(r)) {
    if (c.n === 'w:t') s += textOf(c);
    else if (c.n === 'w:tab' || c.n === 'w:ptab') s += '\t';
    else if (c.n === 'w:br') s += c.a['w:type'] && c.a['w:type'] !== 'textWrapping' ? '' : '\n';
    else if (c.n === 'w:cr') s += '\n';
    else if (c.n === 'w:noBreakHyphen') s += '-';
  }
  return s;
}
/** python-docx Paragraph.text (direct runs and hyperlinks only) */
export function paraText(p: El): string {
  let s = '';
  for (const c of kids(p)) {
    if (c.n === 'w:r') s += runText(c);
    else if (c.n === 'w:hyperlink') for (const r of kids(c, 'w:r')) s += runText(r);
  }
  return s;
}
export const cellText = (tc: El) => kids(tc, 'w:p').map(paraText).join('\n');
const cells = (tr: El) => kids(tr, 'w:tc');

function setText(tc: El, text: any, size = 8.5) {
  const t = text === null || text === undefined ? '' : pyStr(text);
  const ps = kids(tc, 'w:p');
  let p = ps[0];
  if (!p) { p = el('w:p'); append(tc, p); }
  for (const extra of ps.slice(1)) remove(extra);
  for (const r of kids(p, 'w:r')) remove(r);
  const lines = t.split('\n');
  lines.forEach((line, i) => {
    const rPr = el('w:rPr', {}, [el('w:rFonts', { 'w:ascii': 'Arial', 'w:hAnsi': 'Arial' }), el('w:color', { 'w:val': '101010' }), el('w:sz', { 'w:val': String(Math.round(size * 2)) })]);
    const parts: El[] = [rPr];
    line.split('\t').forEach((seg, j) => {
      if (j) parts.push(el('w:tab'));
      if (seg) parts.push(el('w:t', /^\s|\s$/.test(seg) ? { 'xml:space': 'preserve' } : {}, [seg]));
    });
    if (i < lines.length - 1) parts.push(el('w:br'));
    append(p, el('w:r', {}, parts));
  });
}

function tick(tc: El, options: string[]) {
  const wanted = options.filter(o => o).map(o => o.toLowerCase());
  for (const p of kids(tc, 'w:p')) {
    const ks = kids(p);
    ks.forEach((e, i) => {
      if (e.n !== 'w:sdt') return;
      let label = '';
      for (const nxt of ks.slice(i + 1)) {
        if (nxt.n === 'w:sdt') break;
        for (const t of iter(nxt, 'w:t')) label += textOf(t);
      }
      label = strip(label.replace(/\s*\(.*/, '')).toLowerCase();
      if (label && wanted.includes(label)) {
        const chk = find(e, 'w14:checked');
        if (chk) chk.a['w14:val'] = '1';
        const sym = find(e, 'w:sym');
        if (sym) sym.a['w:char'] = '2612';
      }
    });
  }
}

/** Fill the parsed template document (mutates `doc`). */
export function fillDocument(doc: Doc, draft: any, opts: FillOptions = {}): Doc {
  const images = opts.images || {};
  const f: Record<number, any> = {};
  for (const x of draft.fields || []) f[x.field_no] = x.value;
  const inp = draft.inputs || {};
  const linked = draft.linked || {};
  const tables = draft.tables || {};
  const fe0 = linked.failure_event || {};
  const fe = fe0.event_id || 'New event (not yet in failure log)';
  const wos = [...[fe0.main_wo_id].filter(x => x), ...(linked.open_work_orders || []).slice(0, 2)].join(', ') || 'None open';
  const loss = (linked.cost || {}).loss || {};
  const first = (v: any) => strip(pyStr(v).split(' ·')[0]);
  const s = (v: any) => pyStr(v);

  const labelValues: Record<string, any> = {
    'report no.': f[1], 'draft date': f[2], 'linked failure event': fe, 'linked work orders': wos,
    'loss scenario': loss.scenario || 'None (standby available)', status: 'Draft',
    'reported by (role code)': inp.reported_by || 'Not recorded', 'drafted by': 'GearCast (AI-assisted draft)',
    'asset tag and description': f[5], 'location (process step)': f[6], 'date and time of failure': f[7],
    'reporter (role code)': inp.reported_by || 'Not recorded',
    'procedure followed': f[15], 'spare used (id)': inp.spare_used || 'None',
    'asset downtime (h)': f[17], 'time to restore (h)': 'Not recorded',
    'estimated production loss (php)': f[19], 'bypass hours / compliance exposure': f[20],
    'status effective (date/time)': draft.shut_down ? f[7] : '—',
    'authorised by (role)': draft.shut_down ? 'Head of Operations' : '—',
    'failure mode': f[22], 'failure mechanism': f[23],
    'labour (php)': fmtComma(Number(tables.labour_php ?? 0), 0), 'total repair cost (php)': fmtComma(Number(tables.repair_php ?? 0), 0),
    'return to service (date/time)': 'Not recorded', 'verified by / test done': 'Pending – OP-05 run test',
  };
  const ticks: Record<string, string[]> = {
    severity: [first(f[3])], shift: [first(f[8])], 'how it was detected': [first(f[9])],
    'operating condition': [first(f[10])], 'injury / safety': [first(f[21])],
    'standby unit': [s(f[16]).startsWith('Started') ? 'Started OK' : s(f[16]).includes('Not available') ? 'Not available' : 'Not needed'],
    'production impact': [first(f[18])],
    'resulting equipment status': [first(f[36]) === 'No change' ? 'No change' : first(f[36])],
    'root-cause checklist': s(f[26]).split(',').map(x => strip(x).replace('Handling/storage', 'Handling / storage')),
    'repair-or-replace result': [first(f[30])],
  };
  const blocks: [string, any][] = [
    ['symptom observed', f[11]], ['alerts that fired', f[13]], ['direct cause', f[24]], ['repair done', f[27]], ['lesson learned', f[32]],
    ['other attachments', `Readings export and work orders stored with the report in GearCast.${(draft.photos || []).length ? ` ${(draft.photos || []).length} photo(s) in section 10.` : ''}`],
  ];
  const or = (v: any, d: any) => (v ? v : d);

  const body = kids(doc.root, 'w:body')[0];
  for (const t of kids(body, 'w:tbl')) {
    const rows = kids(t, 'w:tr');
    const head = cells(rows[0]).map(c => strip(cellText(c)).toLowerCase());
    const at = (ri: number) => cells(rows[ri]);
    if (head.length && head[0].startsWith('gearcast') && head.length >= 3) { setText(at(0)[2], `Report No.: ${s(f[1])}\nDraft date: ${s(f[2])}`); continue; }
    if (rows.length === 2 && head.length === 1) {
      for (const [k, v] of blocks) if (head[0].startsWith(k)) setText(at(1)[0], v);
      const ph0 = (draft.photos || [])[0];
      if (head[0].startsWith('symptom observed') && (draft.summary || ph0)) insertAfter(t, [el('w:p'), summaryTableEl(s(draft.summary || ''), ph0, images[photoRid(0)])]);
      continue;
    }
    const h2 = head.slice(0, 2).join('|');
    const zip = (cs: El[], vs: any[], fn: (c: El, v: any) => void) => { for (let i = 0; i < Math.min(cs.length, vs.length); i++) fn(cs[i], vs[i]); };
    if (h2 === 'indicator|6 weeks before') {
      (tables.readings || []).slice(0, rows.length - 1).forEach((r: any, i: number) => zip(at(i + 1), [r.indicator, r.six_weeks_before, r.day_before, r.limit, r.comment], (c, v) => setText(c, v === null || v === undefined ? '—' : v)));
      const trends: TrendSpec[] = tables.trends || [];
      const add: El[] = [];
      trends.forEach((tr, i) => {
        if (!opts.vectorCharts && !images[chartRid(i)]) return;
        add.push(textPara(`Trend – ${tr.window_label ?? '6 weeks'} before the failure (${tr.start_date} to ${tr.end_date}${tr.agg ? `, ${tr.agg}` : ''}): ${tr.summary}`, 7.5, true, '1f3864', '', true));
        add.push(drawingPara(chartRid(i), `gc-chart:${i}`, CHART_W, CHART_H, true));
      });
      if (add.length) insertAfter(t, add);
      continue;
    }
    if (head[0] && head[0].startsWith('photo 1')) {
      const photos: any[] = draft.photos || [];
      if (!photos.length) continue;
      const cs = rows.flatMap(r => cells(r));
      cs.forEach((c, i) => {
        const ph = photos[i];
        for (const p of kids(c, 'w:p')) remove(p);
        append(c, textPara(`Photo ${i + 1}`, 8.5, true));
        const img = images[photoRid(i)];
        if (ph && img) { const [w, h] = fit(img.w, img.h, 240, 175); append(c, drawingPara(photoRid(i), `gc-photo:${i}`, w, h)); }
        else if (ph) append(c, textPara('(photo stored in GearCast)', 7.5, false, '777777'));
        append(c, textPara(ph ? `Caption: ${ph.caption || '—'}` : 'No photo', 8, false, ph ? '101010' : '999999'));
      });
      continue;
    }
    if (h2 === 'time|action') {
      (tables.actions || []).slice(0, rows.length - 1).forEach((a: any, i: number) => zip(at(i + 1), [a.time, a.action, a.by], (c, v) => setText(c, or(v, ''))));
      continue;
    }
    if (h2 === '5 whys|answer') { (tables.whys || []).slice(0, rows.length - 1).forEach((w: any, i: number) => setText(at(i + 1)[1], w)); continue; }
    if (h2 === 'part id|part name') {
      (tables.parts || []).slice(0, rows.length - 1).forEach((p: any, i: number) => zip(at(i + 1), [p.part_id, p.name, p.qty, fmtComma(Number(p.cost_php), 0)], (c, v) => setText(c, v)));
      continue;
    }
    if (h2 === '#|action') {
      (tables.capa || []).slice(0, rows.length - 1).forEach((a: any, i: number) => zip(at(i + 1).slice(1), [a.action, a.owner, a.due, a.status ?? 'Open'], (c, v) => setText(c, or(v, ''))));
      continue;
    }
    if (h2 === 'role|name / role code') { setText(at(1)[1], inp.reported_by || ''); setText(at(1)[2], f[2]); continue; }
    if (tables.cost && rows.some(r => cells(r).some(c => strip(cellText(c)).toLowerCase() === 'estimated production loss (php)'))) {
      insertAfter(t, [el('w:p'), costTableEl(tables.cost)]);
    }
    for (const r of rows) {
      const cs = cells(r);
      for (let i = 0; i < cs.length - 1; i += 2) {
        const key = strip(cellText(cs[i])).toLowerCase();
        if (key in ticks) tick(cs[i + 1], ticks[key]);
        else if (key in labelValues) setText(cs[i + 1], labelValues[key]);
      }
    }
  }
  return doc;
}

export interface Template { files: Record<string, Uint8Array>; xml: string }
export function loadTemplate(bytes: Uint8Array): Template {
  const files = unzipSync(bytes);
  return { files, xml: strFromU8(files['word/document.xml']) };
}
/** Filled document tree (for PDF rendering without a zip round trip). */
export const filledTree = (tpl: Template, draft: any, opts: FillOptions = {}) => fillDocument(parse(tpl.xml), draft, opts);
/** Filled .docx bytes. Images with bytes are written to word/media and linked by their rId. */
export function renderDocx(tpl: Template, draft: any, images: Record<string, DocImage> = {}): Uint8Array {
  const withBytes = Object.fromEntries(Object.entries(images).filter(([, v]) => v.bytes));
  const doc = filledTree(tpl, draft, { images: withBytes });
  const files: Record<string, Uint8Array> = { ...tpl.files, 'word/document.xml': strToU8(serialize(doc)) };
  const ids = Object.keys(withBytes);
  if (ids.length) {
    let rels = strFromU8(tpl.files['word/_rels/document.xml.rels']);
    const add = ids.map(id => {
      const name = `media/${id}.${withBytes[id].ext === 'png' ? 'png' : 'jpeg'}`;
      files[`word/${name}`] = withBytes[id].bytes!;
      return `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${name}"/>`;
    }).join('');
    rels = rels.replace('</Relationships>', add + '</Relationships>');
    files['word/_rels/document.xml.rels'] = strToU8(rels);
  }
  return zipSync(files, { level: 6 });
}
