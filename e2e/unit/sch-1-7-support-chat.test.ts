import { describe, expect, it } from 'vitest';
import {
  CLOSED,
  CONNECTING,
  addMessage,
  applyEvent,
  botHistory,
  joined,
  staffState,
  toTranscript,
  type ChatLine,
  type ServerConversation,
  type SupportState,
} from '../../fe/src/supportChat';

// sch-1.7: the ChatBox's bot <-> staff mode rules (fe/src/supportChat.ts).
const conversation = (over: Partial<ServerConversation> = {}): ServerConversation => ({
  id: 7,
  status: 'waiting',
  assignedStaff: null,
  messages: [
    { id: 1, sender: 'customer', text: 'Where is my parcel?' },
    { id: 2, sender: 'bot', text: 'Let me check.' },
  ],
  ...over,
});

describe('sch-1.7 support chat state', () => {
  it('bot history and transcript leave out staff replies and notes', () => {
    const lines: ChatLine[] = [
      { role: 'user', text: 'a' },
      { role: 'model', text: 'b'.repeat(1500) },
      { role: 'system', text: CLOSED },
      { role: 'staff', text: 'staff said' },
      { role: 'user', text: 'c' },
    ];
    expect(botHistory(lines).map((l) => l.role)).toEqual(['user', 'model', 'user']);
    const transcript = toTranscript(lines);
    expect(transcript.map((l) => l.role)).toEqual(['user', 'model', 'user']);
    expect(transcript[1].text).toHaveLength(1000); // the support API takes at most 1000 chars per line
    expect(transcript[0]).toEqual({ role: 'user', text: 'a' }); // no ids sent
  });

  it('caps what is sent: 19 bot turns, 20 transcript lines', () => {
    // Ends on the user's new message, as every real send does.
    const many: ChatLine[] = Array.from({ length: 31 }, (_, i) => ({ role: i % 2 ? 'model' : 'user', text: String(i) }));
    expect(botHistory(many)).toHaveLength(19);
    expect(botHistory(many)[0].role).toBe('user');
    expect(toTranscript(many)).toHaveLength(20);
    expect(toTranscript(many).at(-1)!.text).toBe('30');
  });

  it('a handoff opens staff mode with the server transcript and a connecting note', () => {
    const state = staffState(conversation(), CONNECTING);
    expect(state).toMatchObject({ mode: 'staff', conversationId: '7' });
    expect(state.lines.map((l) => [l.role, l.text])).toEqual([
      ['user', 'Where is my parcel?'],
      ['model', 'Let me check.'],
      ['system', CONNECTING],
    ]);
  });

  it('a reload restores the conversation, with who joined', () => {
    const messages = [
      { id: 1, sender: 'customer' as const, text: 'Help' },
      { id: 3, sender: 'staff' as const, text: 'Hi' },
      { id: 4, sender: 'customer' as const, text: 'Thanks' },
    ];
    const state = staffState(conversation({ status: 'assigned', assignedStaff: { username: 'sam' }, messages }));
    expect(state.lines.map((l) => [l.role, l.text])).toEqual([
      ['user', 'Help'],
      ['system', joined('sam')],
      ['staff', 'Hi'],
      ['user', 'Thanks'],
    ]);
    // Claimed but no reply yet: the note comes last.
    expect(staffState(conversation({ status: 'assigned', assignedStaff: { username: 'sam' } })).lines.at(-1)).toEqual({ role: 'system', text: joined('sam') });
  });

  it('live events: claim, staff reply, duplicate dropped, close back to the bot', () => {
    let state = staffState(conversation());
    state = applyEvent(state, { type: 'chat-claimed', data: { conversationId: 7, assignedStaff: { username: 'sam' } } });
    expect(state.lines.at(-1)).toEqual({ role: 'system', text: joined('sam') });

    const reply = { id: 10, sender: 'staff' as const, text: 'Hello, I can help.' };
    state = applyEvent(state, { type: 'chat-message', data: { conversationId: 7, message: reply } });
    expect(state.lines.at(-1)).toEqual({ role: 'staff', text: 'Hello, I can help.', id: '10' });
    const length = state.lines.length;
    state = applyEvent(state, { type: 'chat-message', data: { conversationId: 7, message: reply } });
    expect(state.lines).toHaveLength(length);

    // The customer's own message: shown from the POST response, then its event copy is dropped.
    const own = { id: 11, sender: 'customer' as const, text: 'Thanks' };
    state = addMessage(state, own);
    state = applyEvent(state, { type: 'chat-message', data: { conversationId: 7, message: own } });
    expect(state.lines.filter((l) => l.id === '11')).toHaveLength(1);

    state = applyEvent(state, { type: 'chat-closed', data: { conversationId: 7, reason: 'closed' } });
    expect(state.mode).toBe('bot');
    expect(state.conversationId).toBeNull();
    expect(state.lines.at(-1)).toEqual({ role: 'system', text: CLOSED });
    // Back with the bot: the earlier lines stay on screen, but only user/model turns go to /api/chat.
    expect(botHistory(state.lines).every((l) => l.role === 'user' || l.role === 'model')).toBe(true);
  });

  it('ignores events of other conversations and events while talking to the bot', () => {
    const state = staffState(conversation());
    expect(applyEvent(state, { type: 'chat-closed', data: { conversationId: 8, reason: 'closed' } })).toBe(state);
    const bot: SupportState = { mode: 'bot', conversationId: null, lines: [] };
    expect(applyEvent(bot, { type: 'chat-message', data: { conversationId: 7, message: { id: 1, sender: 'staff', text: 'x' } } })).toBe(bot);
  });
});
