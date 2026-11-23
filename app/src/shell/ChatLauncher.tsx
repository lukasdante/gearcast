import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons';
import { Caster, type CasterState } from './Caster';
import { Markdown } from './Markdown';
import { openAsset } from './TopBar';
import { simPayload, streamSSE } from '../api/client';
import { OP_REGISTRY, appState, opDenied, setChatPhoto } from '../ai/ops';
import { preparePhoto, type ReportPhoto } from '../api/incidentDocs';
import { dialog } from './Modal';
import { useStatusCtx } from '../store/statusStore';
import { useIntent } from '../store/intentStore';
import { navigate } from '../store/route';
import '../styles/chat.css';

interface ToolChip { id: string; label: string; status: 'start' | 'done' }
interface Action { kind: 'open_asset' | 'open_troubleshoot' | 'draft_incident' | 'open_repair_replace'; asset_id?: string | null; query?: string; label?: string }
interface OpCard { id: string; name: string; args: Record<string, unknown>; confirm: boolean; state: 'ask' | 'running' | 'done' | 'error' | 'cancelled'; result?: string }
interface Msg { role: 'user' | 'assistant'; content: string; photo?: ReportPhoto; tools?: ToolChip[]; actions?: Action[]; ops?: OpCard[]; error?: string; pending?: boolean }

const SUGGESTIONS = ['Which assets need attention and do we have backups?', 'What PM is due this week?', 'Any spare parts below minimum?'];
const GREETING = "Hi, I'm Caster. Ask me about equipment status, backups, PM, spares or costs.";

function runAction(a: Action) {
  if (a.kind === 'open_asset' && a.asset_id) openAsset(a.asset_id);
  else if (a.kind === 'open_troubleshoot') { useIntent.getState().setTroubleshoot(a.query ?? '', a.asset_id); navigate('troubleshoot'); }
  else if (a.kind === 'draft_incident' && a.asset_id) { useIntent.getState().setIncident(a.asset_id); navigate('incidents'); }
  else if (a.kind === 'open_repair_replace') { if (a.asset_id) useIntent.getState().setRR(a.asset_id); navigate('rr'); }
}
const actionLabel = (a: Action) => a.label || (a.kind === 'open_asset' ? `Open ${a.asset_id}` : a.kind === 'draft_incident' ? `Draft incident · ${a.asset_id}`
  : a.kind === 'open_repair_replace' ? `Repair or replace${a.asset_id ? ` · ${a.asset_id}` : ''}` : 'Troubleshoot');
const actionIcon = (a: Action) => (a.kind === 'open_asset' ? 'plant' : a.kind === 'draft_incident' ? 'incidents' : a.kind === 'open_repair_replace' ? 'cycle' : 'wrench');

