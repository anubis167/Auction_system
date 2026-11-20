import { beforeEach, describe, expect, it } from 'vitest';
import {
  addMessageToSession,
  clearAllSessions,
  createSession,
  deleteSession,
  deriveTitle,
  formatMessageTime,
  formatRelativeTime,
  loadActiveSessionId,
  loadSessions,
  saveActiveSessionId,
  saveSessions,
  STORAGE_ACTIVE_ID_KEY,
  STORAGE_SESSIONS_KEY,
  type ChatMessage,
  type ChatSession,
} from './chatHistory';

const storageMap = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => storageMap.get(key) ?? null,
  setItem: (key: string, value: string) => {
    storageMap.set(key, String(value));
  },
  removeItem: (key: string) => {
    storageMap.delete(key);
  },
  clear: () => {
    storageMap.clear();
  },
  get length() {
    return storageMap.size;
  },
  key: (i: number) => Array.from(storageMap.keys())[i] ?? null,
};

if (typeof globalThis.localStorage === 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', {
    value: localStorageMock,
    writable: true,
  });
}

describe('chatHistory session management and persistence', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  describe('deriveTitle', () => {
    it('returns "New Conversation" when no user message exists', () => {
      expect(deriveTitle([])).toBe('New Conversation');
      expect(deriveTitle([{ role: 'model', text: 'Hello', timestamp: 1000 }])).toBe('New Conversation');
    });

    it('derives clean title from first user message', () => {
      const messages: ChatMessage[] = [
        { role: 'model', text: 'Hello', timestamp: 1000 },
        { role: 'user', text: 'How do I place a bid?', timestamp: 2000 },
      ];
      expect(deriveTitle(messages)).toBe('How do I place a bid?');
    });

    it('truncates titles longer than 30 characters with an ellipsis', () => {
      const messages: ChatMessage[] = [
        { role: 'user', text: 'What are the complete terms and conditions for returning an item?', timestamp: 1000 },
      ];
      const title = deriveTitle(messages);
      expect(title.length).toBeLessThanOrEqual(31);
      expect(title.endsWith('…')).toBe(true);
      expect(title.startsWith('What are the complete terms')).toBe(true);
    });

    it('collapses multiple whitespace characters in user message', () => {
      const messages: ChatMessage[] = [
        { role: 'user', text: 'How   much   credit    do I have?', timestamp: 1000 },
      ];
      expect(deriveTitle(messages)).toBe('How much credit do I have?');
    });
  });

  describe('createSession', () => {
    it('generates a session with unique ID, default title, and empty messages', () => {
      const s1 = createSession();
      const s2 = createSession('Custom Title');

      expect(s1.id).toMatch(/^session_\d+_[a-z0-9]+$/);
      expect(s1.title).toBe('New Conversation');
      expect(s1.messages).toEqual([]);
      expect(s1.createdAt).toBeGreaterThan(0);
      expect(s1.updatedAt).toBe(s1.createdAt);

      expect(s2.title).toBe('Custom Title');
      expect(s1.id).not.toBe(s2.id);
    });
  });

  describe('loadSessions and saveSessions', () => {
    it('returns empty array when no sessions are stored or stored value is corrupted', () => {
      expect(loadSessions()).toEqual([]);

      localStorage.setItem(STORAGE_SESSIONS_KEY, 'invalid-json');
      expect(loadSessions()).toEqual([]);

      localStorage.setItem(STORAGE_SESSIONS_KEY, '{"not": "an array"}');
      expect(loadSessions()).toEqual([]);
    });

    it('saves and loads sessions successfully, sorted by updatedAt descending', () => {
      const sessionA: ChatSession = {
        id: 's-1',
        title: 'Older Session',
        createdAt: 1000,
        updatedAt: 2000,
        messages: [{ role: 'user', text: 'Old question', timestamp: 2000 }],
      };
      const sessionB: ChatSession = {
        id: 's-2',
        title: 'Newer Session',
        createdAt: 3000,
        updatedAt: 5000,
        messages: [{ role: 'user', text: 'New question', timestamp: 5000 }],
      };

      saveSessions([sessionA, sessionB]);
      const loaded = loadSessions();
      expect(loaded).toHaveLength(2);
      expect(loaded[0].id).toBe('s-2');
      expect(loaded[1].id).toBe('s-1');
    });
  });

  describe('active session tracking', () => {
    it('saves and loads active session ID', () => {
      expect(loadActiveSessionId()).toBeNull();

      saveActiveSessionId('session-xyz');
      expect(loadActiveSessionId()).toBe('session-xyz');

      saveActiveSessionId(null);
      expect(loadActiveSessionId()).toBeNull();
    });
  });

  describe('addMessageToSession', () => {
    it('appends message, updates timestamp, updates title from initial "New Conversation", and saves to storage', () => {
      const session = createSession();
      const initialSessions = [session];

      const { updatedSession, updatedSessions } = addMessageToSession(initialSessions, session.id, {
        role: 'user',
        text: 'Where are my winning bids?',
        timestamp: 10000,
      });

      expect(updatedSession.messages).toHaveLength(1);
      expect(updatedSession.messages[0].text).toBe('Where are my winning bids?');
      expect(updatedSession.title).toBe('Where are my winning bids?');
      expect(updatedSession.updatedAt).toBe(10000);
      expect(updatedSessions[0].id).toBe(session.id);

      // Add model reply
      const { updatedSession: withReply } = addMessageToSession(updatedSessions, session.id, {
        role: 'model',
        text: 'You can check your biddings on the My Biddings page.',
        timestamp: 12000,
      });

      expect(withReply.messages).toHaveLength(2);
      expect(withReply.title).toBe('Where are my winning bids?'); // Title preserved
      expect(withReply.updatedAt).toBe(12000);

      // Verify persisted in localStorage
      const reloaded = loadSessions();
      expect(reloaded[0].messages).toHaveLength(2);
    });

    it('creates a new session if the session ID does not exist in the list', () => {
      const { updatedSession, updatedSessions } = addMessageToSession([], 'new-id', {
        role: 'user',
        text: 'Hello assistant',
        timestamp: 5000,
      });

      expect(updatedSession.id).toBe('new-id');
      expect(updatedSession.title).toBe('Hello assistant');
      expect(updatedSessions).toHaveLength(1);
    });
  });

  describe('deleteSession', () => {
    it('removes the session from the list and storage', () => {
      const s1: ChatSession = { id: 's1', title: 'Session 1', createdAt: 1, updatedAt: 1, messages: [] };
      const s2: ChatSession = { id: 's2', title: 'Session 2', createdAt: 2, updatedAt: 2, messages: [] };

      const { updatedSessions, nextActiveId } = deleteSession([s1, s2], 's1', 's2');
      expect(updatedSessions).toHaveLength(1);
      expect(updatedSessions[0].id).toBe('s2');
      expect(nextActiveId).toBe('s2');
      expect(loadSessions()).toHaveLength(1);
    });

    it('switches nextActiveId to another remaining session if the active session is deleted', () => {
      const s1: ChatSession = { id: 's1', title: 'Session 1', createdAt: 1, updatedAt: 1, messages: [] };
      const s2: ChatSession = { id: 's2', title: 'Session 2', createdAt: 2, updatedAt: 2, messages: [] };

      const { updatedSessions, nextActiveId } = deleteSession([s1, s2], 's1', 's1');
      expect(updatedSessions).toHaveLength(1);
      expect(nextActiveId).toBe('s2');
      expect(loadActiveSessionId()).toBe('s2');
    });

    it('sets nextActiveId to null if the last session is deleted', () => {
      const s1: ChatSession = { id: 's1', title: 'Session 1', createdAt: 1, updatedAt: 1, messages: [] };

      const { updatedSessions, nextActiveId } = deleteSession([s1], 's1', 's1');
      expect(updatedSessions).toHaveLength(0);
      expect(nextActiveId).toBeNull();
      expect(loadActiveSessionId()).toBeNull();
    });
  });

  describe('clearAllSessions', () => {
    it('removes both sessions and active ID from localStorage', () => {
      saveSessions([createSession()]);
      saveActiveSessionId('some-id');

      clearAllSessions();
      expect(loadSessions()).toEqual([]);
      expect(loadActiveSessionId()).toBeNull();
    });
  });

  describe('formatRelativeTime', () => {
    const base = 1_700_000_000_000;

    it('formats seconds as "Just now"', () => {
      expect(formatRelativeTime(base - 10_000, base)).toBe('Just now');
      expect(formatRelativeTime(base - 59_000, base)).toBe('Just now');
    });

    it('formats minutes as "Xm ago"', () => {
      expect(formatRelativeTime(base - 60_000, base)).toBe('1m ago');
      expect(formatRelativeTime(base - 15 * 60_000, base)).toBe('15m ago');
      expect(formatRelativeTime(base - 59 * 60_000, base)).toBe('59m ago');
    });

    it('formats hours as "Xh ago"', () => {
      expect(formatRelativeTime(base - 60 * 60_000, base)).toBe('1h ago');
      expect(formatRelativeTime(base - 23 * 60 * 60_000, base)).toBe('23h ago');
    });

    it('formats 24-48 hours as "Yesterday"', () => {
      expect(formatRelativeTime(base - 25 * 60 * 60_000, base)).toBe('Yesterday');
    });

    it('formats 2-6 days as "Xd ago"', () => {
      expect(formatRelativeTime(base - 3 * 24 * 60 * 60_000, base)).toBe('3d ago');
    });

    it('formats older timestamps as readable date', () => {
      const oldTime = base - 30 * 24 * 60 * 60_000;
      const formatted = formatRelativeTime(oldTime, base);
      expect(formatted).toMatch(/[A-Za-z]+ \d+/);
    });
  });

  describe('formatMessageTime', () => {
    it('formats timestamp into clock time', () => {
      const time = new Date('2026-11-20T10:30:00Z').getTime();
      const str = formatMessageTime(time);
      expect(str).toBeTruthy();
      expect(str.length).toBeGreaterThanOrEqual(4);
    });
  });
});
