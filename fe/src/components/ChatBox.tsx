import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { http } from '../api';
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
  MAX_TEXT_LENGTH,
  saveActiveSessionId,
  saveSessions,
  type ChatMessage,
  type ChatSession,
} from '../chatHistory';

export const QUICK_PROMPTS = [
  'How do I place a bid?',
  'How does credit work?',
  'What are the auction rules?',
] as const;

/**
 * chat-1.2 & chat-ui-1.2: embedded chat box widget with multi-session conversation history,
 * session switching, title auto-generation, history management, and persistent storage.
 */
export function ChatBox() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'chat' | 'history'>('chat');
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const toggle = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLDivElement>(null);

  // Initialize sessions and active conversation from storage on mount
  useEffect(() => {
    const loadedSessions = loadSessions();
    const storedActiveId = loadActiveSessionId();

    if (loadedSessions.length > 0) {
      setSessions(loadedSessions);
      const matched = loadedSessions.find((s) => s.id === storedActiveId);
      if (matched) {
        setActiveSessionId(matched.id);
      } else {
        setActiveSessionId(loadedSessions[0].id);
        saveActiveSessionId(loadedSessions[0].id);
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
  const messages = activeSession?.messages || [];

  useEffect(() => {
    if (open && view === 'chat') {
      input.current?.focus();
    }
  }, [open, view, busy]);

  useEffect(() => {
    if (log.current && view === 'chat') {
      log.current.scrollTop = log.current.scrollHeight;
    }
  }, [open, view, messages, busy, error]);

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

  const sendMessageText = async (text: string) => {
    if (!text || busy || !activeSession) return;

    const currentSessionId = activeSession.id;
    const userMsg: ChatMessage = {
      role: 'user',
      text,
      timestamp: Date.now(),
    };

    const { updatedSession, updatedSessions } = addMessageToSession(sessions, currentSessionId, userMsg);
    setSessions(updatedSessions);
    setDraft('');
    setError('');
    setBusy(true);

    try {
      const payloadMessages = updatedSession.messages.slice(-MAX_SENT_MESSAGES).map((m) => ({
        role: m.role,
        text: m.text,
      }));

      const { data } = await http.post<{ reply: string }>('/chat', { messages: payloadMessages });

      const modelMsg: ChatMessage = {
        role: 'model',
        text: data.reply,
        timestamp: Date.now(),
      };

      const withReply = addMessageToSession(updatedSessions, currentSessionId, modelMsg);
      setSessions(withReply.updatedSessions);
    } catch {
      setDraft(text);
      setError('The assistant is unavailable right now. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const send = (e: FormEvent) => {
    e.preventDefault();
    void sendMessageText(draft.trim());
  };

  const onEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && open) {
      setOpen(false);
      toggle.current?.focus();
    }
  };

  return (
    <div className="chat" onKeyDown={onEscape}>
      <section
        className="chat-panel"
        id="chat-panel"
        aria-label="Chat with Beat'em"
        hidden={!open}
        data-testid="chat-panel"
      >
        <header className="chat-head">
          {view === 'chat' ? (
            <>
              <div className="chat-head-info">
                <h2 className="chat-title">Chat with Beat'em</h2>
                <span className="chat-head-sub" title={activeSession?.title}>
                  {activeSession && activeSession.title !== 'New Conversation'
                    ? activeSession.title
                    : 'Online assistant'}
                </span>
              </div>
              <div className="chat-head-actions">
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
              <div className="chat-msg chat-msg-model">
                <p className="chat-msg-text">{DEFAULT_WELCOME_MESSAGE}</p>
              </div>
              {messages.map((m, i) => (
                <div key={i} className={`chat-msg chat-msg-${m.role}`}>
                  <p className="chat-msg-text">{m.text}</p>
                  {m.timestamp && (
                    <span className="chat-msg-time">{formatMessageTime(m.timestamp)}</span>
                  )}
                </div>
              ))}
              {busy && (
                <div className="chat-msg chat-msg-model">
                  <p className="chat-msg-text chat-typing">Typing…</p>
                </div>
              )}
            </div>

            {messages.length === 0 && (
              <div className="chat-chips" data-testid="chat-chips">
                {QUICK_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    className="chat-chip"
                    disabled={busy}
                    onClick={() => void sendMessageText(prompt)}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}

            {error && (
              <p className="chat-error" role="alert">
                {error}
              </p>
            )}

            <form className="chat-form" onSubmit={send}>
              <input
                ref={input}
                aria-label="Your message"
                placeholder="Type a message..."
                maxLength={MAX_TEXT_LENGTH}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                disabled={busy}
                data-testid="chat-input"
              />
              <button
                type="submit"
                className="btn btn-primary"
                disabled={busy || !draft.trim()}
                data-testid="chat-send"
              >
                Send
              </button>
            </form>
          </>
        )}
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
          <path
            fill="currentColor"
            d="M4 3h16a2 2 0 012 2v11a2 2 0 01-2 2H9l-5 4v-4a2 2 0 01-2-2V5a2 2 0 012-2z"
          />
        </svg>
      </button>
    </div>
  );
}
