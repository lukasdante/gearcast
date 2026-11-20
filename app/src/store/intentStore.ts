/** Cross-page hand-offs (e.g. chat action "Troubleshoot P-101B" → Troubleshoot page pre-filled). */
import { create } from 'zustand';

interface IntentState {
  troubleshoot: { query: string; asset_id?: string | null; seq: number } | null;
  incident: { asset_id: string; prefill?: Record<string, string>; seq: number } | null;
  asset: { asset_id: string; seq: number } | null;
  rr: { asset_id: string; seq: number } | null;
  setRR: (asset_id: string) => void;
  setAsset: (asset_id: string) => void;
  setTroubleshoot: (query: string, asset_id?: string | null) => void;
  setIncident: (asset_id: string, prefill?: Record<string, string>) => void;
  clear: (k: 'troubleshoot' | 'incident' | 'asset' | 'rr') => void;
}

let seq = 0;
export const useIntent = create<IntentState>()(set => ({
  troubleshoot: null,
  incident: null,
  asset: null,
  rr: null,
  setRR: asset_id => set({ rr: { asset_id, seq: ++seq } }),
  setAsset: asset_id => set({ asset: { asset_id, seq: ++seq } }),
  setTroubleshoot: (query, asset_id) => set({ troubleshoot: { query, asset_id, seq: ++seq } }),
  setIncident: (asset_id, prefill) => set({ incident: { asset_id, prefill, seq: ++seq } }),
  clear: k => set({ [k]: null } as Partial<IntentState>),
}));
