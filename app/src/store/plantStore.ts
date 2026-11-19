/** Plant layouts (localStorage) with an undo stack for the builder. Save is automatic. */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { blankPlant, buildDefaultPlant, type LayoutDoc } from '../domain/layout';

const UNDO_LIMIT = 50;

interface PlantState {
  plants: Record<string, LayoutDoc>;
  order: string[];
  activeId: string;
  undoStack: LayoutDoc[]; // not persisted
  setActive: (id: string) => void;
  createPlant: (name: string) => void;
  renamePlant: (id: string, name: string) => void;
  deletePlant: (id: string) => void;
  resetDefault: () => void;
  /** Apply a change to the active plant; `record` pushes an undo snapshot first. */
  edit: (fn: (doc: LayoutDoc) => LayoutDoc, record?: boolean) => void;
  snapshot: () => void;
  undo: () => void;
}

const def = buildDefaultPlant();

export const usePlantStore = create<PlantState>()(
  persist(
    (set, get) => ({
      plants: { [def.id]: def },
      order: [def.id],
      activeId: def.id,
      undoStack: [],
      setActive: id => set({ activeId: id, undoStack: [] }),
      createPlant: name => {
        const doc = blankPlant(name);
        set(s => ({ plants: { ...s.plants, [doc.id]: doc }, order: [...s.order, doc.id], activeId: doc.id, undoStack: [] }));
      },
      renamePlant: (id, name) => set(s => ({ plants: { ...s.plants, [id]: { ...s.plants[id], name } } })),
      deletePlant: id => set(s => {
        if (s.order.length <= 1) return s;
        const plants = { ...s.plants };
        delete plants[id];
        const order = s.order.filter(o => o !== id);
        return { plants, order, activeId: s.activeId === id ? order[0] : s.activeId, undoStack: [] };
      }),
      resetDefault: () => {
        const fresh = buildDefaultPlant();
        set(s => ({
          plants: { ...s.plants, [fresh.id]: { ...fresh, name: s.plants[fresh.id]?.name ?? fresh.name } },
          order: s.order.includes(fresh.id) ? s.order : [fresh.id, ...s.order],
          activeId: fresh.id, undoStack: [],
        }));
      },
      snapshot: () => {
        const cur = get().plants[get().activeId];
        if (cur) set(s => ({ undoStack: [...s.undoStack, cur].slice(-UNDO_LIMIT) }));
      },
      edit: (fn, record = true) => {
        const { activeId, plants } = get();
        const cur = plants[activeId];
        if (!cur) return;
        if (record) get().snapshot();
        set(s => ({ plants: { ...s.plants, [activeId]: { ...fn(cur), updatedAt: new Date().toISOString() } } }));
      },
      undo: () => {
        const stack = get().undoStack;
        const prev = stack[stack.length - 1];
        if (!prev) return;
        set(s => ({ undoStack: stack.slice(0, -1), plants: { ...s.plants, [s.activeId]: prev } }));
      },
    }),
    {
      name: 'gearcast.plants.v3',
      partialize: s => ({ plants: s.plants, order: s.order, activeId: s.activeId }),
    },
  ),
);

export const useActivePlant = () => usePlantStore(s => s.plants[s.activeId] ?? Object.values(s.plants)[0]);
