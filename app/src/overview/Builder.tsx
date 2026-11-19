/** Plant builder UI: plants menu, kind palette, properties panel. Scene-side tools live in Scene.tsx. */
import { useEffect, useRef, useState } from 'react';
import { ASSET_KINDS, getKind } from '../models/registry';
import type { AssetCategory } from '../models/types';
import { PLANT } from '../data';
import type { LayoutDoc, LayoutItem } from '../domain/layout';
import { usePlantStore } from '../store/plantStore';
import { useUi } from '../store/uiStore';
import { Icon } from '../shell/icons';

/** Thumbnails present in public/models/thumbs (keys only; nothing is imported). */
const THUMBS = new Set(
  Object.keys(import.meta.glob('/public/models/thumbs/*.png', { query: '?url', import: 'default' }))
    .map(k => k.split('/').pop()!.replace(/\.png$/, '')),
);

const CAT_LABEL: Record<AssetCategory, string> = {
  rotating: 'Rotating equipment', process: 'Process equipment', structure: 'Structures', utility: 'Utilities', custom: 'Custom',
};
const CAT_ICON: Record<AssetCategory, string> = { rotating: 'rotate', process: 'layers', structure: 'plant', utility: 'spares', custom: 'plus' };

// ---------------------------------------------------------------- plants menu

