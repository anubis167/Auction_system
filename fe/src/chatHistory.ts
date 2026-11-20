export type ChatRole = 'user' | 'model';

export interface ChatMessage {
  role: ChatRole;
  text: string;
  timestamp?: number;
}

export interface ChatSession {
  id: string;
  /** rag-train-2: random visitor token sent with each /api/chat call; the server stores only its sha256 */
  token: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

export const STORAGE_SESSIONS_KEY = 'beat_em_chat_sessions';
export const STORAGE_ACTIVE_ID_KEY = 'beat_em_active_chat_session_id';
export const DEFAULT_WELCOME_MESSAGE = 'Hi! How can we help you today?';
export const MAX_SENT_MESSAGES = 19;
export const MAX_TEXT_LENGTH = 1000;

/**
 * Derives a concise, human-friendly title for a conversation from the first user message.
 */
export function deriveTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user' && m.text.trim().length > 0);
  if (!firstUser) return 'New Conversation';
  const clean = firstUser.text.trim().replace(/\s+/g, ' ');
  return clean.length > 30 ? `${clean.slice(0, 30)}…` : clean;
}

/** 32 random bytes as hex; getRandomValues also works on plain-http hosts, unlike randomUUID. */
export function newVisitorToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Creates a brand new chat session with default metadata.
 */
export function createSession(title?: string): ChatSession {
  const now = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  return {
    id: `session_${now}_${randomSuffix}`,
    token: newVisitorToken(),
    title: title || 'New Conversation',
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
}

function getStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
    if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
      return globalThis.localStorage;
    }
  } catch {
    // Ignore access errors
  }
  return null;
}

/**
 * Loads all saved conversation sessions from localStorage, sorted newest first.
 */
export function loadSessions(): ChatSession[] {
  try {
    const storage = getStorage();
    const raw = storage ? storage.getItem(STORAGE_SESSIONS_KEY) : null;
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as ChatSession[])
      .filter((s) => s && typeof s.id === 'string' && Array.isArray(s.messages))
      .map((s) => (typeof s.token === 'string' && s.token ? s : { ...s, token: newVisitorToken() })) // saved before rag-train-2
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

/**
 * Saves conversation sessions to localStorage safely.
 */
export function saveSessions(sessions: ChatSession[]): void {
  try {
    const storage = getStorage();
    if (storage) {
      storage.setItem(STORAGE_SESSIONS_KEY, JSON.stringify(sessions));
    }
  } catch {
    // Gracefully handle storage errors or quota limits
  }
}

/**
 * Loads the currently active session ID from localStorage.
 */
export function loadActiveSessionId(): string | null {
  try {
    const storage = getStorage();
    return storage ? storage.getItem(STORAGE_ACTIVE_ID_KEY) : null;
  } catch {
    return null;
  }
}

/**
 * Saves the active session ID to localStorage.
 */
export function saveActiveSessionId(id: string | null): void {
  try {
    const storage = getStorage();
    if (storage) {
      if (id) {
        storage.setItem(STORAGE_ACTIVE_ID_KEY, id);
      } else {
        storage.removeItem(STORAGE_ACTIVE_ID_KEY);
      }
    }
  } catch {
    // Ignore storage errors
  }
}

/**
 * Appends a message to a specific session and automatically updates session title and updatedAt.
 */
export function addMessageToSession(
  sessions: ChatSession[],
  sessionId: string,
  message: ChatMessage,
): { updatedSession: ChatSession; updatedSessions: ChatSession[] } {
  const now = message.timestamp || Date.now();
  const normalizedMsg: ChatMessage = { ...message, timestamp: now };

  let targetIndex = sessions.findIndex((s) => s.id === sessionId);
  let session: ChatSession;

  if (targetIndex >= 0) {
    const existing = sessions[targetIndex];
    const newMessages = [...existing.messages, normalizedMsg];
    session = {
      ...existing,
      updatedAt: now,
      messages: newMessages,
      title: existing.title === 'New Conversation' ? deriveTitle(newMessages) : existing.title,
    };
  } else {
    session = {
      id: sessionId,
      token: newVisitorToken(),
      title: deriveTitle([normalizedMsg]),
      createdAt: now,
      updatedAt: now,
      messages: [normalizedMsg],
    };
  }

  const updatedSessions = [
    session,
    ...sessions.filter((s) => s.id !== sessionId),
  ].sort((a, b) => b.updatedAt - a.updatedAt);

  saveSessions(updatedSessions);
  return { updatedSession: session, updatedSessions };
}

/**
 * Deletes a session and returns the remaining sessions plus the fallback active ID.
 */
export function deleteSession(
  sessions: ChatSession[],
  sessionIdToDelete: string,
  currentActiveId: string | null,
): { updatedSessions: ChatSession[]; nextActiveId: string | null } {
  const updatedSessions = sessions.filter((s) => s.id !== sessionIdToDelete);
  saveSessions(updatedSessions);

  let nextActiveId = currentActiveId;
  if (currentActiveId === sessionIdToDelete) {
    nextActiveId = updatedSessions.length > 0 ? updatedSessions[0].id : null;
    saveActiveSessionId(nextActiveId);
  }

  return { updatedSessions, nextActiveId };
}

/**
 * Clears all sessions and active ID from localStorage.
 */
export function clearAllSessions(): void {
  try {
    const storage = getStorage();
    if (storage) {
      storage.removeItem(STORAGE_SESSIONS_KEY);
      storage.removeItem(STORAGE_ACTIVE_ID_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

/**
 * Formats a timestamp into a human-readable relative time string.
 */
export function formatRelativeTime(timestamp: number, now = Date.now()): string {
  const diffSec = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDays = Math.floor(diffHour / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;

  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Formats a timestamp into short clock time (e.g. "10:30 AM" or "14:45").
 */
export function formatMessageTime(timestamp: number): string {
  try {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}
