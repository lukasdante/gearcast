import '../styles/overview.css';
import { useEffect, useRef, useState } from 'react';
import { Scene } from './Scene';
import { Inspector } from './Inspector';
import { Palette, PlantsMenu, Properties, deleteSelection, rotateSelected } from './Builder';
import { useLive, type Live } from './live';
import { areaName } from '../domain/layout';
import { STATUS_COLORS } from '../domain/status';
import { useActivePlant, usePlantStore } from '../store/plantStore';
import { useCan } from '../store/authStore';
import { discardDraft, usePlantAccess } from '../api/plants';
import { useApprovals } from '../api/approvals';
import { dialog } from '../shell/Modal';
import { useStatusStore } from '../store/statusStore';
import { useUi } from '../store/uiStore';
import { Icon } from '../shell/icons';

function SummaryOverlay({ live }: { live: Live }) {
  const s = live.summary;
  const { downNodes, affectedNodes } = live.impact;
  const cells: [string, number, string, string?][] = [
    ['In service', s.running, STATUS_COLORS.running],
    ['Standby', s.standby, STATUS_COLORS.standby],
    ['Maintenance', s.maintenance, STATUS_COLORS.maintenance],
    ['Down', s.fault + s.stopped, STATUS_COLORS.fault, s.stopped ? `${s.fault} shut down / not available, ${s.stopped} stopped with parent` : undefined],
    ['Stored', s.stored, STATUS_COLORS.stored],
  ];
  return (
    <div className="ov-topleft">
      <div className="summary glass">
        {cells.map(([label, n, color, title]) => (
          <div key={label} className={`sum-cell${label === 'Down' && n ? ' alert' : ''}`} title={title}>
            <span className="sum-n mono" style={{ color: n ? color : undefined }}>{n}</span>
            <span className="sum-l"><i style={{ background: color }} />{label}</span>
          </div>
        ))}
      </div>
      {downNodes.length > 0 && (
        <div className="process-alert">
          <Icon name="incidents" />
          <div>
            <b>Process stopped at {downNodes.map(n => `${n} ${areaName(n)}`).join(', ')}</b>
            {affectedNodes.length > 0 && <div className="small">No flow downstream: <span className="mono">{affectedNodes.join(' · ')}</span></div>}
          </div>
        </div>
      )}
    </div>
  );
}

/** "?" button (bottom-right, beside Caster) opening the map legend. */
function LegendButton() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); setOpen(false); } };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey, true); };
  }, [open]);
  const sw = (c: string) => <i className="sw" style={{ background: c }} />;
  return (
    <div className="legend-wrap" ref={ref}>
      {open && (
        <div className="legend-pop glass" role="dialog" aria-label="Map legend">
          <h4>Equipment status</h4>
          <ul>
            <li>{sw(STATUS_COLORS.running)}In service / running</li>
            <li>{sw(STATUS_COLORS.standby)}Standby (available)</li>
            <li>{sw(STATUS_COLORS.startNeeded)}Standby · start needed</li>
            <li>{sw(STATUS_COLORS.maintenance)}Under maintenance</li>
            <li>{sw(STATUS_COLORS.fault)}Shut down / not available</li>
            <li>{sw(STATUS_COLORS.stopped)}Stopped (parent down)</li>
            <li>{sw(STATUS_COLORS.stored)}In storage</li>
          </ul>
          <h4>Process</h4>
          <ul>
            <li><i className="sq down" />Process down (both units unavailable)</li>
            <li><i className="sq noflow" />No flow (downstream of a stop)</li>
            <li><i className="flow" />Flowing pipe · grey = idle</li>
          </ul>
          <h4>Role chips</h4>
          <ul className="roles">
            <li><span className="chip-role k-running">DUTY</span>running unit of the pair</li>
            <li><span className="chip-role k-standby">STBY</span>installed standby</li>
            <li><span className="chip-role k-stored">STORED</span>spare in the store</li>
            <li><span className="chip-role k-stopped">STOPPED</span>follows its parent</li>
          </ul>
        </div>
      )}
      <button type="button" className={`legend-btn${open ? ' on' : ''}`} onClick={() => setOpen(o => !o)} aria-label="Map legend" aria-expanded={open} title="Legend">?</button>
    </div>
  );
}

function Toolbar() {
  const editMode = useUi(s => s.editMode);
  const setEditMode = useUi(s => s.setEditMode);
  const fit = useUi(s => s.fit);
  const canUndo = usePlantStore(s => s.undoStack.length > 0);
  const undo = usePlantStore(s => s.undo);
  const hasSim = useStatusStore(s => s.appended.length > 0 || Object.keys(s.roleOverrides).length > 0);
  const resetSim = useStatusStore(s => s.resetSimulation);
  const canEdit = useCan('layout.edit');
  return (
    <div className="ov-toolbar">
      <PlantsMenu />
      {editMode && (
        <button type="button" className="btn glass" disabled={!canUndo} onClick={undo} title="Undo (Ctrl+Z)"><Icon name="undo" />Undo</button>
      )}
      {!editMode && hasSim && (
        <button type="button" className="btn glass" onClick={resetSim} title="Discard all simulated status changes">Reset simulation</button>
      )}
      <button type="button" className="btn glass" onClick={fit} title="Frame the whole plant"><Icon name="fit" />Fit</button>
      {canEdit && <button type="button" className={`btn glass${editMode ? ' on' : ''}`} onClick={() => setEditMode(!editMode)}>
        <Icon name={editMode ? 'check' : 'edit'} />{editMode ? 'Done editing' : 'Edit layout'}
      </button>}
    </div>
  );
}

