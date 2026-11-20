/** Incident report documents, rendered in the browser with the same code the Worker has (worker/src/doc):
 * the client's Word form is filled (docx) and laid out to PDF with pdf-lib + DejaVu Sans Condensed.
 * PDF rendering takes hundreds of ms of CPU, more than the Workers free plan allows per request, so the app renders
 * and uploads the PDF once (PUT /api/incidents/{id}/pdf); downloads then serve the stored file. */
import type { Template } from '../../../worker/src/doc/render';
import type { PdfFonts } from '../../../worker/src/doc/pdf';

// Loaded on first use (pdf-lib + fontkit are large): keeps them out of the initial bundle.
const lib = () => Promise.all([import('../../../worker/src/doc/render'), import('../../../worker/src/doc/pdf')]).then(([r, p]) => ({ ...r, ...p }));
let assets: Promise<{ tpl: Template; fonts: PdfFonts }> | null = null;
const bytes = async (u: string) => { const r = await fetch(u); if (!r.ok) throw new Error(`${u}: ${r.status}`); return new Uint8Array(await r.arrayBuffer()); };
function load() {
  return (assets ??= Promise.all([bytes('/forms/Incident_Report_Form_v1.2.docx'), bytes('/forms/DejaVuSansCondensed.ttf'), bytes('/forms/DejaVuSansCondensed-Bold.ttf')])
    .then(async ([t, r, b]) => ({ tpl: (await lib()).loadTemplate(t), fonts: { regular: r, bold: b } }))
    .catch(e => { assets = null; throw e; }));
}

/** "YYYY-MM-DD HH:MM" in plant time (Asia/Manila, UTC+8), like the backend's footer stamp. */
function plantNow() {
  const d = new Date(Date.now() + 8 * 3600_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

type Draft = { report_id?: string } & Record<string, unknown>;
export async function draftPdfBlob(draft: Draft, footer?: string): Promise<Blob> {
  const [{ tpl, fonts }, { docToPdf, filledTree }] = await Promise.all([load(), lib()]);
  const pdf = await docToPdf(filledTree(tpl, draft), fonts, footer ?? `GearCast · ${draft.report_id ?? ''} · generated ${plantNow()}`);
  return new Blob([pdf], { type: 'application/pdf' });
}
export async function draftDocxBlob(draft: Draft): Promise<Blob> {
  const [{ tpl }, { renderDocx }] = await Promise.all([load(), lib()]);
  return new Blob([renderDocx(tpl, draft)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

/** Render a stored report (submitted or historical) and upload its PDF. Returns the PDF. */
export async function storeReportPdf(reportId: string): Promise<Blob> {
  const id = encodeURIComponent(reportId);
  const src = await fetch(`/api/incidents/${id}/pdf-source`);
  if (!src.ok) throw new Error(`${src.status} ${await src.text()}`);
  const { draft, footer } = await src.json();
  const blob = await draftPdfBlob(draft, footer);
  await fetch(`/api/incidents/${id}/pdf`, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: blob }).catch(() => {});
  return blob;
}

/** The stored PDF; produced (and stored) on first request if it does not exist yet. */
export async function reportPdfBlob(reportId: string): Promise<Blob> {
  const r = await fetch(`/api/incidents/${encodeURIComponent(reportId)}/pdf`);
  if (r.ok) return r.blob();
  if (r.status === 409) return storeReportPdf(reportId);
  throw new Error(`${r.status} ${await r.text()}`);
}
