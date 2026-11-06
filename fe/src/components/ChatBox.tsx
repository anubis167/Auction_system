import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { http } from '../api';

type ChatMessage = { role: 'user' | 'model'; text: string };

/** Same limits as be/chat.py. An odd count keeps the sent history starting on a user message. */
const MAX_SENT = 19;
const MAX_TEXT = 1000;

/**
 * chat-1.2: chat box embedded in every page. be/chat.py answers with the same Gemini model as the Messenger bot
 * (Facebook retired its embeddable plugin). The conversation lives here only, so a reload starts a new one.
 */
export function ChatBox() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toggle = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open, busy]);
  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [open, messages, busy, error]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    const next: ChatMessage[] = [...messages, { role: 'user', text }];
    setMessages(next);
    setDraft('');
    setError('');
    setBusy(true);
    try {
      const { data } = await http.post<{ reply: string }>('/chat', { messages: next.slice(-MAX_SENT) });
      setMessages([...next, { role: 'model', text: data.reply }]);
    } catch {
      // The text goes back in the field, so a failed send loses nothing and can be retried.
      setMessages(messages);
      setDraft(text);
      setError('The assistant is unavailable right now. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const onEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && open) {
      setOpen(false);
      toggle.current?.focus();
    }
  };

  return (
    <div className="chat" onKeyDown={onEscape}>
      <section className="chat-panel" id="chat-panel" aria-label="Chat with Beat'em" hidden={!open} data-testid="chat-panel">
        <h2 className="chat-title">Chat with Beat'em</h2>
        <div className="chat-log" role="log" aria-live="polite" ref={log} data-testid="chat-log">
          <p className="chat-msg chat-msg-model">Hi! How can we help you today?</p>
          {messages.map((m, i) => (
            <p key={i} className={`chat-msg chat-msg-${m.role}`}>
              {m.text}
            </p>
          ))}
          {busy && <p className="chat-msg chat-msg-model">Typing…</p>}
        </div>
        {error && (
          <p className="chat-error" role="alert">
            {error}
          </p>
        )}
        <form className="chat-form" onSubmit={send}>
          <input
            ref={input}
            aria-label="Your message"
            placeholder="Type a message"
            maxLength={MAX_TEXT}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={busy}
            data-testid="chat-input"
          />
          <button type="submit" className="btn btn-primary" disabled={busy || !draft.trim()}>
            Send
          </button>
        </form>
      </section>
      <button
        type="button"
        ref={toggle}
        className="chat-toggle"
        aria-label={open ? 'Close chat' : 'Open chat'}
        aria-expanded={open}
        aria-controls="chat-panel"
        onClick={() => setOpen((o) => !o)}
        data-testid="chat-toggle"
      >
        <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="currentColor" d="M4 3h16a2 2 0 012 2v11a2 2 0 01-2 2H9l-5 4v-4a2 2 0 01-2-2V5a2 2 0 012-2z" />
        </svg>
      </button>
    </div>
  );
}
