import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../be/src/db';
import { app, loginAs, resetDb } from '../../be/tests/helpers';

// sch-1.4: a signed-in customer's conversation with staff after the bot hands off (sch-1.3).
const transcript = [
  { role: 'user', text: 'Where is my parcel?' },
  { role: 'model', text: 'Let me check.' },
  { role: 'user', text: 'Hello?' },
];

describe('sch-1.4 customer conversation API', () => {
  let ann: request.Agent;
  let bob: request.Agent;

  beforeAll(async () => {
    await resetDb();
    ann = await loginAs('alice'); // seeded customers
    bob = await loginAs('bob');
  });

  it('guests 401, staff and admin 403', async () => {
    expect((await request(app).get('/api/support/conversations/mine')).status).toBe(401);
    expect((await request(app).post('/api/support/conversations').send({ reason: 'limit', transcript })).status).toBe(401);
    for (const who of ['staff', 'admin']) {
      const agent = await loginAs(who);
      expect((await agent.post('/api/support/conversations').send({ reason: 'limit', transcript })).status).toBe(403);
      expect((await agent.get('/api/support/conversations/mine')).status).toBe(403);
    }
  });

  it('validates the handoff body', async () => {
    const long = 'a'.repeat(1001);
    for (const body of [
      {},
      { reason: 'out_of_scope', transcript },
      { reason: 'limit', transcript: [] },
      { reason: 'limit', transcript: Array(21).fill(transcript[0]) },
      { reason: 'limit', transcript: [{ role: 'system', text: 'x' }] },
      { reason: 'limit', transcript: [{ role: 'user', text: '' }] },
      { reason: 'limit', transcript: [{ role: 'user', text: long }] },
    ]) {
      expect((await ann.post('/api/support/conversations').send(body)).status, JSON.stringify(body).slice(0, 80)).toBe(400);
    }
    expect((await ann.get('/api/support/conversations/mine')).body.conversation).toBeNull();
  });

  it('opens a waiting conversation with the transcript, then reuses it', async () => {
    const first = await ann.post('/api/support/conversations').send({ reason: 'limit', transcript });
    expect(first.status).toBe(201);
    const conv = first.body.conversation;
    expect(conv).toMatchObject({ status: 'waiting', handoffReason: 'limit', assignedStaff: null });
    expect(conv.messages.map((m: { sender: string; text: string }) => [m.sender, m.text])).toEqual([
      ['customer', 'Where is my parcel?'],
      ['bot', 'Let me check.'],
      ['customer', 'Hello?'],
    ]);
    expect(conv.messages[1].senderId).toBeNull();

    const again = await ann.post('/api/support/conversations').send({ reason: 'unavailable', transcript: [{ role: 'user', text: 'Still there?' }] });
    expect(again.status).toBe(200);
    expect(again.body.conversation.id).toBe(conv.id);
    expect(again.body.conversation.handoffReason).toBe('limit');
    expect(again.body.conversation.messages).toHaveLength(4);
  });

  it('two handoffs at once open only one conversation', async () => {
    const body = { reason: 'limit', transcript: [transcript[0]] };
    const [a, b] = await Promise.all([bob.post('/api/support/conversations').send(body), bob.post('/api/support/conversations').send(body)]);
    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect(a.body.conversation.id).toBe(b.body.conversation.id);
    const bobId = (await prisma.user.findUniqueOrThrow({ where: { username: 'bob' } })).id;
    expect(await prisma.chatConversation.count({ where: { customerId: bobId } })).toBe(1);
  });

  it('mine returns only the caller\'s open conversation, oldest message first', async () => {
    const mine = (await ann.get('/api/support/conversations/mine')).body.conversation;
    expect(mine.messages.map((m: { text: string }) => m.text)).toEqual(['Where is my parcel?', 'Let me check.', 'Hello?', 'Still there?']);
    const bobs = (await bob.get('/api/support/conversations/mine')).body.conversation;
    expect(bobs.id).not.toBe(mine.id);
  });

  it('customer messages: owner only, validated, not on closed conversations', async () => {
    const id = (await ann.get('/api/support/conversations/mine')).body.conversation.id;
    const sent = await ann.post(`/api/support/conversations/${id}/messages`).send({ text: '  Any news?  ' });
    expect(sent.status).toBe(201);
    expect(sent.body.message).toMatchObject({ sender: 'customer', text: 'Any news?' });

    expect((await ann.post(`/api/support/conversations/${id}/messages`).send({ text: '' })).status).toBe(400);
    expect((await ann.post(`/api/support/conversations/${id}/messages`).send({ text: 'a'.repeat(1001) })).status).toBe(400);
    expect((await bob.post(`/api/support/conversations/${id}/messages`).send({ text: 'hi' })).status).toBe(404);
    expect((await ann.post('/api/support/conversations/999999/messages').send({ text: 'hi' })).status).toBe(404);

    await prisma.chatConversation.update({ where: { id: BigInt(id) }, data: { status: 'closed', closedAt: new Date() } });
    expect((await ann.post(`/api/support/conversations/${id}/messages`).send({ text: 'hi' })).status).toBe(409);
    expect((await ann.get('/api/support/conversations/mine')).body.conversation).toBeNull();
  });

  it('soft-deleted messages and conversations are hidden but kept', async () => {
    const opened = await ann.post('/api/support/conversations').send({ reason: 'limit', transcript: [{ role: 'user', text: 'New question' }, { role: 'user', text: 'Oops' }] });
    expect(opened.status).toBe(201);
    const conv = opened.body.conversation;
    await prisma.chatMessage.update({ where: { id: BigInt(conv.messages[1].id) }, data: { deletedAt: new Date() } });
    expect((await ann.get('/api/support/conversations/mine')).body.conversation.messages.map((m: { text: string }) => m.text)).toEqual(['New question']);

    await prisma.chatConversation.update({ where: { id: BigInt(conv.id) }, data: { deletedAt: new Date() } });
    expect((await ann.get('/api/support/conversations/mine')).body.conversation).toBeNull();
    expect((await ann.post(`/api/support/conversations/${conv.id}/messages`).send({ text: 'hi' })).status).toBe(404);
    expect(await prisma.chatMessage.count({ where: { conversationId: BigInt(conv.id) } })).toBe(2);
  });
});
