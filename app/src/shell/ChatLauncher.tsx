import { useState } from 'react';
import { Icon } from './icons';

interface Msg { from: 'me' | 'bot'; text: string }

export function ChatLauncher() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([{ from: 'bot', text: 'Hi — ask me about equipment status, PM or spares.' }]);
  const [draft, setDraft] = useState('');
  const send = () => {
    const t = draft.trim();
    if (!t) return;
    setMsgs(m => [...m, { from: 'me', text: t }, { from: 'bot', text: 'Assistant not connected yet.' }]);
    setDraft('');
  };
  return (
    <>
      {open && (
        <section className="chat" aria-label="Assistant">
          <header><span>GearCast Assistant</span><button type="button" className="icon-btn" onClick={() => setOpen(false)} aria-label="Close"><Icon name="close" /></button></header>
          <div className="chat-body">{msgs.map((m, i) => <p key={i} className={`chat-msg ${m.from}`}>{m.text}</p>)}</div>
          <form className="chat-input" onSubmit={e => { e.preventDefault(); send(); }}>
            <input value={draft} onChange={e => setDraft(e.target.value)} placeholder="Ask about the plant…" />
            <button type="submit" className="icon-btn" aria-label="Send"><Icon name="send" /></button>
          </form>
        </section>
      )}
      <button type="button" className="chat-fab" onClick={() => setOpen(o => !o)} aria-label="Open assistant">
        <Icon name={open ? 'close' : 'chat'} size={20} />
      </button>
    </>
  );
}
