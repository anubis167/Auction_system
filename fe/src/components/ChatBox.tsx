import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { http } from '../api';
import { useAuth } from '../auth';
import {
  CLOSED,
  CONNECTING,
  MAX_TEXT,
  addMessage,
  applyEvent,
  botHistory,
  staffState,
  toTranscript,
  type ServerConversation,
  type ServerMessage,
  type SupportEvent,
  type SupportState,
} from '../supportChat';

const BOT: SupportState = { mode: 'bot', conversationId: null, lines: [] };
const DOWN = 'Your assistant not available now';
/** pop-3.1: suggestion chips; questions the site can really answer (no auto-bid or shipping). */
export const CHAT_CHIPS = ['How do I bid?', 'How does credit work?', 'Condition report'] as const;

/**
 * chat-1.2: chat box embedded in every page, answered by be/rag/chat.py. sch-1.7: when the bot hands a signed-in
 * customer off (rate limit or Gemini down, sch-1.3) the box switches to staff mode: the bot transcript opens a
 * conversation on /api/support and staff replies arrive live (useUserEvents -> 'support-chat' window event).
 * The open conversation is read again on load and whenever the box is opened, so a reload or a dropped stream
 * loses nothing. Guests, staff and admins only ever talk to the bot.
 */
export function ChatBox() {
  const { user } = useAuth();
  const customer = user?.role === 'customer';
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<SupportState>(BOT);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [down, setDown] = useState(false);
  // pop-3.1: staff replies that arrive while the box is closed.
  const [unread, setUnread] = useState(0);
  const openRef = useRef(open);
  openRef.current = open;
  const toggle = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLDivElement>(null);

  /** Brings the box in line with the server: an open conversation means staff mode. */
  const sync = useCallback(async () => {
    try {
      const { data } = await http.get<{ conversation: ServerConversation | null }>('/support/conversations/mine');
      setState((s) => {
        if (data.conversation) return staffState(data.conversation);
        // Closed while this page was not listening.
        return s.mode === 'staff' ? { mode: 'bot', conversationId: null, lines: [...s.lines, { role: 'system', text: CLOSED }] } : s;
      });
    } catch {
      // Offline or signed out: keep what is shown.
    }
  }, []);

  useEffect(() => {
    setState(BOT);
    if (customer) void sync();
  }, [customer, user?.id, sync]);
  useEffect(() => {
    if (open && customer) void sync();
  }, [open, customer, sync]);
  // The bot service (be/rag/chat.py) is checked each time the box opens; staff mode does not need it.
  useEffect(() => {
    if (!open || state.mode === 'staff') return;
    http.get('/chat/health').then(
      () => setDown(false),
      () => setDown(true),
    );
  }, [open, state.mode]);
  // pop-2.5: other parts of the page (the lot's Condition tab) can open the box.
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener('open-chat', onOpen);
    return () => window.removeEventListener('open-chat', onOpen);
  }, []);
  useEffect(() => {
    if (open) setUnread(0);
  }, [open]);
  useEffect(() => {
    const onEvent = (e: Event) => {
      const event = (e as CustomEvent<SupportEvent>).detail;
      if (event.type === 'chat-message' && event.data.message.sender === 'staff' && !openRef.current) setUnread((n) => n + 1);
      setState((s) => applyEvent(s, event));
    };
    window.addEventListener('support-chat', onEvent);
    return () => window.removeEventListener('support-chat', onEvent);
  }, []);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open, busy]);
  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [open, state, busy, error]);

  const handOff = async (reason: string, lines: SupportState['lines']) => {
    const { data } = await http.post<{ conversation: ServerConversation }>('/support/conversations', { reason, transcript: toTranscript(lines) });
    setState(staffState(data.conversation, CONNECTING));
  };

  const askBot = async (text: string) => {
    const lines = [...state.lines, { role: 'user' as const, text }];
    setState({ ...state, lines });
    try {
      const { data } = await http.post<{ reply?: string; handoff?: boolean; reason?: string }>('/chat', { messages: botHistory(lines) });
      if (data.handoff && data.reason) await handOff(data.reason, lines);
      else setState((s) => ({ ...s, lines: [...lines, { role: 'model', text: data.reply ?? '' }] }));
    } catch {
      // The text goes back in the field, so a failed send loses nothing and can be retried.
      setState(state);
      setDraft(text);
      setError(DOWN);
    }
  };

  const askStaff = async (text: string, conversationId: string) => {
    try {
      const { data } = await http.post<{ message: ServerMessage }>(`/support/conversations/${conversationId}/messages`, { text });
      setState((s) => addMessage(s, data.message));
    } catch {
      setDraft(text);
      setError('Your message was not sent. Please try again.');
      void sync(); // it may have been closed meanwhile
    }
  };

  const send = (e: FormEvent) => {
    e.preventDefault();
    void sendText(draft.trim());
  };

  const sendText = async (text: string) => {
    if (!text || busy) return;
    setDraft('');
    setError('');
    setBusy(true);
    try {
      if (state.mode === 'staff' && state.conversationId) await askStaff(text, state.conversationId);
      else await askBot(text);
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

  const staffMode = state.mode === 'staff';
  const offline = down && !staffMode;
  // pop-3.1: 'Auction desk' panel; the status line follows /api/chat/health (staff mode is always staffed).
  const status = offline ? 'Offline · leave it for later' : staffMode ? 'Online · our staff will reply here' : 'Online · usually replies in minutes';
  return (
    <div className="chat" onKeyDown={onEscape}>
      <section className="chat-panel" id="chat-panel" aria-label="Auction desk chat" hidden={!open} data-testid="chat-panel" data-mode={state.mode}>
        <header className="chat-head">
          <span className="chat-avatar halftone halftone-yellow" aria-hidden="true">
            <ChatIcon />
          </span>
          <div>
            <h2 className="chat-title">Auction desk</h2>
            <p className={`chat-status ${offline ? 'is-offline' : ''}`} data-testid="chat-status">
              <span className="chat-status-dot" aria-hidden="true" />
              {status}
            </p>
          </div>
        </header>
        <div className="chat-log" role="log" aria-live="polite" ref={log} data-testid="chat-log">
          {state.lines.map((m, i) => (
            <p key={m.id ?? `l${i}`} className={`chat-msg chat-msg-${m.role}`}>
              {m.text}
            </p>
          ))}
          {busy && !staffMode && (
            <p className="chat-msg chat-msg-model chat-typing" aria-label="Typing">
              <span />
              <span />
              <span />
            </p>
          )}
        </div>
        {!staffMode && !offline && (
          <div className="chat-chips" data-testid="chat-chips">
            {CHAT_CHIPS.map((c) => (
              <button key={c} type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void sendText(c)}>
                {c}
              </button>
            ))}
          </div>
        )}
        {(offline || error) && (
          <p className="chat-error" role="alert">
            {offline ? DOWN : error}
          </p>
        )}
        <form className="chat-form" onSubmit={send}>
          <input
            ref={input}
            aria-label="Your message"
            placeholder={staffMode ? 'Message our staff' : 'Type a message'}
            maxLength={MAX_TEXT}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={busy || offline}
            data-testid="chat-input"
          />
          <button type="submit" className="btn btn-trust" disabled={busy || offline || !draft.trim()}>
            Send
          </button>
        </form>
      </section>
      <div className="chat-launcher">
        {!open && (
          <span className="speech chat-teaser" style={{ transform: 'rotate(-3deg)' }} aria-hidden="true">
            Questions? Holler!
          </span>
        )}
        <button
          type="button"
          ref={toggle}
          className="chat-toggle"
          aria-label={open ? 'Close chat' : unread ? `Open chat, ${unread} unread` : 'Open chat'}
          aria-expanded={open}
          aria-controls="chat-panel"
          onClick={() => setOpen((o) => !o)}
          data-testid="chat-toggle"
        >
          <ChatIcon />
          {unread > 0 && (
            <span className="chat-unread" data-testid="chat-unread" aria-hidden="true">
              {unread}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}

function ChatIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 4h16v11H10l-5 4v-4H4z" />
      <path d="M8 9h8M8 12h5" />
    </svg>
  );
}
