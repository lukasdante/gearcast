/**
 * Reusable dark modal (focus-trapped, Esc / backdrop to close) and a promise-based dialog helper that replaces
 * window.alert / confirm / prompt:
 *   await dialog.confirm({ title, body, typeToConfirm: 'Plant name', action: 'Delete', danger: true })  → boolean
 *   await dialog.prompt({ title, label, initial, validate })                                           → string | null
 *   await dialog.alert({ title, body })
 * Mount <DialogHost /> once (App.tsx).
 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { create } from 'zustand';
import { Icon } from './icons';
import '../styles/modal.css';

// ---------------------------------------------------------------- Modal

export function Modal({ title, onClose, children, footer, width = 440 }: {
  title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; width?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const focusables = () => [...(el?.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') ?? [])]
      .filter(f => !f.hasAttribute('disabled'));
    (el?.querySelector<HTMLElement>('[data-autofocus]') ?? focusables()[0])?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
      if (e.key !== 'Tab') return;
      const f = focusables();
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => { window.removeEventListener('keydown', onKey, true); prev?.focus?.(); };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref} style={{ width }}>
        <header>
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- dialog helper

interface ConfirmOpts { title: string; body?: ReactNode; action?: string; danger?: boolean; typeToConfirm?: string }
interface PromptOpts { title: string; body?: ReactNode; label: string; initial?: string; action?: string; validate?: (v: string) => string | null }
interface AlertOpts { title: string; body?: ReactNode }
type Req =
  | { kind: 'confirm'; opts: ConfirmOpts; resolve: (v: boolean) => void }
  | { kind: 'prompt'; opts: PromptOpts; resolve: (v: string | null) => void }
  | { kind: 'alert'; opts: AlertOpts; resolve: () => void };

const useDialogStore = create<{ req: Req | null; set: (r: Req | null) => void }>()(set => ({ req: null, set: req => set({ req }) }));

export const dialog = {
  confirm: (opts: ConfirmOpts) => new Promise<boolean>(resolve => useDialogStore.getState().set({ kind: 'confirm', opts, resolve })),
  prompt: (opts: PromptOpts) => new Promise<string | null>(resolve => useDialogStore.getState().set({ kind: 'prompt', opts, resolve })),
  alert: (opts: AlertOpts) => new Promise<void>(resolve => useDialogStore.getState().set({ kind: 'alert', opts, resolve })),
};

function ConfirmDialog({ opts, done }: { opts: ConfirmOpts; done: (v: boolean) => void }) {
  const [typed, setTyped] = useState('');
  const ok = !opts.typeToConfirm || typed === opts.typeToConfirm;
  return (
    <Modal title={opts.title} onClose={() => done(false)} footer={<>
      <button type="button" className="btn" onClick={() => done(false)}>Cancel</button>
      <button type="button" className={`btn ${opts.danger ? 'danger solid' : 'primary'}`} disabled={!ok} onClick={() => done(true)}
        data-autofocus={opts.typeToConfirm ? undefined : true}>{opts.action ?? 'Confirm'}</button>
    </>}>
      {opts.body && <div className="modal-text">{opts.body}</div>}
      {opts.typeToConfirm && (
        <label className="field">
          <span className="modal-type-hint">Type <b className="mono">{opts.typeToConfirm}</b> to confirm</span>
          <input data-autofocus value={typed} onChange={e => setTyped(e.target.value)} autoComplete="off" spellCheck={false}
            onKeyDown={e => { if (e.key === 'Enter' && ok) done(true); }} />
        </label>
      )}
    </Modal>
  );
}

function PromptDialog({ opts, done }: { opts: PromptOpts; done: (v: string | null) => void }) {
  const [v, setV] = useState(opts.initial ?? '');
  const [touched, setTouched] = useState(false);
  const err = opts.validate?.(v) ?? (v.trim() ? null : 'Required');
  const submit = () => { setTouched(true); if (!err) done(v.trim()); };
  return (
    <Modal title={opts.title} onClose={() => done(null)} footer={<>
      <button type="button" className="btn" onClick={() => done(null)}>Cancel</button>
      <button type="button" className="btn primary" disabled={!!err && touched} onClick={submit}>{opts.action ?? 'Save'}</button>
    </>}>
      {opts.body && <div className="modal-text">{opts.body}</div>}
      <label className="field">
        <span>{opts.label}</span>
        <input data-autofocus value={v} onChange={e => { setV(e.target.value); setTouched(true); }} aria-invalid={!!err && touched}
          onFocus={e => e.target.select()} onKeyDown={e => { if (e.key === 'Enter') submit(); }} />
        {touched && err && <em className="field-err">{err}</em>}
      </label>
    </Modal>
  );
}

export function DialogHost() {
  const req = useDialogStore(s => s.req);
  const clear = useDialogStore(s => s.set);
  if (!req) return null;
  if (req.kind === 'confirm') return <ConfirmDialog opts={req.opts} done={v => { clear(null); req.resolve(v); }} />;
  if (req.kind === 'prompt') return <PromptDialog opts={req.opts} done={v => { clear(null); req.resolve(v); }} />;
  return (
    <Modal title={req.opts.title} onClose={() => { clear(null); req.resolve(); }}
      footer={<button type="button" className="btn primary" data-autofocus onClick={() => { clear(null); req.resolve(); }}>OK</button>}>
      {req.opts.body && <div className="modal-text">{req.opts.body}</div>}
    </Modal>
  );
}
