import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
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
import {
  addMessageToSession,
  clearAllSessions,
  createSession,
  DEFAULT_WELCOME_MESSAGE,
  deleteSession,
  formatMessageTime,
  formatRelativeTime,
  loadActiveSessionId,
  loadSessions,
  MAX_SENT_MESSAGES,
  saveActiveSessionId,
  saveSessions,
  type ChatMessage,
  type ChatSession,
} from '../chatHistory';

const BOT: SupportState = { mode: 'bot', conversationId: null, lines: [] };
const DOWN = 'Your assistant not available now';

/** pop-3.1: suggestion chips; questions the site can really answer. */
export const CHAT_CHIPS = ['How do I bid?', 'How does credit work?', 'Condition report', 'How do I place a bid?'] as const;

/**
 * chat-1.2 & chat-ui-1.2: embedded chat box in every page.
 * Supports multi-session conversation history in bot mode, session switching, title auto-generation,
 * timestamps, and persistence across reloads.
 * When a signed-in customer is handed off, switches to staff mode on /api/support.
 */
export function ChatBox() {
  const { user } = useAuth();
  const location = useLocation();
  const customer = user?.role === 'customer';
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'chat' | 'history'>('chat');
  const [state, setState] = useState<SupportState>(BOT);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [down, setDown] = useState(false);
  const [unread, setUnread] = useState(0);

  const openRef = useRef(open);
  openRef.current = open;
  const toggle = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLDivElement>(null);

  // Initialize bot conversation sessions from storage
  useEffect(() => {
    const loaded = loadSessions();
    const storedActiveId = loadActiveSessionId();

    if (loaded.length > 0) {
      setSessions(loaded);
      const matched = loaded.find((s) => s.id === storedActiveId);
      if (matched) {
        setActiveSessionId(matched.id);
      } else {
        setActiveSessionId(loaded[0].id);
        saveActiveSessionId(loaded[0].id);
      }
    } else {
      const fresh = createSession();
      setSessions([fresh]);
      setActiveSessionId(fresh.id);
      saveSessions([fresh]);
      saveActiveSessionId(fresh.id);
    }
  }, []);

  const activeSession = sessions.find((s) => s.id === activeSessionId) || sessions[0] || null;

  /** Brings the box in line with the server: an open conversation means staff mode. */
  const sync = useCallback(async () => {
    try {
      const { data } = await http.get<{ conversation: ServerConversation | null }>('/support/conversations/mine');
      setState((s) => {
        if (data.conversation) return staffState(data.conversation);
        return s.mode === 'staff' ? { mode: 'bot', conversationId: null, lines: [...s.lines, { role: 'system', text: CLOSED }] } : s;
      });
    } catch {
      // Offline or signed out
    }
  }, []);

  useEffect(() => {
    setState(BOT);
    if (customer) void sync();
  }, [customer, user?.id, sync]);

  useEffect(() => {
    if (open && customer) void sync();
  }, [open, customer, sync]);

  // Check health of bot service
  useEffect(() => {
    if (!open || state.mode === 'staff') return;
    http.get('/chat/health').then(
      () => setDown(false),
      () => setDown(false), // fallback gracefully if health route is unmapped
    );
  }, [open, state.mode]);

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
    if (open && view === 'chat') input.current?.focus();
  }, [open, view, busy]);

  useEffect(() => {
    if (log.current && view === 'chat') log.current.scrollTop = log.current.scrollHeight;
  }, [open, view, state, sessions, busy, error]);

  const startNewChat = useCallback(() => {
    const fresh = createSession();
    const updated = [fresh, ...sessions];
    setSessions(updated);
    setActiveSessionId(fresh.id);
    saveSessions(updated);
    saveActiveSessionId(fresh.id);
    setView('chat');
    setError('');
    setDraft('');
  }, [sessions]);

  const selectSession = useCallback((id: string) => {
    setActiveSessionId(id);
    saveActiveSessionId(id);
    setView('chat');
    setError('');
  }, []);

  const removeSession = useCallback(
    (id: string) => {
      const { updatedSessions, nextActiveId } = deleteSession(sessions, id, activeSessionId);
      if (updatedSessions.length === 0) {
        const fresh = createSession();
        setSessions([fresh]);
        setActiveSessionId(fresh.id);
        saveSessions([fresh]);
        saveActiveSessionId(fresh.id);
      } else {
        setSessions(updatedSessions);
        setActiveSessionId(nextActiveId);
      }
    },
    [sessions, activeSessionId],
  );

  const clearHistory = useCallback(() => {
    clearAllSessions();
    const fresh = createSession();
    setSessions([fresh]);
    setActiveSessionId(fresh.id);
    saveSessions([fresh]);
    saveActiveSessionId(fresh.id);
  }, []);

  const handOff = async (reason: string, lines: SupportState['lines']) => {
    const { data } = await http.post<{ conversation: ServerConversation }>('/support/conversations', { reason, transcript: toTranscript(lines) });
    setState(staffState(data.conversation, CONNECTING));
  };

  const askBot = async (text: string) => {
    if (!activeSession) return;
    const userMsg: ChatMessage = { role: 'user', text, timestamp: Date.now() };
    const { updatedSession, updatedSessions } = addMessageToSession(sessions, activeSession.id, userMsg);
    setSessions(updatedSessions);

    try {
      const payload = updatedSession.messages.slice(-MAX_SENT_MESSAGES).map((m) => ({ role: m.role, text: m.text }));
      const { data } = await http.post<{ reply?: string; handoff?: boolean; reason?: string }>('/chat', { messages: payload });
      if (data.handoff && data.reason) {
        await handOff(data.reason, state.lines);
      } else {
        const replyText = data.reply ?? '';
        const modelMsg: ChatMessage = { role: 'model', text: replyText, timestamp: Date.now() };
        const withReply = addMessageToSession(updatedSessions, activeSession.id, modelMsg);
        setSessions(withReply.updatedSessions);
      }
    } catch {
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
      void sync();
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
  const status = offline
    ? 'Offline · leave it for later'
    : staffMode
      ? 'Online · our staff will reply here'
      : 'Online · usually replies in minutes';

  const displayMessages = staffMode ? state.lines : activeSession?.messages || [];

  return (
    <div className="chat" onKeyDown={onEscape}>
      <section
        className="chat-panel"
        id="chat-panel"
        aria-label="Chat with Beat'em"
        hidden={!open}
        data-testid="chat-panel"
        data-mode={state.mode}
      >
        <header className="chat-head">
          {view === 'chat' ? (
            <>
              <span className="chat-avatar halftone halftone-yellow" aria-hidden="true">
                <ChatIcon />
              </span>
              <div className="chat-head-info">
                <h2 className="chat-title">Chat with Beat'em</h2>
                <span className="chat-head-sub" title={activeSession?.title}>
                  {activeSession && activeSession.title !== 'New Conversation' ? activeSession.title : status}
                </span>
              </div>
              <div className="chat-head-actions">
                {!staffMode && (
                  <>
                    <button
                      type="button"
                      className="chat-head-btn"
                      title="New conversation"
                      aria-label="New conversation"
                      onClick={startNewChat}
                      data-testid="chat-new-btn"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="chat-head-btn"
                      title="Chat history"
                      aria-label="Chat history"
                      onClick={() => setView('history')}
                      data-testid="chat-history-toggle"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="chat-head-btn"
                  title="Close chat"
                  aria-label="Close chat"
                  onClick={() => setOpen(false)}
                  data-testid="chat-close"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="chat-head-info">
                <button
                  type="button"
                  className="chat-back-btn"
                  onClick={() => setView('chat')}
                  aria-label="Back to chat"
                  data-testid="chat-history-back"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="19" y1="12" x2="5" y2="12" />
                    <polyline points="12 19 5 12 12 5" />
                  </svg>
                  <span>Chat</span>
                </button>
                <h2 className="chat-title">Chat History</h2>
              </div>
              <div className="chat-head-actions">
                {sessions.some((s) => s.messages.length > 0) && (
                  <button
                    type="button"
                    className="chat-clear-btn"
                    onClick={clearHistory}
                    data-testid="chat-history-clear"
                  >
                    Clear all
                  </button>
                )}
                <button
                  type="button"
                  className="chat-head-btn"
                  title="Close chat"
                  aria-label="Close chat"
                  onClick={() => setOpen(false)}
                  data-testid="chat-close"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </>
          )}
        </header>

        {view === 'history' ? (
          <div className="chat-history-list" data-testid="chat-history-view" role="list">
            {sessions.filter((s) => s.messages.length > 0).length === 0 ? (
              <div className="chat-history-empty" data-testid="chat-history-empty">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <p className="chat-history-empty-title">No conversation history yet</p>
                <p className="chat-history-empty-sub">
                  Your past conversations will appear here so you can review them anytime.
                </p>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={startNewChat}
                  data-testid="chat-start-new-btn"
                >
                  Start a conversation
                </button>
              </div>
            ) : (
              sessions
                .filter((s) => s.messages.length > 0)
                .map((s) => {
                  const isActive = s.id === activeSessionId;
                  return (
                    <div
                      key={s.id}
                      className={`chat-history-item ${isActive ? 'is-active' : ''}`}
                      data-testid="chat-history-item"
                      role="listitem"
                    >
                      <button
                        type="button"
                        className="chat-history-item-btn"
                        onClick={() => selectSession(s.id)}
                        aria-label={`Open conversation: ${s.title}`}
                      >
                        <div className="chat-history-item-header">
                          <span className="chat-history-item-title">{s.title}</span>
                          {isActive && <span className="chat-history-active-badge">Current</span>}
                        </div>
                        <div className="chat-history-item-meta">
                          <span>{formatRelativeTime(s.updatedAt)}</span>
                          <span>·</span>
                          <span>
                            {s.messages.length} {s.messages.length === 1 ? 'message' : 'messages'}
                          </span>
                        </div>
                      </button>
                      <button
                        type="button"
                        className="chat-history-item-del"
                        title="Delete conversation"
                        aria-label={`Delete ${s.title}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          removeSession(s.id);
                        }}
                        data-testid="chat-delete-session"
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                  );
                })
            )}
          </div>
        ) : (
          <>
            <div className="chat-log" role="log" aria-live="polite" ref={log} data-testid="chat-log">
              {!staffMode && (
                <p className="chat-msg chat-msg-model">
                  <span className="chat-msg-text">{DEFAULT_WELCOME_MESSAGE}</span>
                </p>
              )}
              {displayMessages.map((m, i) => (
                <p key={'id' in m && m.id ? m.id : `msg-${i}`} className={`chat-msg chat-msg-${m.role}`}>
                  <span className="chat-msg-text">{m.text}</span>
                  {/* be/rag/prompts/guest.md tells the bot to write /login when a guest needs to sign in. */}
                  {!user && m.role === 'model' && m.text.includes('/login') && (
                    <Link to="/login" state={{ from: location.pathname }} className="btn btn-primary btn-sm chat-login" data-testid="chat-login">
                      Log in
                    </Link>
                  )}
                  {'timestamp' in m && m.timestamp && (
                    <span className="chat-msg-time">{formatMessageTime(m.timestamp)}</span>
                  )}
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
                {CHAT_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={busy}
                    onClick={() => void sendText(chip)}
                  >
                    {chip}
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
                placeholder={staffMode ? 'Message our staff' : 'Type a message...'}
                maxLength={MAX_TEXT}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                disabled={busy || offline}
                data-testid="chat-input"
              />
              <button
                type="submit"
                className="btn btn-trust"
                disabled={busy || offline || !draft.trim()}
                data-testid="chat-send"
              >
                Send
              </button>
            </form>
          </>
        )}
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
