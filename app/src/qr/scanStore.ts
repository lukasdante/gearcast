/** QR scan flow: open the scanner, resolve + log a scan (POST /api/scans), show the asset quick view.
 *  Deep links (`/asset/<ID>`, `?asset=<ID>`: what a phone camera opens from a printed label) are captured at load,
 *  kept across the sign-in screen and opened once a user is signed in. Scans made offline are queued and replayed. */
import { create } from 'zustand';
import { ApiError, getJSON, postJSON } from '../api/client';
import { assetById } from '../data';
import { nowStamp } from '../domain/assetInfo';
import { parseScan } from '../../../worker/src/qrparse';

export { SCAN_PURPOSES, labelPayload, parseScan } from '../../../worker/src/qrparse';
export type Purpose = 'Rounds' | 'PM' | 'Breakdown' | 'Spare check' | 'Inventory';

export interface Tag { tag_id: string; asset_id: string; qr_payload: string; location_node: string | null; label_placement: string | null;
  label_material: string | null; environment: string | null; installed_date: string | null; last_verified: string | null; basis?: string | null }
export interface Scan { scan_id: string; scanned_at: string; tag_id: string | null; asset_id: string; user: string; user_role: string | null;
  device_id: string | null; purpose: string | null; action: string | null; linked_wo_id: string | null; online: boolean; source: 'pilot' | 'app' | 'queued' }
interface Resolved { kind: 'asset' | 'location'; asset_id: string | null; location: string | null; tag: Tag | null; assets: string[]; scan?: Scan }

export interface View { kind: 'asset' | 'location'; asset_id: string | null; location: string | null; tag: Tag | null; assets: string[]; scan: Scan | null; seq: number }

const QKEY = 'gearcast.scan.queue.v1', DKEY = 'gearcast.device', PKEY = 'gearcast.scan.purpose', LINK = 'gearcast.scan.pending';
const ls = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
};

/** Per-browser device id (Scan_Log.device_id; the pilot used TAB-01 / TAB-02). */
export function deviceId() {
  let d = ls.get(DKEY);
  if (!d) { d = 'WEB-' + Math.random().toString(16).slice(2, 6).toUpperCase(); ls.set(DKEY, d); }
  return d;
}

interface Queued { code: string; scanned_at: string; device_id: string; purpose: Purpose; online: false }
const readQueue = (): Queued[] => { try { return JSON.parse(ls.get(QKEY) || '[]'); } catch { return []; } };

/** Resolve without the server (offline): the bundled asset register. */
function localResolve(code: string): Resolved | null {
  const s = parseScan(code);
  if (!s) return null;
  const id = s.kind === 'tag' ? s.id.replace(/^QR-/, '') : s.id;
  if (s.kind === 'location' || id === 'STORE' || /^STORE/.test(id)) return { kind: 'location', asset_id: null, location: 'STORE', tag: null, assets: [...assetById.values()].filter(a => a.location_node === 'STORE').map(a => a.asset_id) };
  return assetById.has(id) ? { kind: 'asset', asset_id: id, location: null, tag: null, assets: [id] } : null;
}

interface ScanState {
  scannerOpen: boolean;
  view: View | null;
  purpose: Purpose;
  busy: boolean;
  error: string | null;
  /** History reloads when this changes (new scan, action noted). */
  rev: number;
  openScanner: () => void;
  closeScanner: () => void;
  setPurpose: (p: Purpose) => void;
  /** Resolve + log a scanned / typed code and open the quick view. Returns an error message, or null. */
  submit: (code: string) => Promise<string | null>;
  /** Open the quick view for an asset without a scan (e.g. from the labels page). */
  show: (assetId: string) => void;
  closeView: () => void;
  /** Record what the user did next on the current scan (Scan_Log.action). */
  note: (action: string, linkedWo?: string | null) => void;
  flush: () => Promise<void>;
}

