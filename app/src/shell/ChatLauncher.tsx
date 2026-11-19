import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons';
import { Caster, type CasterState } from './Caster';
import { Markdown } from './Markdown';
import { openAsset } from './TopBar';
import { simPayload, streamSSE } from '../api/client';
import { useStatusCtx } from '../store/statusStore';
import { useIntent } from '../store/intentStore';
import { navigate } from '../store/route';
import '../styles/chat.css';

interface ToolChip { id: string; label: string; status: 'start' | 'done' }
interface Action { kind: 'open_asset' | 'open_troubleshoot' | 'draft_incident'; asset_id?: string | null; query?: string; label?: string }
interface Msg { role: 'user' | 'assistant'; content: string; tools?: ToolChip[]; actions?: Action[]; error?: string; pending?: boolean }

const SUGGESTIONS = ['Which assets need attention and do we have backups?', 'What PM is due this week?', 'Any spare parts below minimum?'];
const GREETING = "Hi, I'm Caster. Ask me about equipment status, backups, PM, spares or costs.";

function runAction(a: Action) {
  if (a.kind === 'open_asset' && a.asset_id) openAsset(a.asset_id);
  else if (a.kind === 'open_troubleshoot') { useIntent.getState().setTroubleshoot(a.query ?? '', a.asset_id); navigate('troubleshoot'); }
  else if (a.kind === 'draft_incident' && a.asset_id) { useIntent.getState().setIncident(a.asset_id); navigate('incidents'); }
}
const actionLabel = (a: Action) => a.label || (a.kind === 'open_asset' ? `Open ${a.asset_id}` : a.kind === 'draft_incident' ? `Draft incident · ${a.asset_id}` : 'Troubleshoot');
const actionIcon = (a: Action) => (a.kind === 'open_asset' ? 'plant' : a.kind === 'draft_incident' ? 'incidents' : 'wrench');

export function ChatLauncher() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<CasterState>('idle');
  const bodyRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const ctx = useStatusCtx();
  const alarms = Object.values(ctx.statusById).filter(s => s.current_status === 'Shut Down').length;

  useEffect(() => { bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight }); }, [msgs, open]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const patchLast = (fn: (m: Msg) => Msg) => setMsgs(ms => ms.map((m, i) => (i === ms.length - 1 ? fn(m) : m)));

  const send = async (text?: string) => {
    const t = (text ?? draft).trim();
    if (!t || busy !== 'idle') return;
    const history = [...msgs, { role: 'user' as const, content: t }];
    setMsgs([...history, { role: 'assistant', content: '', tools: [], pending: true }]);
    setDraft('');
    setBusy('thinking');
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      await streamSSE('/api/chat', { messages: history.map(m => ({ role: m.role, content: m.content })), sim: simPayload() }, e => {
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

  const reset = () => { abortRef.current?.abort(); setMsgs([]); setBusy('idle'); };

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
              ? <div key={i} className="chat-msg me">{m.content}</div>
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
          <form className="chat-input" onSubmit={e => { e.preventDefault(); send(); }}>
            <input value={draft} onChange={e => setDraft(e.target.value)} placeholder="Ask Caster about the plant…" disabled={busy !== 'idle'} />
            <button type="submit" className="icon-btn send" aria-label="Send" disabled={busy !== 'idle' || !draft.trim()}><Icon name="send" /></button>
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
