/** Plant layouts shared through the API (worker/src/plants.ts); the browser store (plantStore) stays the working copy.
 *  Plant Supervisor: edits publish automatically. Engineer: edits stay a local draft until submitted and approved by a
 *  Plant Supervisor. Technician: view only. Users see only the plants they have access to. */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getJSON } from './client';
import { usePlantStore, withPumpAreas } from '../store/plantStore';
import { buildDefaultPlant, type LayoutDoc } from '../domain/layout';
import { canNow, useAuth } from '../store/authStore';

export interface PlantMeta { id: string; name: string; updated_at: string | null; updated_by: string | null; access: 'home' | 'manager' | 'assigned' | 'temporary'; expires_at: string | null }
interface ServerList { home: string; plants: (PlantMeta & { doc: LayoutDoc })[]; unpublished: string[] }

interface AccessState {
  /** null until the first sync (then: ids the user may open). */
  visible: string[] | null;
  meta: Record<string, PlantMeta>;
  /** Engineer drafts: plant id → approval id once submitted (or '' while unsent). Persisted. */
  drafts: Record<string, string>;
  setDraft: (id: string, v: string | null) => void;
}
export const usePlantAccess = create<AccessState>()(persist(
  set => ({
    visible: null, meta: {}, drafts: {},
    setDraft: (id, v) => set(s => { const d = { ...s.drafts }; if (v === null) delete d[id]; else d[id] = v; return { drafts: d }; }),
  }),
  { name: 'gearcast.plant-drafts.v1', partialize: s => ({ drafts: s.drafts }) },
));

const server = new Map<string, string>(); // id → JSON of the last version known on the server (published or pulled)
const key = (d: LayoutDoc) => JSON.stringify({ ...d, updatedAt: undefined });
let applying = false;

async function put(doc: LayoutDoc) {
  const r = await fetch(`/api/plants/${encodeURIComponent(doc.id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ doc }) });
  if (r.ok) server.set(doc.id, key(doc));
}

/** Pull the shared layouts and the access list; supervisors also push browser-only plants once (migration). */
export async function syncPlants() {
  let list: ServerList;
  try { list = await getJSON<ServerList>('/api/plants'); } catch { return; }
  const st = usePlantStore.getState(), drafts = usePlantAccess.getState().drafts;
  const plants = { ...st.plants }, order = [...st.order];
  for (const p of list.plants) {
    if (p.id === 'default') p.doc = withPumpAreas(p.doc);
    server.set(p.id, key(p.doc));
    if (p.id in drafts && plants[p.id]) {
      if (key(plants[p.id]) === key(p.doc)) usePlantAccess.getState().setDraft(p.id, null); // approved (or no real change)
      else continue; // keep the engineer's unsent / pending / rejected draft
    }
    plants[p.id] = { ...p.doc, id: p.id };
    if (!order.includes(p.id)) order.push(p.id);
  }
  const supervisor = canNow('layout.publish');
  if (supervisor) {
    for (const id of order) {
      const d = plants[id];
      if (!d || server.has(id)) continue;
      if (id === 'default' && !d.updatedAt) { server.set(id, key(d)); continue; } // untouched seed: nothing to publish
      await put(d);
    }
  } else {
    for (const id of list.unpublished) if (id === 'default' && !server.has(id)) server.set(id, key(buildDefaultPlant()));
  }
  const ok = new Set([...list.plants.map(p => p.id), ...list.unpublished]);
  const visible = supervisor ? order.filter(id => plants[id]) : order.filter(id => ok.has(id) && plants[id]);
  applying = true;
  usePlantStore.setState({ plants, order, activeId: visible.includes(st.activeId) ? st.activeId : visible[0] ?? 'default' });
  applying = false;
  usePlantAccess.setState({ visible, meta: Object.fromEntries(list.plants.map(p => [p.id, { ...p, doc: undefined } as PlantMeta])) });
}

/** Restore the shared version of a plant (engineer discards a draft). */
export function discardDraft(id: string) {
  const s = server.get(id);
  const doc: LayoutDoc = s ? { ...JSON.parse(s), id } : buildDefaultPlant();
  applying = true;
  usePlantStore.setState(st => ({ plants: { ...st.plants, [id]: doc }, undoStack: [] }));
  applying = false;
  usePlantAccess.getState().setDraft(id, null);
}

export const isPublished = (id: string) => server.has(id);

// Watch local edits: supervisors publish (debounced), engineers mark a draft, deletions are sent by supervisors.
const timers = new Map<string, number>();
usePlantStore.subscribe((s, prev) => {
  if (applying || !useAuth.getState().user) return;
  const publish = canNow('layout.publish'), draft = !publish && canNow('layout.edit');
  for (const id of Object.keys(s.plants)) {
    const d = s.plants[id];
    if (d === prev.plants[id]) continue;
    if (publish) {
      window.clearTimeout(timers.get(id));
      timers.set(id, window.setTimeout(() => { const cur = usePlantStore.getState().plants[id]; if (cur && key(cur) !== server.get(id)) put(cur); }, 1200));
      if (!usePlantAccess.getState().visible?.includes(id)) usePlantAccess.setState(a => ({ visible: [...(a.visible ?? []), id] }));
    } else if (draft && key(d) !== server.get(id) && !(id in usePlantAccess.getState().drafts)) usePlantAccess.getState().setDraft(id, '');
  }
  if (publish) for (const id of Object.keys(prev.plants)) if (!(id in s.plants)) {
    fetch(`/api/plants/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {});
    server.delete(id);
    usePlantAccess.setState(a => ({ visible: (a.visible ?? []).filter(v => v !== id) }));
  }
});
if (typeof window !== 'undefined') window.addEventListener('gearcast:approvals', () => { syncPlants(); });
