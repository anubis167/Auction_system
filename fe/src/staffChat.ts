/**
 * sch-1.8: state rules of the staff chat panel (/staff/chats), kept pure so they are tested without a browser
 * (e2e/unit/sch-1-8-staff-chat.test.ts). The page feeds it the lists from /api/staff/chats and the live events of
 * sch-1.6: the queue from /api/staff/events, its own conversations' messages from /api/me/events.
 */
import type { ServerMessage } from './supportChat';

export interface ChatSummary {
  id: number;
  status: 'waiting' | 'assigned' | 'closed';
  handoffReason: string;
  createdAt: string;
  customer: { id: number; username: string };
  assignedStaff: { id: number; username: string } | null;
  lastMessage: ServerMessage | null;
}

export interface PanelState {
  waiting: ChatSummary[];
  mine: ChatSummary[];
  /** Loaded threads by conversation id; `closed` once it ended while open on screen. */
  threads: Record<number, { messages: ServerMessage[]; closed: boolean }>;
  /** Customer messages not yet seen, per conversation (sch-1.5 moved unread counts here). */
  unread: Record<number, number>;
  selected: number | null;
}

export type StaffChatEvent =
  | { type: 'chat-waiting'; data: Omit<ChatSummary, 'status' | 'assignedStaff'> }
  | { type: 'chat-message'; data: { conversationId: number; message: ServerMessage } }
  | { type: 'chat-claimed'; data: { conversationId: number; assignedStaff: { id: number; username: string } } }
  | { type: 'chat-closed'; data: { conversationId: number; reason: 'closed' | 'deleted' } };

export const emptyPanel: PanelState = { waiting: [], mine: [], threads: {}, unread: {}, selected: null };

export const REASON_LABEL: Record<string, string> = { limit: 'Bot limit reached', unavailable: 'Bot unavailable' };

/** Fresh lists from the API (on load and after a dropped stream comes back); threads and unread counts stay. */
export const listsLoaded = (state: PanelState, waiting: ChatSummary[], mine: ChatSummary[]): PanelState => ({ ...state, waiting, mine });

export function threadLoaded(state: PanelState, id: number, messages: ServerMessage[], status: string): PanelState {
  return { ...state, threads: { ...state.threads, [id]: { messages, closed: status === 'closed' } } };
}

export const select = (state: PanelState, id: number | null): PanelState =>
  ({ ...state, selected: id, unread: id == null ? state.unread : { ...state.unread, [id]: 0 } });

const without = (list: ChatSummary[], id: number) => list.filter((c) => c.id !== id);
const touch = (list: ChatSummary[], id: number, message: ServerMessage) => list.map((c) => (c.id === id ? { ...c, lastMessage: message } : c));

/** Adds a message to its loaded thread unless already there (the sender also gets their own message as an event). */
export function addThreadMessage(state: PanelState, id: number, message: ServerMessage): PanelState {
  const thread = state.threads[id];
  if (!thread || thread.messages.some((m) => m.id === message.id)) return state;
  return { ...state, threads: { ...state.threads, [id]: { ...thread, messages: [...thread.messages, message] } } };
}

export function applyStaffEvent(state: PanelState, event: StaffChatEvent, me: number): PanelState {
  switch (event.type) {
    case 'chat-waiting': {
      if (state.waiting.some((c) => c.id === event.data.id)) return state;
      return { ...state, waiting: [...state.waiting, { ...event.data, status: 'waiting', assignedStaff: null }] };
    }
    case 'chat-claimed': {
      const { conversationId: id, assignedStaff } = event.data;
      const claimed = state.waiting.find((c) => c.id === id);
      const mine =
        assignedStaff.id === me && claimed && !state.mine.some((c) => c.id === id)
          ? [{ ...claimed, status: 'assigned' as const, assignedStaff }, ...state.mine]
          : state.mine;
      return { ...state, waiting: without(state.waiting, id), mine };
    }
    case 'chat-message': {
      const { conversationId: id, message } = event.data;
      const known = state.threads[id]?.messages.some((m) => m.id === message.id);
      let next = addThreadMessage({ ...state, waiting: touch(state.waiting, id, message), mine: touch(state.mine, id, message) }, id, message);
      if (!known && message.sender === 'customer' && state.selected !== id) {
        next = { ...next, unread: { ...next.unread, [id]: (next.unread[id] ?? 0) + 1 } };
      }
      return next;
    }
    case 'chat-closed': {
      const id = event.data.conversationId;
      const thread = state.threads[id];
      return {
        ...state,
        waiting: without(state.waiting, id),
        mine: without(state.mine, id),
        threads: thread ? { ...state.threads, [id]: { ...thread, closed: true } } : state.threads,
      };
    }
  }
}
