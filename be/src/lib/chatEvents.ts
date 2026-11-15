import { publishStaffEvent, publishUserEvent, type StreamEvent } from './events';

/**
 * sch-1.6 (SRS Req-1: the chat panel serves many customers in real time). Who hears what:
 * - staff channel 'chat' (every stream with chat.handle): the queue. New conversations, claims, closes, and the
 *   messages of conversations that are still waiting (any staff member may pick them up).
 * - user channels: once a conversation is assigned, its messages go only to its customer and its staff member.
 *   The customer always hears about their own conversation (messages, claim, close), never anyone else's.
 * Callers publish after the db write, so a refused request publishes nothing. See docs/realtime.md.
 */

interface Conversation {
  id: bigint;
  status: string;
  customerId: bigint;
  assignedStaffId: bigint | null;
}

const event = (type: string, id: string, data: unknown): StreamEvent => ({ type, id, data });

/** A conversation entered the queue (sch-1.4 handoff). */
export function publishChatWaiting(summary: { id: bigint; customer: { id: bigint; username: string }; handoffReason: string; createdAt: Date }, lastMessage: unknown) {
  publishStaffEvent('chat', event('chat-waiting', `chat-${summary.id}-waiting`, { ...summary, lastMessage }));
}

export function publishChatMessages(conversation: Conversation, messages: { id: bigint }[]) {
  for (const message of messages) {
    const ev = event('chat-message', `chat-msg-${message.id}`, { conversationId: conversation.id, message });
    publishUserEvent(conversation.customerId, ev);
    if (conversation.status === 'waiting') publishStaffEvent('chat', ev);
    else if (conversation.assignedStaffId) publishUserEvent(conversation.assignedStaffId, ev);
  }
}

export function publishChatClaimed(conversation: Conversation, staff: { id: bigint; username: string }) {
  const ev = event('chat-claimed', `chat-${conversation.id}-claimed`, { conversationId: conversation.id, assignedStaff: staff });
  publishStaffEvent('chat', ev);
  publishUserEvent(conversation.customerId, ev);
}

/** Closed or (admin) deleted: gone from every staff list; the customer's box goes back to the bot. */
export function publishChatClosed(conversation: Conversation, reason: 'closed' | 'deleted') {
  const ev = event('chat-closed', `chat-${conversation.id}-${reason}`, { conversationId: conversation.id, reason });
  publishStaffEvent('chat', ev);
  publishUserEvent(conversation.customerId, ev);
}
