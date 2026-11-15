import type http from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../be/src/db';
import { staffListenerCount, userListenerCount } from '../../be/src/lib/events';
import { loginAs, resetDb } from '../../be/tests/helpers';
import { listen, loginCookie, settle, subscribe, waitFor, type SseEvent } from '../../be/tests/sse';

// sch-1.6 (Req-1): chat events reach the right staff and customers live, and nobody else.
type Sub = ReturnType<typeof subscribe>;
const names = (sub: Sub) => sub.events.map((e) => e.event);
const of = (sub: Sub, type: string) => sub.events.filter((e) => e.event === type);
const texts = (events: SseEvent[]) => events.map((e) => e.data.message.text);

describe('sch-1.6 realtime chat events', () => {
  let server: http.Server;
  let port: number;
  const subs: Sub[] = [];
  const idOf = async (username: string) => (await prisma.user.findUniqueOrThrow({ where: { username } })).id;

  /** Customer stream (/api/me/events), waiting until the server listens. */
  const userStream = async (username: string) => {
    const id = await idOf(username);
    const before = userListenerCount(id);
    const sub = subscribe(port, '/api/me/events', await loginCookie(username));
    expect((await sub.ready).status).toBe(200);
    await waitFor(() => userListenerCount(id) > before);
    subs.push(sub);
    return sub;
  };
  /** Staff open both streams, as the panel will: the queue and their own user channel. */
  const staffStreams = async (username: string) => {
    const before = staffListenerCount('chat');
    const queue = subscribe(port, '/api/staff/events', await loginCookie(username));
    expect((await queue.ready).status).toBe(200);
    await waitFor(() => staffListenerCount('chat') > before);
    subs.push(queue);
    return { queue, own: await userStream(username) };
  };

  beforeAll(async () => {
    ({ server, port } = await listen());
    await resetDb();
    const seeded = await prisma.user.findUniqueOrThrow({ where: { username: 'staff' } });
    await prisma.user.create({ data: { username: 'staff2', email: 'staff2@example.com', passwordHash: seeded.passwordHash, role: 'staff', emailVerifiedAt: new Date() } });
  });
  afterAll(async () => {
    for (const sub of subs) sub.close();
    await new Promise((r) => server.close(r));
  });

  it('customers get no staff queue stream', async () => {
    const alice = await loginAs('alice');
    expect((await alice.get('/api/staff/events')).status).toBe(403);
  });

  it('full sequence with two customers and two staff: each hears only what is theirs', async () => {
    const staff = await staffStreams('staff');
    const staff2 = await staffStreams('staff2');
    const aliceSub = await userStream('alice');
    const bobSub = await userStream('bob');
    const [alice, bob, staffApi] = await Promise.all([loginAs('alice'), loginAs('bob'), loginAs('staff')]);

    // 1. Two handoffs: both enter every staff queue, customers hear nothing about the queue.
    const aliceConv = (await alice.post('/api/support/conversations').send({ reason: 'limit', transcript: [{ role: 'user', text: 'Alice asks' }] })).body.conversation.id;
    const bobConv = (await bob.post('/api/support/conversations').send({ reason: 'unavailable', transcript: [{ role: 'user', text: 'Bob asks' }] })).body.conversation.id;
    await waitFor(() => of(staff2.queue, 'chat-waiting').length === 2);
    expect(of(staff.queue, 'chat-waiting').map((e) => [e.data.id, e.data.customer.username, e.data.handoffReason, e.data.lastMessage.text])).toEqual([
      [aliceConv, 'alice', 'limit', 'Alice asks'],
      [bobConv, 'bob', 'unavailable', 'Bob asks'],
    ]);

    // 2. A message while still waiting goes to the whole queue and to its customer only.
    expect((await alice.post(`/api/support/conversations/${aliceConv}/messages`).send({ text: 'Anyone?' })).status).toBe(201);
    await waitFor(() => of(staff2.queue, 'chat-message').length === 1);
    await waitFor(() => of(aliceSub, 'chat-message').length === 1);
    expect(texts(of(staff.queue, 'chat-message'))).toEqual(['Anyone?']);

    // 3. staff claims both: every queue hears it (so staff2 drops them), each customer hears only their own claim.
    expect((await staffApi.post(`/api/staff/chats/${aliceConv}/claim`)).status).toBe(200);
    expect((await staffApi.post(`/api/staff/chats/${bobConv}/claim`)).status).toBe(200);
    await waitFor(() => of(staff2.queue, 'chat-claimed').length === 2);
    await waitFor(() => of(aliceSub, 'chat-claimed').length === 1 && of(bobSub, 'chat-claimed').length === 1);
    expect(of(aliceSub, 'chat-claimed')[0].data).toMatchObject({ conversationId: aliceConv, assignedStaff: { username: 'staff' } });
    expect(of(bobSub, 'chat-claimed')[0].data.conversationId).toBe(bobConv);

    // 4. Assigned now: replies and customer messages go only to that customer and the assigned staff member.
    const queueMessagesBefore = of(staff2.queue, 'chat-message').length;
    await staffApi.post(`/api/staff/chats/${aliceConv}/messages`).send({ text: 'Hi Alice' });
    await staffApi.post(`/api/staff/chats/${bobConv}/messages`).send({ text: 'Hi Bob' });
    await bob.post(`/api/support/conversations/${bobConv}/messages`).send({ text: 'Thanks' });
    await waitFor(() => of(staff.own, 'chat-message').length === 3);
    await waitFor(() => of(bobSub, 'chat-message').length === 2);
    await waitFor(() => of(aliceSub, 'chat-message').length === 2);
    await settle();
    expect(texts(of(aliceSub, 'chat-message'))).toEqual(['Anyone?', 'Hi Alice']);
    expect(texts(of(bobSub, 'chat-message'))).toEqual(['Hi Bob', 'Thanks']);
    expect(texts(of(staff.own, 'chat-message'))).toEqual(['Hi Alice', 'Hi Bob', 'Thanks']);
    expect(of(staff2.own, 'chat-message')).toEqual([]);
    expect(of(staff2.queue, 'chat-message')).toHaveLength(queueMessagesBefore);

    // 5. Close: queues and the customer hear it; the other customer does not.
    expect((await staffApi.post(`/api/staff/chats/${aliceConv}/close`)).status).toBe(200);
    await waitFor(() => of(aliceSub, 'chat-closed').length === 1 && of(staff2.queue, 'chat-closed').length === 1);
    expect(of(aliceSub, 'chat-closed')[0].data).toEqual({ conversationId: aliceConv, reason: 'closed' });

    // 6. Admin soft delete is announced as closed (reason deleted).
    const admin = await loginAs('admin');
    expect((await admin.delete(`/api/staff/chats/${bobConv}`)).status).toBe(200);
    await waitFor(() => of(bobSub, 'chat-closed').length === 1);
    expect(of(bobSub, 'chat-closed')[0].data.reason).toBe('deleted');

    await settle();
    // No customer ever saw another customer's conversation.
    for (const e of aliceSub.events) expect(e.data.conversationId ?? e.data.id).toBe(aliceConv);
    for (const e of bobSub.events) expect(e.data.conversationId ?? e.data.id).toBe(bobConv);
    expect(names(aliceSub)).not.toContain('chat-waiting');
  });

  it('refused requests publish nothing', async () => {
    const staff = await staffStreams('staff');
    const alice = await loginAs('alice');
    const conv = (await alice.post('/api/support/conversations').send({ reason: 'limit', transcript: [{ role: 'user', text: 'Again' }] })).body.conversation.id;
    await waitFor(() => of(staff.queue, 'chat-waiting').length === 1);
    const before = staff.queue.events.length;
    const staff2 = await loginAs('staff2');
    expect((await alice.post('/api/support/conversations').send({ reason: 'limit', transcript: [] })).status).toBe(400);
    expect((await alice.post(`/api/support/conversations/${conv}/messages`).send({ text: '' })).status).toBe(400);
    expect((await staff2.post(`/api/staff/chats/${conv}/messages`).send({ text: 'not mine' })).status).toBe(403);
    expect((await staff2.post(`/api/staff/chats/${conv}/close`)).status).toBe(403);
    expect((await request.agent(server).post(`/api/staff/chats/${conv}/claim`)).status).toBe(401);
    await settle();
    expect(staff.queue.events.length).toBe(before);
  });
});
