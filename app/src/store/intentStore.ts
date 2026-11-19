/** Cross-page hand-offs (e.g. chat action "Troubleshoot P-101B" → Troubleshoot page pre-filled). */
import { create } from 'zustand';

interface IntentState {
  troubleshoot: { query: string; asset_id?: string | null; seq: number } | null;
  incident: { asset_id: string; seq: number } | null;
  setTroubleshoot: (query: string, asset_id?: string | null) => void;
  setIncident: (asset_id: string) => void;
  clear: (k: 'troubleshoot' | 'incident') => void;
}

let seq = 0;
export const useIntent = create<IntentState>()(set => ({
  troubleshoot: null,
  incident: null,
  setTroubleshoot: (query, asset_id) => set({ troubleshoot: { query, asset_id, seq: ++seq } }),
  setIncident: asset_id => set({ incident: { asset_id, seq: ++seq } }),
  clear: k => set({ [k]: null } as Partial<IntentState>),
}));
