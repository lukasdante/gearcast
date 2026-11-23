/** Incident report documents, rendered in the browser with the same code the Worker has (worker/src/doc):
 * the client's Word form is filled (docx) and laid out to PDF with pdf-lib + DejaVu Sans Condensed.
 * PDF rendering takes hundreds of ms of CPU, more than the Workers free plan allows per request, so the app renders
 * and uploads the PDF once (PUT /api/incidents/{id}/pdf); downloads then serve the stored file. */
import type { DocImage, Template } from '../../../worker/src/doc/render';
import type { PdfFonts } from '../../../worker/src/doc/pdf';
import { chartSvg, type TrendSpec } from '../../../worker/src/doc/chart';

/** A photo attached to a report: resized JPEG bytes + pixel size (for the layout) + caption. */
export interface ReportPhoto { bytes: Uint8Array; w: number; h: number; ext: 'jpeg' | 'png'; caption: string; url: string }
const photoRid = (i: number) => `gcPhoto${i + 1}`;
const chartRid = (i: number) => `gcChart${i}`;
const CHART_W = 515, CHART_H = 165;

/** Resize a picked image to ≤ 1600 px on the long side, JPEG q 0.82 (keeps reports small: ~150–400 kB per photo). */
export async function preparePhoto(file: File, caption = ''): Promise<ReportPhoto> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const blob: Blob = await new Promise((res, rej) => cv.toBlob(b => (b ? res(b) : rej(new Error('Could not read the image'))), 'image/jpeg', 0.82));
  return { bytes: new Uint8Array(await blob.arrayBuffer()), w, h, ext: 'jpeg', caption, url: URL.createObjectURL(blob) };
}

/** Chart → PNG bytes (3× for print), for the .docx (Word has no vector path for our charts). */
async function chartPng(spec: TrendSpec): Promise<Uint8Array> {
  const svg = new Blob([chartSvg(spec, CHART_W, CHART_H)], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(svg);
  try {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const S = 3, cv = document.createElement('canvas'); cv.width = CHART_W * S; cv.height = CHART_H * S;
    const g = cv.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(img, 0, 0, cv.width, cv.height);
    const b: Blob = await new Promise((res, rej) => cv.toBlob(x => (x ? res(x) : rej(new Error('chart'))), 'image/png'));
    return new Uint8Array(await b.arrayBuffer());
  } finally { URL.revokeObjectURL(url); }
}

const photoImages = (photos: ReportPhoto[]) =>
  Object.fromEntries(photos.map((p, i) => [photoRid(i), { w: p.w, h: p.h, ext: p.ext, bytes: p.bytes } as DocImage]));
/** Photo metadata stored with the report (the bytes go to R2 separately). */
export const photoMeta = (photos: ReportPhoto[]) => photos.map(p => ({ caption: p.caption, w: p.w, h: p.h, ext: p.ext }));

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

type Draft = { report_id?: string; tables?: { trends?: TrendSpec[] } } & Record<string, unknown>;
/** PDF: charts drawn as vector graphics, photos embedded. */
export async function draftPdfBlob(draft: Draft, footer?: string, photos: ReportPhoto[] = []): Promise<Blob> {
  const [{ tpl, fonts }, { docToPdf, filledTree }] = await Promise.all([load(), lib()]);
  const d = { ...draft, photos: photoMeta(photos) };
  const images = photoImages(photos);
  const pdf = await docToPdf(filledTree(tpl, d, { images, vectorCharts: true }), fonts, footer ?? `GearCast · ${draft.report_id ?? ''} · generated ${plantNow()}`, true,
    { images, charts: draft.tables?.trends ?? [] });
  return new Blob([pdf], { type: 'application/pdf' });
}
/** DOCX: charts as 3× PNGs, photos embedded. */
export async function draftDocxBlob(draft: Draft, photos: ReportPhoto[] = []): Promise<Blob> {
  const [{ tpl }, { renderDocx }] = await Promise.all([load(), lib()]);
  const images = photoImages(photos);
  const trends = draft.tables?.trends ?? [];
  for (let i = 0; i < trends.length; i++) {
    try { images[chartRid(i)] = { w: CHART_W, h: CHART_H, ext: 'png', bytes: await chartPng(trends[i]) }; } catch { /* chart left out of the .docx */ }
  }
  return new Blob([renderDocx(tpl, { ...draft, photos: photoMeta(photos) }, images)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

/** Upload a submitted report's photos (1-based slots). */
export async function uploadReportPhotos(reportId: string, photos: ReportPhoto[]) {
  for (let i = 0; i < photos.length; i++) {
    const r = await fetch(`/api/incidents/${encodeURIComponent(reportId)}/photos/${i + 1}`, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: photos[i].bytes as BlobPart });
    if (!r.ok) throw new Error(`Photo ${i + 1}: ${(await r.json().catch(() => null))?.detail ?? r.status}`);
  }
}
/** Photos stored with a report, fetched for rendering. */
async function storedPhotos(reportId: string, meta: { caption: string; w: number; h: number; ext: 'jpeg' | 'png' }[]): Promise<ReportPhoto[]> {
  const out: ReportPhoto[] = [];
  for (let i = 0; i < meta.length; i++) {
    const r = await fetch(`/api/incidents/${encodeURIComponent(reportId)}/photos/${i + 1}`);
    if (!r.ok) continue;
    const b = await r.blob();
    out.push({ ...meta[i], bytes: new Uint8Array(await b.arrayBuffer()), url: URL.createObjectURL(b) });
  }
  return out;
}

/** Render a stored report (submitted or historical) and upload its PDF. Returns the PDF. */
export async function storeReportPdf(reportId: string): Promise<Blob> {
  const id = encodeURIComponent(reportId);
  const src = await fetch(`/api/incidents/${id}/pdf-source`);
  if (!src.ok) throw new Error(`${src.status} ${await src.text()}`);
  const { draft, footer } = await src.json();
  const photos = draft.photos?.length ? await storedPhotos(reportId, draft.photos) : [];
  const blob = await draftPdfBlob(draft, footer, photos);
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
