/** Approval queue client (worker/src/approvals.ts): PM findings, spare deployments, layout changes. */
import { create } from 'zustand';
import { getJSON, postJSON, upload } from './client';

export type Kind = 'pm_findings' | 'spare_deploy' | 'layout_change';
export interface Approval {
  id: string; kind: Kind; status: 'pending' | 'approved' | 'rejected'; title: string; payload: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  file: { type: string; name: string; bytes: number } | null;
  created_by: string; created_role: string; created_at: string;
  reviewed_by: string | null; reviewed_at: string | null; review_note: string | null;
}

interface State {
  items: Approval[];
  loaded: boolean;
  refresh: () => Promise<void>;
  file: (kind: Kind, payload: unknown, scan?: File | null) => Promise<Approval>;
  review: (id: string, decision: 'approve' | 'reject', note?: string) => Promise<Approval>;
}

export const useApprovals = create<State>()((set, get) => ({
  items: [],
  loaded: false,
  refresh: async () => {
    try { set({ items: (await getJSON<{ approvals: Approval[] }>('/api/approvals')).approvals, loaded: true }); } catch { /* offline: keep */ }
  },
  file: async (kind, payload, scan) => {
    let a: Approval;
    if (scan) {
      const fd = new FormData();
      fd.append('kind', kind); fd.append('payload', JSON.stringify(payload)); fd.append('file', scan);
      a = await upload<Approval>('/api/approvals', fd);
    } else a = await postJSON<Approval>('/api/approvals', { kind, payload });
    set({ items: [a, ...get().items.filter(x => x.id !== a.id)] });
    window.dispatchEvent(new Event('gearcast:approvals'));
    return a;
  },
  review: async (id, decision, note = '') => {
    const a = await postJSON<Approval>(`/api/approvals/${encodeURIComponent(id)}/review`, { decision, note });
    set({ items: get().items.map(x => (x.id === id ? { ...a, payload: a.kind === 'layout_change' ? { ...a.payload, doc: undefined } : a.payload } : x)) });
    window.dispatchEvent(new Event('gearcast:approvals'));
    return a;
  },
}));

export const fileUrl = (id: string) => `/api/approvals/${encodeURIComponent(id)}/file`;

/** Latest approved PM completion per PM status row (moves "last done" and the due date). */
export function approvedPm(items: Approval[]): Map<string, Approval> {
  const m = new Map<string, Approval>();
  for (const a of items) {
    if (a.kind !== 'pm_findings' || a.status !== 'approved') continue;
    const cur = m.get(a.payload.status_id);
    if (!cur || String(a.payload.done_at) > String(cur.payload.done_at)) m.set(a.payload.status_id, a);
  }
  return m;
}

/** Units issued per spare item by approved deployments (subtracted from stock on hand). */
export function deployedQty(items: Approval[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const a of items) if (a.kind === 'spare_deploy' && a.status === 'approved') m.set(a.payload.item_id, (m.get(a.payload.item_id) ?? 0) + Number(a.payload.qty || 0));
  return m;
}

export const STATUS_LABEL = { pending: 'Pending approval', approved: 'Approved', rejected: 'Rejected' } as const;
