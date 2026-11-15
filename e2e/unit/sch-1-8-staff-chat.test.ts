import { describe, expect, it } from 'vitest';
import { applyStaffEvent, emptyPanel, listsLoaded, select, threadLoaded, type ChatSummary, type PanelState } from '../../fe/src/staffChat';

// sch-1.8: the staff chat panel's state rules (fe/src/staffChat.ts).
const ME = 5;
const summary = (id: number, username: string): ChatSummary => ({
  id,
  status: 'waiting',
  handoffReason: 'limit',
  createdAt: '2026-11-15T00:00:00Z',
  customer: { id: 100 + id, username },
  assignedStaff: null,
  lastMessage: { id: id * 10, sender: 'customer', text: `${username} asks` },
});
const msg = (id: number, sender: 'customer' | 'staff' | 'bot', text: string) => ({ id, sender, text });

describe('sch-1.8 staff chat panel state', () => {
  it('new handoffs join the waiting list once, in arrival order', () => {
    let s = applyStaffEvent(emptyPanel, { type: 'chat-waiting', data: summary(1, 'alice') }, ME);
    s = applyStaffEvent(s, { type: 'chat-waiting', data: summary(2, 'bob') }, ME);
    s = applyStaffEvent(s, { type: 'chat-waiting', data: summary(1, 'alice') }, ME);
    expect(s.waiting.map((c) => c.customer.username)).toEqual(['alice', 'bob']);
  });

  it('a claim by me moves it to Mine; a claim by someone else just drops it', () => {
    let s = listsLoaded(emptyPanel, [summary(1, 'alice'), summary(2, 'bob')], []);
    s = applyStaffEvent(s, { type: 'chat-claimed', data: { conversationId: 1, assignedStaff: { id: ME, username: 'me' } } }, ME);
    s = applyStaffEvent(s, { type: 'chat-claimed', data: { conversationId: 2, assignedStaff: { id: 9, username: 'other' } } }, ME);
    expect(s.waiting).toEqual([]);
    expect(s.mine.map((c) => [c.id, c.status, c.assignedStaff?.username])).toEqual([[1, 'assigned', 'me']]);
  });

  it('many conversations at once: messages land in the right thread; unread counts only for threads not on screen', () => {
    let s: PanelState = listsLoaded(emptyPanel, [], [{ ...summary(1, 'alice'), status: 'assigned' }, { ...summary(2, 'bob'), status: 'assigned' }]);
    s = threadLoaded(s, 1, [msg(10, 'customer', 'alice asks')], 'assigned');
    s = threadLoaded(s, 2, [msg(20, 'customer', 'bob asks')], 'assigned');
    s = select(s, 1);

    s = applyStaffEvent(s, { type: 'chat-message', data: { conversationId: 1, message: msg(11, 'customer', 'alice again') } }, ME);
    s = applyStaffEvent(s, { type: 'chat-message', data: { conversationId: 2, message: msg(21, 'customer', 'bob again') } }, ME);
    s = applyStaffEvent(s, { type: 'chat-message', data: { conversationId: 2, message: msg(22, 'customer', 'bob 3') } }, ME);
    s = applyStaffEvent(s, { type: 'chat-message', data: { conversationId: 2, message: msg(22, 'customer', 'bob 3') } }, ME); // duplicate
    s = applyStaffEvent(s, { type: 'chat-message', data: { conversationId: 2, message: msg(23, 'staff', 'my reply from another tab') } }, ME);

    expect(s.threads[1].messages.map((m) => m.text)).toEqual(['alice asks', 'alice again']);
    expect(s.threads[2].messages.map((m) => m.text)).toEqual(['bob asks', 'bob again', 'bob 3', 'my reply from another tab']);
    expect(s.unread).toEqual({ 1: 0, 2: 2 }); // own (staff) messages never count
    expect(s.mine.find((c) => c.id === 2)!.lastMessage!.text).toBe('my reply from another tab');

    s = select(s, 2);
    expect(s.unread[2]).toBe(0);
  });

  it('messages of a thread not loaded yet still update the preview and the unread count', () => {
    let s = listsLoaded(emptyPanel, [summary(3, 'carol')], []);
    s = applyStaffEvent(s, { type: 'chat-message', data: { conversationId: 3, message: msg(31, 'customer', 'hello?') } }, ME);
    expect(s.waiting[0].lastMessage!.text).toBe('hello?');
    expect(s.unread[3]).toBe(1);
    expect(s.threads[3]).toBeUndefined();
  });

  it('closed or deleted conversations leave both lists; an open thread is marked closed', () => {
    let s = listsLoaded(emptyPanel, [summary(1, 'alice')], [{ ...summary(2, 'bob'), status: 'assigned' }]);
    s = threadLoaded(s, 2, [], 'assigned');
    s = applyStaffEvent(s, { type: 'chat-closed', data: { conversationId: 1, reason: 'deleted' } }, ME);
    s = applyStaffEvent(s, { type: 'chat-closed', data: { conversationId: 2, reason: 'closed' } }, ME);
    expect(s.waiting).toEqual([]);
    expect(s.mine).toEqual([]);
    expect(s.threads[2].closed).toBe(true);
  });

  it('reloaded lists keep threads, unread counts and the selection', () => {
    let s = threadLoaded(select(emptyPanel, 1), 1, [msg(1, 'customer', 'x')], 'assigned');
    s = { ...s, unread: { 2: 3 } };
    s = listsLoaded(s, [summary(2, 'bob')], []);
    expect(s.selected).toBe(1);
    expect(s.threads[1].messages).toHaveLength(1);
    expect(s.unread[2]).toBe(3);
  });
});
