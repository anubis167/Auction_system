import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../be/src/db';
import { app, loginAs, resetDb } from '../../be/tests/helpers';

// sch-1.5: staff queue, claim, reply, close; admin soft delete.
const handoff = (agent: request.Agent, text: string) =>
  agent.post('/api/support/conversations').send({ reason: 'limit', transcript: [{ role: 'user', text }] });

describe('sch-1.5 staff conversation API', () => {
  let alice: request.Agent;
  let bob: request.Agent;
  let carol: request.Agent;
  let staff: request.Agent;
  let staff2: request.Agent;
  let admin: request.Agent;
  let aliceConv: string;
  let bobConv: string;

  beforeAll(async () => {
    await resetDb();
    // A second staff member, same password as the seeded one.
    const seeded = await prisma.user.findUniqueOrThrow({ where: { username: 'staff' } });
    await prisma.user.create({ data: { username: 'staff2', email: 'staff2@example.com', passwordHash: seeded.passwordHash, role: 'staff', emailVerifiedAt: new Date() } });
    [alice, bob, carol, staff, staff2, admin] = await Promise.all(['alice', 'bob', 'carol', 'staff', 'staff2', 'admin'].map((u) => loginAs(u)));
    aliceConv = (await handoff(alice, 'Alice needs help')).body.conversation.id;
    bobConv = (await handoff(bob, 'Bob needs help')).body.conversation.id;
  });

  it('guests 401, customers 403', async () => {
    expect((await request(app).get('/api/staff/chats')).status).toBe(401);
    expect((await alice.get('/api/staff/chats')).status).toBe(403);
    expect((await alice.post(`/api/staff/chats/${aliceConv}/claim`)).status).toBe(403);
  });

  it('waiting queue, oldest first, with customer and last message', async () => {
    const res = await staff.get('/api/staff/chats?status=waiting');
    expect(res.status).toBe(200);
    expect(res.body.conversations.map((c: { id: string }) => c.id)).toEqual([aliceConv, bobConv]);
    expect(res.body.conversations[0]).toMatchObject({ status: 'waiting', handoffReason: 'limit', customer: { username: 'alice' }, lastMessage: { text: 'Alice needs help' } });
    expect((await staff.get('/api/staff/chats?status=bogus')).status).toBe(400);
  });

  it('two staff claiming at once: exactly one wins', async () => {
    const [a, b] = await Promise.all([staff.post(`/api/staff/chats/${aliceConv}/claim`), staff2.post(`/api/staff/chats/${aliceConv}/claim`)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const winner = a.status === 200 ? 'staff' : 'staff2';
    const row = await prisma.chatConversation.findUniqueOrThrow({ where: { id: BigInt(aliceConv) }, include: { assignedStaff: true } });
    expect(row.status).toBe('assigned');
    expect(row.assignedStaff?.username).toBe(winner);
    // Normalise: hand it to `staff` for the rest of the suite.
    await prisma.chatConversation.update({ where: { id: BigInt(aliceConv) }, data: { assignedStaffId: (await prisma.user.findUniqueOrThrow({ where: { username: 'staff' } })).id } });
  });

  it('one staff member holds many conversations; mine lists them', async () => {
    expect((await staff.post(`/api/staff/chats/${bobConv}/claim`)).status).toBe(200);
    const carolConv = (await handoff(carol, 'Carol needs help')).body.conversation.id;
    expect((await staff.post(`/api/staff/chats/${carolConv}/claim`)).status).toBe(200);
    const mine = (await staff.get('/api/staff/chats?status=mine')).body.conversations.map((c: { id: string }) => c.id);
    expect(mine.sort()).toEqual([aliceConv, bobConv, carolConv].sort());
    expect((await staff2.get('/api/staff/chats?status=mine')).body.conversations).toEqual([]);
    expect((await staff.get('/api/staff/chats?status=waiting')).body.conversations).toEqual([]);
    expect((await staff.post(`/api/staff/chats/${carolConv}/claim`)).status).toBe(409);
    expect((await staff.post('/api/staff/chats/999999/claim')).status).toBe(404);
  });

  it('only the assigned staff member replies; each customer sees only their own reply', async () => {
    const toAlice = await staff.post(`/api/staff/chats/${aliceConv}/messages`).send({ text: ' Hi Alice ' });
    expect(toAlice.status).toBe(201);
    expect(toAlice.body.message).toMatchObject({ sender: 'staff', text: 'Hi Alice' });
    expect((await staff.post(`/api/staff/chats/${bobConv}/messages`).send({ text: 'Hi Bob' })).status).toBe(201);

    expect((await staff2.post(`/api/staff/chats/${aliceConv}/messages`).send({ text: 'me too' })).status).toBe(403);
    expect((await admin.post(`/api/staff/chats/${aliceConv}/messages`).send({ text: 'admin' })).status).toBe(403);
    expect((await staff.post(`/api/staff/chats/${aliceConv}/messages`).send({ text: '' })).status).toBe(400);
    expect((await staff.post(`/api/staff/chats/${aliceConv}/messages`).send({ text: 'a'.repeat(1001) })).status).toBe(400);

    const aliceSees = (await alice.get('/api/support/conversations/mine')).body.conversation;
    expect(aliceSees.assignedStaff.username).toBe('staff');
    expect(aliceSees.messages.map((m: { text: string }) => m.text)).toEqual(['Alice needs help', 'Hi Alice']);
    const bobSees = (await bob.get('/api/support/conversations/mine')).body.conversation;
    expect(bobSees.messages.map((m: { text: string }) => m.text)).toEqual(['Bob needs help', 'Hi Bob']);
  });

  it('viewing: other staff cannot open an assigned conversation, admin can', async () => {
    expect((await staff.get(`/api/staff/chats/${aliceConv}`)).body.conversation.messages).toHaveLength(2);
    expect((await staff2.get(`/api/staff/chats/${aliceConv}`)).status).toBe(403);
    expect((await admin.get(`/api/staff/chats/${aliceConv}`)).status).toBe(200);
    expect((await staff.get('/api/staff/chats/abc')).status).toBe(404);
  });

  it('close: assigned staff or admin; then replies and customer messages are refused', async () => {
    expect((await staff2.post(`/api/staff/chats/${aliceConv}/close`)).status).toBe(403);
    const closed = await staff.post(`/api/staff/chats/${aliceConv}/close`);
    expect(closed.status).toBe(200);
    expect(closed.body.conversation.status).toBe('closed');
    expect(closed.body.conversation.closedAt).toBeTruthy();
    expect((await staff.post(`/api/staff/chats/${aliceConv}/close`)).status).toBe(409);
    expect((await staff.post(`/api/staff/chats/${aliceConv}/messages`).send({ text: 'late' })).status).toBe(409);
    expect((await alice.post(`/api/support/conversations/${aliceConv}/messages`).send({ text: 'late' })).status).toBe(409);
    expect((await admin.post(`/api/staff/chats/${bobConv}/close`)).status).toBe(200);
  });

  it('delete: admin only, soft', async () => {
    expect((await staff.delete(`/api/staff/chats/${aliceConv}`)).status).toBe(403);
    expect((await admin.delete(`/api/staff/chats/${aliceConv}`)).status).toBe(200);
    expect((await admin.delete(`/api/staff/chats/${aliceConv}`)).status).toBe(404);
    expect((await admin.get(`/api/staff/chats/${aliceConv}`)).status).toBe(404);
    const all = (await admin.get('/api/staff/chats?status=all')).body.conversations.map((c: { id: string }) => c.id);
    expect(all).not.toContain(aliceConv);
    expect(all).toContain(bobConv);
    const row = await prisma.chatConversation.findUniqueOrThrow({ where: { id: BigInt(aliceConv) }, include: { messages: true } });
    expect(row.deletedAt).toBeTruthy();
    expect(row.messages).toHaveLength(2);
  });
});