/** Engineer: layout edits are a draft until a Plant Supervisor approves them. */
function DraftBanner() {
  const doc = useActivePlant();
  const draft = usePlantAccess(s => (doc ? s.drafts[doc.id] : undefined));
  const setDraft = usePlantAccess(s => s.setDraft);
  const items = useApprovals(s => s.items);
  const file = useApprovals(s => s.file);
  const refresh = useApprovals(s => s.refresh);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const publishes = useCan('layout.publish');
  useEffect(() => { if (draft) refresh(); }, [draft, refresh]);
  if (publishes || draft === undefined || !doc) return null;
  const ap = draft ? items.find(a => a.id === draft) : undefined;
  const submit = async () => {
    const note = await dialog.prompt({ title: 'Submit layout for approval', label: 'What changed? (for the Plant Supervisor)', initial: '', action: 'Submit' });
    if (note === null) return;
    setBusy(true); setErr(null);
    try { const a = await file('layout_change', { plant_id: doc.id, plant_name: doc.name, note, doc }); setDraft(doc.id, a.id); useUi.getState().setEditMode(false); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Submit failed'); } finally { setBusy(false); }
  };
  const discard = async () => {
    if (await dialog.confirm({ title: 'Discard layout draft', danger: true, action: 'Discard draft', body: <p>Your unapproved edits to <b>{doc.name}</b> are removed and the shared layout is restored.</p> })) discardDraft(doc.id);
  };
  return (
    <div className="draft-banner glass small">
      {!draft && <><b>Draft</b> — your layout edits are only on this device until a Plant Supervisor approves them.
        <button type="button" className="btn primary sm" disabled={busy} onClick={submit}>Submit for approval</button></>}
      {draft && ap?.status !== 'rejected' && <><b>{draft} pending</b> — waiting for a Plant Supervisor to approve these layout edits.</>}
      {draft && ap?.status === 'rejected' && <><b>{draft} rejected</b>{ap.review_note ? ` — ${ap.review_note}` : ''}. Edit and submit again.
        <button type="button" className="btn primary sm" disabled={busy} onClick={submit}>Resubmit</button></>}
      <button type="button" className="btn ghost sm" onClick={discard}>Discard draft</button>
      {err && <span className="chat-err">{err}</span>}
    </div>
  );
}

function useBuilderKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable]')) return;
      const ui = useUi.getState();
      if (!ui.editMode) {
        if (e.key === 'Escape') ui.select(null);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); usePlantStore.getState().undo(); return; }
      if (e.key === 'Escape') { if (ui.tool.type !== 'select') ui.setTool({ type: 'select' }); else ui.select(null); }
      else if (e.key === 'r' || e.key === 'R') rotateSelected();
      else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelection(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export function PlantOverview() {
  const doc = useActivePlant();
  const live = useLive();
  const editMode = useUi(s => s.editMode);
  const selectedItemId = useUi(s => s.selectedItemId);
  const selectedAssetId = useUi(s => s.selectedAssetId);
  const item = doc.items.find(i => i.id === selectedItemId) ?? null;
  useBuilderKeys();
  const publishes = useCan('layout.publish');

  // Drop a selection that no longer exists in this document.
  useEffect(() => {
    if (selectedItemId && !item) useUi.getState().select(null);
  }, [selectedItemId, item]);

  const assetId = selectedAssetId ?? item?.assetId ?? null;
  return (
    <div className={`overview${editMode ? ' editing' : ''}`}>
      <Scene doc={doc} live={live} />
      <SummaryOverlay live={live} />
      <Toolbar />
      <LegendButton />
      {editMode && <Palette />}
      {editMode ? <Properties doc={doc} /> : <Inspector item={item} assetId={assetId} live={live} />}
      {doc.items.length === 0 && (
        <div className="empty-plant glass">
          <b>{doc.name} is empty</b>
          <span className="muted">{editMode ? 'Pick an asset from the palette and click the ground to place it.' : 'Use Edit layout to start building this plant.'}</span>
        </div>
      )}
      {editMode && <div className="edit-hint glass small">Drag to move · <kbd>R</kbd> rotate · <kbd>Del</kbd> delete · <kbd>Ctrl</kbd>+<kbd>Z</kbd> undo · {publishes ? 'saved and shared automatically' : 'saved as a draft for approval'}</div>}
      <DraftBanner />
    </div>
  );
}
