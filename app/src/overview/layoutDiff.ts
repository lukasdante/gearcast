/** Layout-change preview state and the diff between the shared and a proposed layout (see layoutPreview.tsx). */
import { create } from 'zustand';
import type { LayoutDoc, LayoutItem } from '../domain/layout';

export interface PreviewState { id: string | null; doc: LayoutDoc | null; show: (id: string, doc: LayoutDoc) => void; clear: () => void }
/** The proposed layout shown in the 3D view instead of the shared one (read-only preview). */
export const useLayoutPreview = create<PreviewState>()(set => ({
  id: null, doc: null,
  show: (id, doc) => set({ id, doc }),
  clear: () => set({ id: null, doc: null }),
}));

export interface LayoutDiff { added: LayoutItem[]; removed: LayoutItem[]; moved: LayoutItem[]; relabelled: { from: string; to: string }[]; pipesAdded: number; pipesRemoved: number }
export const itemName = (it: LayoutItem) => it.assetId ?? it.label;
const pipeKey = (p: LayoutDoc['pipes'][number]) => `${p.from.itemId}:${p.from.port}>${p.to.itemId}:${p.to.port}`;

/** Items added / removed / moved (position or rotation) / relabelled, and pipes added / removed. */
export function diffLayouts(cur: LayoutDoc, next: LayoutDoc): LayoutDiff {
  const before = new Map(cur.items.map(i => [i.id, i])), after = new Map(next.items.map(i => [i.id, i]));
  const d: LayoutDiff = { added: [], removed: [], moved: [], relabelled: [], pipesAdded: 0, pipesRemoved: 0 };
  for (const it of next.items) {
    const old = before.get(it.id);
    if (!old) { d.added.push(it); continue; }
    if (Math.hypot(it.position[0] - old.position[0], it.position[1] - old.position[1]) > 0.05 || Math.abs(it.rotationY - old.rotationY) > 0.01) d.moved.push(it);
    if (it.label !== old.label && !it.assetId) d.relabelled.push({ from: old.label, to: it.label });
  }
  for (const it of cur.items) if (!after.has(it.id)) d.removed.push(it);
  const pb = new Set(cur.pipes.map(pipeKey)), pa = new Set(next.pipes.map(pipeKey));
  d.pipesAdded = [...pa].filter(k => !pb.has(k)).length;
  d.pipesRemoved = [...pb].filter(k => !pa.has(k)).length;
  return d;
}

