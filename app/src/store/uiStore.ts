import { create } from 'zustand';

export type Tool =
  | { type: 'select' }
  | { type: 'place'; kind: string }
  | { type: 'pipe'; from?: { itemId: string; port: string } };

interface UiState {
  selectedItemId: string | null;
  selectedAssetId: string | null;
  hoveredItemId: string | null;
  selectedPipeId: string | null;
  editMode: boolean;
  tool: Tool;
  /** Incremented to ask the camera to frame the whole plant. */
  fitSeq: number;
  select: (itemId: string | null, assetId?: string | null) => void;
  hover: (itemId: string | null) => void;
  selectPipe: (id: string | null) => void;
  setEditMode: (on: boolean) => void;
  setTool: (t: Tool) => void;
  fit: () => void;
}

export const useUi = create<UiState>()(set => ({
  selectedItemId: null,
  selectedAssetId: null,
  hoveredItemId: null,
  selectedPipeId: null,
  editMode: false,
  tool: { type: 'select' },
  fitSeq: 0,
  select: (itemId, assetId = null) => set({ selectedItemId: itemId, selectedAssetId: assetId, selectedPipeId: null }),
  hover: id => set({ hoveredItemId: id }),
  selectPipe: id => set({ selectedPipeId: id, selectedItemId: null, selectedAssetId: null }),
  setEditMode: on => set({ editMode: on, tool: { type: 'select' }, selectedPipeId: null }),
  setTool: t => set({ tool: t }),
  fit: () => set(s => ({ fitSeq: s.fitSeq + 1 })),
}));