let seq = 0;
export const useScan = create<ScanState>()((set, get) => ({
  scannerOpen: false,
  view: null,
  purpose: ((ls.get(PKEY) as Purpose) || 'Rounds'),
  busy: false,
  error: null,
  rev: 0,
  openScanner: () => set({ scannerOpen: true, error: null }),
  closeScanner: () => set({ scannerOpen: false, error: null }),
  setPurpose: p => { ls.set(PKEY, p); set({ purpose: p }); const s = get().view?.scan; if (s && s.source === 'app') patch(s.scan_id, { purpose: p }); },
  submit: async code => {
    const { purpose } = get();
    set({ busy: true, error: null });
    const body = { code, purpose, device_id: deviceId(), online: true };
    try {
      const r = await postJSON<Resolved & { scan: Scan }>('/api/scans', body);
      set({ busy: false, scannerOpen: false, view: { ...r, scan: r.scan, seq: ++seq }, rev: get().rev + 1 });
      return null;
    } catch (e) {
      if (e instanceof ApiError) { set({ busy: false, error: e.message }); return e.message; }
      // network down: open from the bundled register and queue the scan (offline-first, Scan_Log.online = false)
      const r = localResolve(code);
      if (!r) { set({ busy: false, error: 'Offline, and this code is not a known asset' }); return 'Offline, and this code is not a known asset'; }
      const q: Queued = { code, scanned_at: nowStamp(), device_id: deviceId(), purpose, online: false };
      ls.set(QKEY, JSON.stringify([...readQueue(), q].slice(-200)));
      const scan: Scan = { scan_id: 'queued', scanned_at: q.scanned_at, tag_id: null, asset_id: r.asset_id ?? 'STORE', user: '', user_role: null,
        device_id: q.device_id, purpose, action: 'Viewed profile', linked_wo_id: null, online: false, source: 'queued' };
      set({ busy: false, scannerOpen: false, view: { ...r, scan, seq: ++seq } });
      return null;
    }
  },
  show: assetId => set({ view: { kind: 'asset', asset_id: assetId, location: null, tag: null, assets: [assetId], scan: null, seq: ++seq } }),
  closeView: () => set({ view: null }),
  note: (action, linkedWo) => {
    const s = get().view?.scan;
    if (!s || s.source !== 'app') return;
    patch(s.scan_id, { action, ...(linkedWo ? { linked_wo_id: linkedWo } : {}) }).then(() => set({ rev: get().rev + 1 }));
  },
  flush: async () => {
    const q = readQueue();
    if (!q.length) return;
    const left: Queued[] = [];
    for (const item of q) {
      try { await postJSON('/api/scans', item); } catch (e) { if (!(e instanceof ApiError)) left.push(item); }
    }
    ls.set(QKEY, JSON.stringify(left));
    if (left.length < q.length) set({ rev: get().rev + 1 });
  },
}));

const patch = (id: string, b: Record<string, unknown>) =>
  fetch(`/api/scans/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).catch(() => {});

export const scanHistory = (assetId: string) => getJSON<{ scans: Scan[] }>(`/api/scans?asset_id=${encodeURIComponent(assetId)}&limit=40`).then(r => r.scans);
export const qrTags = () => getJSON<{ tags: Tag[] }>('/api/qr/tags').then(r => r.tags);

// ---------------------------------------------------------------- deep link capture (runs once at load)
function captureDeepLink() {
  if (typeof window === 'undefined') return;
  const { pathname, search, hash } = window.location;
  const m = /^\/(asset|tag|location)\/([^/?#]+)\/?$/i.exec(pathname);
  const qAsset = new URLSearchParams(search).get('asset');
  const hm = /^#\/(asset)\/([^/?#]+)/i.exec(hash);
  const code = m ? `gearcast://${m[1].toLowerCase()}/${decodeURIComponent(m[2])}` : qAsset ? qAsset : hm ? `gearcast://asset/${decodeURIComponent(hm[2])}` : null;
  if (!code) return;
  try { sessionStorage.setItem(LINK, code); } catch { /* ignore */ }
  window.history.replaceState(null, '', '/' + (hm ? '#/assets' : hash || '#/dashboard'));
}
captureDeepLink();

/** Called after sign-in: open a pending deep link and replay queued offline scans. */
export function consumeDeepLink() {
  let code: string | null = null;
  try { code = sessionStorage.getItem(LINK); sessionStorage.removeItem(LINK); } catch { /* ignore */ }
  const st = useScan.getState();
  st.flush();
  if (code) st.submit(code).then(err => { if (err) useScan.setState({ scannerOpen: true }); });
}
if (typeof window !== 'undefined') window.addEventListener('online', () => useScan.getState().flush());