export function ChatLauncher() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState('');
  const [photo, setPhoto] = useState<ReportPhoto | null>(null);
  const [photoErr, setPhotoErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const attach = async (f: File | undefined) => {
    if (!f) return;
    setPhotoErr(null);
    try { setPhoto(await preparePhoto(f, f.name.replace(/\.[^.]+$/, ''))); } catch { setPhotoErr(`Could not read ${f.name} (use JPEG or PNG)`); }
  };
  const [busy, setBusy] = useState<CasterState>('idle');
  const bodyRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const ctx = useStatusCtx();
  const alarms = Object.values(ctx.statusById).filter(s => s.current_status === 'Shut Down').length;

  useEffect(() => { bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight }); }, [msgs, open]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const patchLast = (fn: (m: Msg) => Msg) => setMsgs(ms => ms.map((m, i) => (i === ms.length - 1 ? fn(m) : m)));

  const send = async (text?: string) => {
    const t = (text ?? draft).trim() || (photo ? 'Photo attached.' : '');
    if (!t || busy !== 'idle') return;
    const history: Msg[] = [...msgs, { role: 'user' as const, content: t, ...(photo ? { photo } : {}) }];
    setMsgs([...history, { role: 'assistant', content: '', tools: [], pending: true }]);
    setDraft('');
    if (photo) { setChatPhoto(photo); setPhoto(null); }
    setBusy('thinking');
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      await streamSSE('/api/chat', { messages: history.map(m => ({ role: m.role, content: m.content + (m.photo ? `\n[Photo attached: ${m.photo.caption || 'photo'} (${m.photo.w}×${m.photo.h}). If an incident report is requested, the app adds it as Photo 1.]` : '') + (m.ops?.length ? `\n[Operations: ${m.ops.map(o => `${o.name} ${o.state}${o.result ? ` (${o.result})` : ''}`).join('; ')}]` : '') })), sim: simPayload(), client: appState() }, e => {
        if (e.type === 'delta') { setBusy('talking'); patchLast(m => ({ ...m, content: m.content + e.text })); }
        else if (e.type === 'reset_text') patchLast(m => ({ ...m, content: '' }));
        else if (e.type === 'tool') {
          setBusy('thinking');
          patchLast(m => {
            const tools = [...(m.tools ?? [])];
            const i = tools.findIndex(x => x.id === e.id);
            if (i >= 0) tools[i] = { ...tools[i], status: e.status }; else tools.push({ id: e.id, label: e.label, status: e.status });
            return { ...m, tools };
          });
        } else if (e.type === 'op') {
          const card: OpCard = { id: e.id, name: e.name, args: e.args ?? {}, confirm: !!e.confirm, state: e.confirm ? 'ask' : 'running' };
          patchLast(m => ({ ...m, ops: [...(m.ops ?? []), card] }));
          if (!e.confirm) runOp(card);
        } else if (e.type === 'actions') patchLast(m => ({ ...m, actions: e.actions }));
        else if (e.type === 'error') patchLast(m => ({ ...m, error: e.message }));
      }, ac.signal);
    } catch (err) {
      if (!ac.signal.aborted) patchLast(m => ({ ...m, error: 'Caster is offline – is the backend running on :8000?' }));
    } finally {
      patchLast(m => ({ ...m, pending: false }));
      setBusy('idle');
    }
  };

  const patchOp = (id: string, p: Partial<OpCard>) => setMsgs(ms => ms.map(m => (m.ops?.some(o => o.id === id) ? { ...m, ops: m.ops!.map(o => (o.id === id ? { ...o, ...p } : o)) } : m)));
  const runOp = async (o: OpCard) => {
    const def = OP_REGISTRY[o.name];
    if (!def) { patchOp(o.id, { state: 'error', result: 'Not supported in this app' }); return; }
    const denied = opDenied(o.name);
    if (denied) { patchOp(o.id, { state: 'error', result: denied }); return; }
    if (o.name === 'delete_plant') {
      const ok = await dialog.confirm({ title: 'Delete plant', body: `Caster asked to delete "${o.args.plant}". This cannot be undone.`, action: 'Delete plant', danger: true, typeToConfirm: String(o.args.plant) });
      if (!ok) { patchOp(o.id, { state: 'cancelled' }); return; }
    }
    patchOp(o.id, { state: 'running' });
    try { patchOp(o.id, { state: 'done', result: await def.run(o.args) }); } catch (err) { patchOp(o.id, { state: 'error', result: err instanceof Error ? err.message : 'Failed' }); }
  };

  const reset = () => { abortRef.current?.abort(); setMsgs([]); setBusy('idle'); setPhoto(null); setChatPhoto(null); };

  return (
    <>
      {open && (
        <section className="chat" aria-label="Caster assistant">
          <header>
            <span className="chat-title"><Caster size={26} state={busy} /> <b>Caster</b> <span className="muted small">GearCast assistant</span></span>
            <span className="chat-head-actions">
              {msgs.length > 0 && <button type="button" className="btn ghost sm" onClick={reset}>New chat</button>}
              <button type="button" className="icon-btn" onClick={() => setOpen(false)} aria-label="Close"><Icon name="close" /></button>
            </span>
          </header>
          <div className="chat-body" ref={bodyRef}>
            <div className="chat-msg bot"><p>{GREETING}</p></div>
            {msgs.length === 0 && (
              <div className="chat-suggest">
                {SUGGESTIONS.map(s => <button key={s} type="button" className="suggest" onClick={() => send(s)}>{s}</button>)}
              </div>
            )}
            {msgs.map((m, i) => m.role === 'user'
              ? <div key={i} className="chat-msg me">{m.photo && <img className="chat-photo" src={m.photo.url} alt={m.photo.caption || 'Attached photo'} />}{m.content}</div>
              : (
                <div key={i} className="chat-msg bot">
                  {!!m.tools?.length && (
                    <div className="tool-chips">
                      {m.tools.map(t => (
                        <span key={t.id} className={`tool-chip ${t.status}`}>
                          {t.status === 'start' ? <span className="spin" /> : <Icon name="check" size={12} />}{t.label}{t.status === 'start' ? '…' : ''}
                        </span>
                      ))}
                    </div>
                  )}
                  {m.content ? <Markdown text={m.content} /> : m.pending && !m.error ? <div className="typing"><i /><i /><i /></div> : null}
                  {m.error && <p className="chat-err">{m.error}</p>}
                  {!!m.ops?.length && (
                    <div className="op-cards">
                      {m.ops.map(o => {
                        const def = OP_REGISTRY[o.name];
                        return (
                          <div key={o.id} className={`op-card ${o.state}`}>
                            <span className="op-ico">{o.state === 'running' ? <span className="spin" /> : o.state === 'done' ? <Icon name="check" size={13} /> : o.state === 'ask' ? <Icon name="bolt" size={13} /> : <Icon name="close" size={13} />}</span>
                            <span className="op-txt"><b>{def ? def.label(o.args) : o.name}</b>{o.result && <span className="muted small">{o.result}</span>}{o.state === 'cancelled' && <span className="muted small">Cancelled</span>}</span>
                            {o.state === 'ask' && <span className="op-btns">
                              <button type="button" className="btn ghost sm" onClick={() => patchOp(o.id, { state: 'cancelled' })}>Cancel</button>
                              <button type="button" className={`btn sm ${/delete|fault|reset/.test(o.name) ? 'danger solid' : 'primary'}`} onClick={() => runOp(o)}>Confirm</button>
                            </span>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {!!m.actions?.length && !m.pending && (
                    <div className="chat-actions">
                      {m.actions.map((a, j) => (
                        <button key={j} type="button" className="btn sm" onClick={() => runAction(a)}>
                          <Icon name={actionIcon(a)} size={13} />{actionLabel(a)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
          </div>
          {(photo || photoErr) && (
            <div className="chat-attach">
              {photo && <><img src={photo.url} alt="" /><span className="small">{photo.caption || 'Photo'} · goes into an incident report as Photo 1</span>
                <button type="button" className="icon-btn" aria-label="Remove photo" onClick={() => setPhoto(null)}><Icon name="close" size={13} /></button></>}
              {photoErr && <span className="chat-err">{photoErr}</span>}
            </div>
          )}
          <form className="chat-input" onSubmit={e => { e.preventDefault(); send(); }}>
            <button type="button" className="icon-btn" aria-label="Attach photo" title="Attach photo" disabled={busy !== 'idle'} onClick={() => fileRef.current?.click()}><Icon name="camera" /></button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => { attach(e.target.files?.[0]); e.target.value = ''; }} />
            <input value={draft} onChange={e => setDraft(e.target.value)} placeholder={photo ? 'Describe the photo, e.g. "file an incident report for P-101B"' : 'Ask Caster about the plant…'} disabled={busy !== 'idle'} />
            <button type="submit" className="icon-btn send" aria-label="Send" disabled={busy !== 'idle' || (!draft.trim() && !photo)}><Icon name="send" /></button>
          </form>
        </section>
      )}
      <button type="button" className={`caster-fab${open ? ' open' : ''}`} onClick={() => setOpen(o => !o)}
        aria-label={open ? 'Close Caster' : 'Ask Caster'} title="Ask Caster" aria-expanded={open}>
        <Caster size={52} state={busy} alert={alarms > 0 && !open} />
      </button>
    </>
  );
}
