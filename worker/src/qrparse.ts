/** QR label payloads (QR_Tags.qr_payload) → what was scanned. Shared by the Worker (scan log) and the app (scanner).
 *  Accepts `gearcast://asset/<ID>`, `gearcast://location/<ID>`, an app URL (`https://…/asset/<ID>`, `…?asset=<ID>`,
 *  `…#/asset/<ID>`), a tag id (`QR-P-101A`) or a bare asset id (`p-101a`). */

export type Scanned = { kind: 'asset' | 'location' | 'tag'; id: string; raw: string };

const ID_RX = /^[A-Z0-9][A-Z0-9_-]{0,31}$/;
const clean = (s: string) => decodeURIComponentSafe(s).trim().toUpperCase();
function decodeURIComponentSafe(s: string) { try { return decodeURIComponent(s); } catch { return s; } }

export function parseScan(input: string): Scanned | null {
  const raw = String(input ?? '').trim();
  if (!raw || raw.length > 512) return null;
  let m = /^gearcast:\/\/(asset|location|tag)\/([^/?#\s]+)/i.exec(raw);
  if (m) {
    const id = clean(m[2]);
    return ID_RX.test(id) ? { kind: m[1].toLowerCase() as Scanned['kind'], id, raw } : null;
  }
  if (/^https?:\/\//i.test(raw)) {
    let u: URL;
    try { u = new URL(raw); } catch { return null; }
    const q = u.searchParams.get('asset') || u.searchParams.get('tag');
    const path = `${u.pathname}${u.hash.replace(/^#/, '')}`;
    m = /\/(asset|location|tag)\/([^/?#\s]+)/i.exec(path);
    const id = clean(m ? m[2] : q || '');
    if (!ID_RX.test(id)) return null;
    const kind = m ? (m[1].toLowerCase() as Scanned['kind']) : u.searchParams.get('asset') ? 'asset' : 'tag';
    return { kind, id, raw };
  }
  const id = clean(raw);
  if (!ID_RX.test(id)) return null;
  return { kind: /^QR-/.test(id) ? 'tag' : 'asset', id, raw };
}

/** Payload printed on a label: an https link (any phone camera opens it; lands in the asset quick view after login)
 *  or the workbook's app scheme (`gearcast://asset/<ID>`, read by the in-app scanner only). */
export const labelPayload = (assetId: string, origin: string | null) =>
  origin ? `${origin.replace(/\/+$/, '')}/asset/${encodeURIComponent(assetId)}` : `gearcast://asset/${assetId}`;

export const SCAN_PURPOSES = ['Rounds', 'PM', 'Breakdown', 'Spare check', 'Inventory'] as const;
