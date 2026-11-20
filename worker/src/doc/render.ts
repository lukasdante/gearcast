/** Fill the client's Incident_Report_Form_v1.2.docx with a draft (port of backend render.py). */
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { Doc, El, append, el, find, iter, kids, parse, remove, serialize, textOf } from './xml';
import { fmtComma, pyStr, strip } from '../py';

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
export function fillDocument(doc: Doc, draft: any): Doc {
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
    ['other attachments', 'Readings export and work orders stored with the report in GearCast.'],
  ];
  const or = (v: any, d: any) => (v ? v : d);

  const body = kids(doc.root, 'w:body')[0];
  for (const t of kids(body, 'w:tbl')) {
    const rows = kids(t, 'w:tr');
    const head = cells(rows[0]).map(c => strip(cellText(c)).toLowerCase());
    const at = (ri: number) => cells(rows[ri]);
    if (head.length && head[0].startsWith('gearcast') && head.length >= 3) { setText(at(0)[2], `Report No.: ${s(f[1])}\nDraft date: ${s(f[2])}`); continue; }
    if (rows.length === 2 && head.length === 1) { for (const [k, v] of blocks) if (head[0].startsWith(k)) setText(at(1)[0], v); continue; }
    const h2 = head.slice(0, 2).join('|');
    const zip = (cs: El[], vs: any[], fn: (c: El, v: any) => void) => { for (let i = 0; i < Math.min(cs.length, vs.length); i++) fn(cs[i], vs[i]); };
    if (h2 === 'indicator|6 weeks before') {
      (tables.readings || []).slice(0, rows.length - 1).forEach((r: any, i: number) => zip(at(i + 1), [r.indicator, r.six_weeks_before, r.day_before, r.limit, r.comment], (c, v) => setText(c, v === null || v === undefined ? '—' : v)));
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
export const filledTree = (tpl: Template, draft: any) => fillDocument(parse(tpl.xml), draft);
/** Filled .docx bytes. */
export function renderDocx(tpl: Template, draft: any): Uint8Array {
  const doc = filledTree(tpl, draft);
  return zipSync({ ...tpl.files, 'word/document.xml': strToU8(serialize(doc)) }, { level: 6 });
}
