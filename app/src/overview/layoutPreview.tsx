/** Engineer layout changes awaiting a Plant Supervisor: what changed versus the shared layout, and a 3D preview of the
 *  proposed layout on Plant Overview (nothing is published until the supervisor approves). */
import { useEffect, useState } from 'react';
import { getJSON } from '../api/client';
import type { Approval } from '../api/approvals';
import type { LayoutDoc } from '../domain/layout';
import { diffLayouts, itemName, useLayoutPreview } from './layoutDiff';
import { usePlantStore, withPumpAreas } from '../store/plantStore';
import { useUi } from '../store/uiStore';
import { Icon } from '../shell/icons';

const docs = new Map<string, LayoutDoc>(); // approval id → proposed layout (the list endpoint leaves the doc out)
async function proposedDoc(a: Approval): Promise<LayoutDoc> {
  const hit = docs.get(a.id);
  if (hit) return hit;
  const full = await getJSON<Approval>(`/api/approvals/${encodeURIComponent(a.id)}`);
  const raw = { ...(full.payload.doc as LayoutDoc), id: full.payload.plant_id as string };
  const doc = raw.id === 'default' ? withPumpAreas(raw) : raw;
  docs.set(a.id, doc);
  return doc;
}

function Chips({ label, list, tone }: { label: string; list: string[]; tone: string }) {
  if (!list.length) return null;
  return <div className="lc-diff-row"><span className={`badge ${tone}`}>{label} {list.length}</span><span className="mono small">{list.join(', ')}</span></div>;
}

/** Queue details for a layout change: plant, note, what changed, and a 3D preview toggle. */
export function LayoutChangeDetails({ a }: { a: Approval }) {
  const p = a.payload;
  const current = usePlantStore(s => s.plants[p.plant_id as string]);
  const previewing = useLayoutPreview(s => s.id === a.id);
  const [doc, setDoc] = useState<LayoutDoc | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const pending = a.status === 'pending';
  useEffect(() => {
    if (!pending) return;
    let live = true;
    proposedDoc(a).then(d => live && setDoc(d)).catch(e => live && setErr(e instanceof Error ? e.message : 'Could not load the layout'));
    return () => { live = false; };
  }, [a.id, pending]); // eslint-disable-line react-hooks/exhaustive-deps
  const diff = doc && current ? diffLayouts(current, doc) : null;
  const none = diff && !diff.added.length && !diff.removed.length && !diff.moved.length && !diff.relabelled.length && !diff.pipesAdded && !diff.pipesRemoved;
  const toggle = () => {
    if (!doc) return;
    if (previewing) { useLayoutPreview.getState().clear(); return; }
    const st = usePlantStore.getState();
    if (st.activeId !== doc.id) { st.setActive(doc.id); useUi.getState().fit(); }
    useUi.getState().select(null);
    useLayoutPreview.getState().show(a.id, doc);
  };
  return (
    <div className="ap-details small lc-details">
      <div><span className="muted">Plant</span> <b>{p.plant_name || current?.name || p.plant_id}</b></div>
      {p.note && <div><span className="muted">Note</span> {p.note}</div>}
      {pending && <>
        {err && <div className="bad-t">{err}</div>}
        {!doc && !err && <div className="muted">Loading the proposed layout…</div>}
        {diff && (none ? <div className="muted">No differences from the shared layout.</div> : <div className="lc-diff">
          <Chips label="Added" tone="new" list={diff.added.map(itemName)} />
          <Chips label="Moved" tone="warn" list={diff.moved.map(itemName)} />
          <Chips label="Removed" tone="ap-rejected" list={diff.removed.map(itemName)} />
          <Chips label="Renamed" tone="" list={diff.relabelled.map(r => `${r.from} → ${r.to}`)} />
          {(diff.pipesAdded > 0 || diff.pipesRemoved > 0) && <div className="lc-diff-row"><span className="badge">Pipes</span><span className="mono small">+{diff.pipesAdded} / −{diff.pipesRemoved}</span></div>}
        </div>)}
        {doc && <button type="button" className={`btn sm${previewing ? ' primary' : ''}`} onClick={toggle}>
          <Icon name="layers" size={13} />{previewing ? 'Hide preview' : 'Preview in 3D'}</button>}
      </>}
      {!pending && <div className="muted">{a.status === 'approved' ? 'Published to everyone.' : 'Not published.'}</div>}
    </div>
  );
}
