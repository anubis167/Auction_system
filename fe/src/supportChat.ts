/**
 * sch-1.7: the chat box's two modes. 'bot' talks to be/rag/chat.py (/api/chat); after a handoff (sch-1.3) 'staff'
 * talks to the Node support API (/api/support, sch-1.4) and live events from /api/me/events (sch-1.6).
 * Pure functions, so the rules are tested without a browser (e2e/unit/sch-1-7-support-chat.test.ts).
 */

/** user/model are the bot conversation (the shape /api/chat takes); staff replies and system notes are display only. */
export type ChatRole = 'user' | 'model' | 'staff' | 'system';
export interface ChatLine {
  role: ChatRole;
  text: string;
  /** Server message id in staff mode; drops the copy a live event brings of a message already shown. */
  id?: string;
}

export interface ServerMessage {
  id: number;
  sender: 'customer' | 'bot' | 'staff';
  text: string;
}
export interface ServerConversation {
  id: number;
  status: string;
  assignedStaff: { username: string } | null;
  messages: ServerMessage[];
}

export interface SupportState {
  mode: 'bot' | 'staff';
  conversationId: string | null;
  lines: ChatLine[];
}

export type SupportEvent =
  | { type: 'chat-message'; data: { conversationId: number; message: ServerMessage } }
  | { type: 'chat-claimed'; data: { conversationId: number; assignedStaff: { username: string } } }
  | { type: 'chat-closed'; data: { conversationId: number; reason: 'closed' | 'deleted' } };

/** Same limits as the APIs: /api/chat takes 20 turns, /api/support a 20-line transcript of <= 1000 chars each. */
export const MAX_TEXT = 1000;
const MAX_BOT_SENT = 19; // odd, so the history sent to the bot starts on a user message
const MAX_TRANSCRIPT = 20;

export const CONNECTING = 'Connecting you to our staff. Someone will reply here shortly.';
export const joined = (username: string) => `${username} from our staff joined the chat.`;
export const CLOSED = 'The chat with our staff has ended. You are talking to the assistant again.';

const botLines = (lines: ChatLine[]) => lines.filter((l) => l.role === 'user' || l.role === 'model');

/** The bot conversation to send to /api/chat (staff replies and notes left out). */
export const botHistory = (lines: ChatLine[]) => botLines(lines).slice(-MAX_BOT_SENT).map(({ role, text }) => ({ role, text }));

/** What staff get to read after a handoff: the latest bot turns, bot replies cut to the API limit. */
export const toTranscript = (lines: ChatLine[]) =>
  botLines(lines)
    .slice(-MAX_TRANSCRIPT)
    .map(({ role, text }) => ({ role, text: text.slice(0, MAX_TEXT) }));

export function fromServer(message: ServerMessage): ChatLine {
  const role: ChatRole = message.sender === 'customer' ? 'user' : message.sender === 'bot' ? 'model' : 'staff';
  return { role, text: message.text, id: String(message.id) };
}

/** The open conversation from GET /api/support/conversations/mine (on load, or right after a handoff). */
export function staffState(conversation: ServerConversation, note?: string): SupportState {
  const lines = conversation.messages.map(fromServer);
  if (note) lines.push({ role: 'system', text: note });
  if (conversation.assignedStaff) {
    // Just before the first staff reply (where it happened live), or last if they have not written yet.
    const at = lines.findIndex((l) => l.role === 'staff');
    lines.splice(at < 0 ? lines.length : at, 0, { role: 'system', text: joined(conversation.assignedStaff.username) });
  }
  return { mode: 'staff', conversationId: String(conversation.id), lines };
}

/** Adds a server message unless it is already shown (the sender's own message also arrives as an event). */
export function addMessage(state: SupportState, message: ServerMessage): SupportState {
  const line = fromServer(message);
  if (state.lines.some((l) => l.id === line.id)) return state;
  return { ...state, lines: [...state.lines, line] };
}

/** Applies a live event; events of any other conversation are ignored. */
export function applyEvent(state: SupportState, event: SupportEvent): SupportState {
  if (state.mode !== 'staff' || String(event.data.conversationId) !== state.conversationId) return state;
  switch (event.type) {
    case 'chat-message':
      return addMessage(state, event.data.message);
    case 'chat-claimed':
      return { ...state, lines: [...state.lines, { role: 'system', text: joined(event.data.assignedStaff.username) }] };
    case 'chat-closed':
      return { mode: 'bot', conversationId: null, lines: [...state.lines, { role: 'system', text: CLOSED }] };
  }
}
