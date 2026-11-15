import type http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../be/src/db';
import { staffListenerCount, userListenerCount } from '../../be/src/lib/events';
import { loginAs, resetDb } from '../../be/tests/helpers';
import { listen, loginCookie, subscribe, waitFor } from '../../be/tests/sse';

/**
 * sch-1.11: the whole staff-chat path through the API, both live streams open. The bot's side (it answers
 * {handoff: true, reason: 'limit'} to a signed-in customer) is e2e/py/sch_1_3_handoff_test.py; this starts from that
 * answer, as the ChatBox does (fe/src/components/ChatBox.tsx).
 */
describe('sch-1.11 full path: bot limit -> staff panel -> live answer -> close', () => {
  let server: http.Server;
  let port: number;
  const streams: ReturnType<typeof subscribe>[] = [];

  beforeAll(async () => {
    ({ server, port } = await listen());
    await resetDb();
  });
  afterAll(async () => {
    for (const s of streams) s.close();
    await new Promise((r) => server.close(r));
  });

  it('works end to end for a signed-in customer', async () => {
    const aliceId = (await prisma.user.findUniqueOrThrow({ where: { username: 'alice' } })).id;
    const staffId = (await prisma.user.findUniqueOrThrow({ where: { username: 'staff' } })).id;

    // Streams the browser pages keep open: the customer's (ChatBox) and the staff panel's two.
    const customerStream = subscribe(port, '/api/me/events', await loginCookie('alice'));
    const staffQueue = subscribe(port, '/api/staff/events', await loginCookie('staff'));
    const staffOwn = subscribe(port, '/api/me/events', await loginCookie('staff'));
    streams.push(customerStream, staffQueue, staffOwn);
    await Promise.all(streams.map((s) => s.ready));
    await waitFor(() => userListenerCount(aliceId) > 0 && userListenerCount(staffId) > 0 && staffListenerCount('chat') > 0);

    const alice = await loginAs('alice');
    const staff = await loginAs('staff');

    // 1. The bot answered {handoff: true, reason: 'limit'}; the ChatBox opens a conversation with the bot transcript.
    const opened = await alice.post('/api/support/conversations').send({
      reason: 'limit',
      transcript: [
        { role: 'user', text: 'Can I pay by bank transfer?' },
        { role: 'model', text: 'Let me check that.' },
        { role: 'user', text: 'Hello?' },
      ],
    });
    expect(opened.status).toBe(201);
    const id = opened.body.conversation.id;

    // 2. It appears in the staff panel's queue live.
    await waitFor(() => staffQueue.events.some((e) => e.event === 'chat-waiting' && e.data.id === id));
    const queue = (await staff.get('/api/staff/chats?status=waiting')).body.conversations;
    expect(queue.map((c: { id: number }) => c.id)).toContain(id);

    // 3. Staff claims and answers; the customer sees both live.
    expect((await staff.post(`/api/staff/chats/${id}/claim`)).status).toBe(200);
    expect((await staff.post(`/api/staff/chats/${id}/messages`).send({ text: 'Yes, bank transfer works.' })).status).toBe(201);
    await waitFor(() => customerStream.events.some((e) => e.event === 'chat-message' && e.data.message.text === 'Yes, bank transfer works.'));
    expect(customerStream.events.find((e) => e.event === 'chat-claimed')!.data.assignedStaff.username).toBe('staff');

    // 4. The customer replies; it reaches the staff member live.
    expect((await alice.post(`/api/support/conversations/${id}/messages`).send({ text: 'Great, thank you!' })).status).toBe(201);
    await waitFor(() => staffOwn.events.some((e) => e.event === 'chat-message' && e.data.message.text === 'Great, thank you!'));

    // 5. Staff closes; the customer is told and has no open conversation (the ChatBox goes back to the bot).
    expect((await staff.post(`/api/staff/chats/${id}/close`)).status).toBe(200);
    await waitFor(() => customerStream.events.some((e) => e.event === 'chat-closed'));
    expect((await alice.get('/api/support/conversations/mine')).body.conversation).toBeNull();

    // The whole conversation is kept for the record.
    const saved = await prisma.chatMessage.findMany({ where: { conversationId: BigInt(id) }, orderBy: { id: 'asc' } });
    expect(saved.map((m) => [m.sender, m.text])).toEqual([
      ['customer', 'Can I pay by bank transfer?'],
      ['bot', 'Let me check that.'],
      ['customer', 'Hello?'],
      ['staff', 'Yes, bank transfer works.'],
      ['customer', 'Great, thank you!'],
    ]);
  });
});