export function PlantsMenu() {
  const plants = usePlantStore(s => s.plants);
  const order = usePlantStore(s => s.order);
  const activeId = usePlantStore(s => s.activeId);
  const st = usePlantStore.getState;
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const active = plants[activeId];

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) { setOpen(false); setRenaming(null); } };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);

  const switchTo = (fn: () => void) => { fn(); useUi.getState().select(null); useUi.getState().fit(); };
  const commitRename = () => { if (renaming && draft.trim()) st().renamePlant(renaming, draft.trim()); setRenaming(null); };

  return (
    <div className="plants-menu" ref={ref}>
      <button type="button" className="btn glass" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <Icon name="plant" /><span className="plants-name">{active?.name}</span><Icon name="chevron" size={12} />
      </button>
      {open && (
        <div className="menu" role="menu">
          <div className="menu-title muted small">Plants</div>
          {order.map(id => {
            const p = plants[id];
            if (!p) return null;
            return (
              <div key={id} className={`menu-row${id === activeId ? ' active' : ''}`}>
                {renaming === id ? (
                  <form onSubmit={e => { e.preventDefault(); commitRename(); }} className="menu-rename">
                    <input autoFocus value={draft} onChange={e => setDraft(e.target.value)} onBlur={commitRename}
                      onKeyDown={e => { if (e.key === 'Escape') setRenaming(null); }} />
                  </form>
                ) : (
                  <button type="button" className="menu-main" onClick={() => { switchTo(() => st().setActive(id)); setOpen(false); }}>
                    <span>{p.name}</span>
                    <span className="muted small">{p.items.length} items</span>
                  </button>
                )}
                <button type="button" className="icon-btn" title="Rename" onClick={() => { setRenaming(id); setDraft(p.name); }}><Icon name="edit" size={14} /></button>
                {id === 'default'
                  ? <button type="button" className="icon-btn" title="Reset to seeded layout" onClick={() => { if (confirm('Reset the seeded plant layout?')) switchTo(st().resetDefault); }}><Icon name="undo" size={14} /></button>
                  : <button type="button" className="icon-btn" title="Delete" disabled={order.length <= 1} onClick={() => { if (confirm(`Delete "${p.name}"?`)) switchTo(() => st().deletePlant(id)); }}><Icon name="trash" size={14} /></button>}
              </div>
            );
          })}
          <button type="button" className="menu-new" onClick={() => { switchTo(() => st().createPlant('New plant')); setOpen(false); useUi.getState().setEditMode(true); }}>
            <Icon name="plus" size={14} />New plant
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- palette

export function Palette() {
  const tool = useUi(s => s.tool);
  const setTool = useUi(s => s.setTool);
  const cats = [...new Set(ASSET_KINDS.map(k => k.category))];
  return (
    <aside className="palette" aria-label="Asset palette">
      <div className="palette-tools">
        <button type="button" className={`btn sm${tool.type === 'select' ? ' on' : ''}`} onClick={() => setTool({ type: 'select' })} title="Select / move (Esc)"><Icon name="cursor" />Select</button>
        <button type="button" className={`btn sm${tool.type === 'pipe' ? ' on' : ''}`} onClick={() => setTool({ type: 'pipe' })} title="Connect two assets with a pipe"><Icon name="pipe" />Pipe</button>
      </div>
      {tool.type === 'pipe' && <p className="hint">{tool.from ? 'Now click the destination asset.' : 'Click the source asset, then the destination.'}</p>}
      {tool.type === 'place' && <p className="hint">Click the ground to place. Esc to stop.</p>}
      <div className="palette-scroll">
        {cats.map(c => (
          <div key={c} className="palette-group">
            <div className="palette-cat">{CAT_LABEL[c]}</div>
            <div className="palette-grid">
              {ASSET_KINDS.filter(k => k.category === c).map(k => {
                const on = tool.type === 'place' && tool.kind === k.kind;
                return (
                  <button key={k.kind} type="button" className={`kind${on ? ' on' : ''}`} title={k.label}
                    onClick={() => setTool(on ? { type: 'select' } : { type: 'place', kind: k.kind })}>
                    {THUMBS.has(k.kind) ? <img src={`/models/thumbs/${k.kind}.png`} alt="" /> : <span className="kind-icon"><Icon name={CAT_ICON[c]} size={20} /></span>}
                    <span>{k.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------- properties

export function rotateSelected() {
  const id = useUi.getState().selectedItemId;
  if (!id) return;
  usePlantStore.getState().edit(d => ({ ...d, items: d.items.map(i => i.id === id ? { ...i, rotationY: (i.rotationY + Math.PI / 2) % (Math.PI * 2) } : i) }));
}
export function deleteSelection() {
  const { selectedItemId, selectedPipeId } = useUi.getState();
  if (selectedItemId) {
    usePlantStore.getState().edit(d => ({
      ...d,
      items: d.items.filter(i => i.id !== selectedItemId),
      pipes: d.pipes.filter(p => p.from.itemId !== selectedItemId && p.to.itemId !== selectedItemId),
    }));
    useUi.getState().select(null);
  } else if (selectedPipeId) {
    usePlantStore.getState().edit(d => ({ ...d, pipes: d.pipes.filter(p => p.id !== selectedPipeId) }));
    useUi.getState().selectPipe(null);
  }
}

export function Properties({ doc }: { doc: LayoutDoc }) {
  const selectedItemId = useUi(s => s.selectedItemId);
  const selectedPipeId = useUi(s => s.selectedPipeId);
  const edit = usePlantStore(s => s.edit);
  const item = doc.items.find(i => i.id === selectedItemId);
  const pipe = doc.pipes.find(p => p.id === selectedPipeId);
  const [label, setLabel] = useState(item?.label ?? '');
  useEffect(() => setLabel(item?.label ?? ''), [item?.id, item?.label]);

  if (pipe) {
    const name = (id: string) => doc.items.find(i => i.id === id)?.label ?? id;
    return (
      <aside className="inspector props" aria-label="Pipe properties">
        <header><span className="muted small">Pipe</span></header>
        <div className="insp-body">
          <p className="pipe-route"><span className="mono">{name(pipe.from.itemId)}</span> <span className="muted">→</span> <span className="mono">{name(pipe.to.itemId)}</span></p>
          <button type="button" className="btn danger sm" onClick={deleteSelection}><Icon name="trash" />Delete pipe</button>
        </div>
      </aside>
    );
  }
  if (!item) return null;

  const update = (patch: Partial<LayoutItem>) => edit(d => ({ ...d, items: d.items.map(i => i.id === item.id ? { ...i, ...patch } : i) }));
  const boundElsewhere = new Set(doc.items.filter(i => i.assetId && i.id !== item.id).map(i => i.assetId!));
  const def = getKind(item.kind);
  return (
    <aside className="inspector props" aria-label="Item properties">
      <header><span className="muted small">Layout item · {def.label}</span></header>
      <div className="insp-body">
        <label className="field">
          <span>Label</span>
          <input value={label} onChange={e => setLabel(e.target.value)} onBlur={() => label !== item.label && update({ label })}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); e.stopPropagation(); }} />
        </label>
        <label className="field">
          <span>Equipment binding</span>
          <select value={item.assetId ?? ''} onChange={e => {
            const v = e.target.value || undefined;
            update({ assetId: v, ...(v && (item.label === def.label || item.label === item.assetId) ? { label: v } : {}) });
          }}>
            <option value="">Unbound (no live status)</option>
            {PLANT.equipment.map(a => (
              <option key={a.asset_id} value={a.asset_id} disabled={boundElsewhere.has(a.asset_id)}>
                {a.asset_id} — {a.asset_type}{boundElsewhere.has(a.asset_id) ? ' (placed)' : ''}
              </option>
            ))}
          </select>
        </label>
        <div className="field-row muted small">
          <span>Position <span className="mono">{item.position[0].toFixed(1)}, {item.position[1].toFixed(1)} m</span></span>
          <span>Rotation <span className="mono">{Math.round((item.rotationY * 180) / Math.PI)}°</span></span>
        </div>
        <div className="insp-actions">
          <button type="button" className="btn sm" onClick={rotateSelected}><Icon name="rotate" />Rotate 90° <kbd>R</kbd></button>
          <button type="button" className="btn danger sm" onClick={deleteSelection}><Icon name="trash" />Delete <kbd>Del</kbd></button>
        </div>
      </div>
    </aside>
  );
}
