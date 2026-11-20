import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../be/src/db';
import { resetDb } from '../../be/tests/helpers';

// rag-train-1: tables that keep the RAG bot's turns for review and training export.
describe('rag-train-1 training log tables', () => {
  let chunkId: bigint;
  let userId: bigint;

  beforeAll(async () => {
    await resetDb();
    await prisma.$executeRawUnsafe(
      'TRUNCATE rag_examples, rag_retrievals, rag_turns, rag_sessions, knowledge_chunks, knowledge_documents RESTART IDENTITY CASCADE',
    );
    const staff = await prisma.user.findUniqueOrThrow({ where: { username: 'staff' } });
    userId = (await prisma.user.findUniqueOrThrow({ where: { username: 'alice' } })).id;
    const doc = await prisma.knowledgeDocument.create({
      data: {
        title: 'Fees',
        filename: 'fees.md',
        mimeType: 'text/markdown',
        content: 'The seller fee is 5%.',
        sizeBytes: 21,
        uploadedById: staff.id,
        chunks: { create: [{ position: 0, text: 'The seller fee is 5%.', embedding: [1, 0, 0] }] },
      },
      include: { chunks: true },
    });
    chunkId = doc.chunks[0].id;
  });

  const newTurn = (sessionId: bigint, turnIndex: number) =>
    prisma.ragTurn.create({
      data: { sessionId, turnIndex, userText: 'What is the fee?', outcome: 'answered', model: 'gemini-test', promptVersion: 'a'.repeat(64) },
    });

  it('stores a session, a turn with its retrieved chunk and a reviewed example', async () => {
    const session = await prisma.ragSession.create({ data: { userId, visitorHash: 'f'.repeat(64) } });
    const turn = await prisma.ragTurn.create({
      data: {
        sessionId: session.id,
        turnIndex: 0,
        userText: 'What is the seller fee?',
        botText: 'It is 5%.',
        outcome: 'answered',
        model: 'gemini-test',
        promptVersion: 'a'.repeat(64),
        retrievals: { create: [{ chunkId, rank: 1, score: 0.92, cited: true }] },
      },
    });
    const staff = await prisma.user.findUniqueOrThrow({ where: { username: 'staff' } });
    await prisma.ragExample.create({ data: { turnId: turn.id, status: 'approved', label: 'good', reviewerId: staff.id } });

    const saved = await prisma.ragSession.findUniqueOrThrow({
      where: { id: session.id },
      include: { turns: { include: { retrievals: { include: { chunk: true } }, example: true } } },
    });
    expect(saved.deletedAt).toBeNull();
    expect(saved.turns).toHaveLength(1);
    expect(saved.turns[0].feedback).toBeNull();
    expect(saved.turns[0].deletedAt).toBeNull();
    expect(saved.turns[0].retrievals[0]).toMatchObject({ rank: 1, cited: true, chunk: { text: 'The seller fee is 5%.' } });
    expect(saved.turns[0].example).toMatchObject({ status: 'approved', label: 'good' });
  });

  it('guests have no user; defaults are raw example status and uncited retrieval', async () => {
    const guest = await prisma.ragSession.create({ data: { visitorHash: 'e'.repeat(64) } });
    expect(guest.userId).toBeNull();
    const turn = await newTurn(guest.id, 0);
    const example = await prisma.ragExample.create({ data: { turnId: turn.id } });
    expect(example.status).toBe('raw');
    const retrieval = await prisma.ragRetrieval.create({ data: { turnId: turn.id, chunkId, rank: 1, score: 0.5 } });
    expect(retrieval.cited).toBe(false);
  });

  it('unique keys reject duplicates', async () => {
    const session = await prisma.ragSession.create({ data: { visitorHash: 'd'.repeat(64) } });
    const turn = await newTurn(session.id, 0);
    await expect(newTurn(session.id, 0)).rejects.toMatchObject({ code: 'P2002' });
    await prisma.ragRetrieval.create({ data: { turnId: turn.id, chunkId, rank: 1, score: 0.1 } });
    await expect(prisma.ragRetrieval.create({ data: { turnId: turn.id, chunkId, rank: 2, score: 0.2 } })).rejects.toMatchObject({ code: 'P2002' });
    await prisma.ragExample.create({ data: { turnId: turn.id } });
    await expect(prisma.ragExample.create({ data: { turnId: turn.id } })).rejects.toMatchObject({ code: 'P2002' });
  });

  it('a turn cannot point at a missing session or chunk', async () => {
    await expect(newTurn(999_999n, 0)).rejects.toMatchObject({ code: 'P2003' });
    const session = await prisma.ragSession.create({ data: { visitorHash: 'c'.repeat(64) } });
    const turn = await newTurn(session.id, 0);
    await expect(prisma.ragRetrieval.create({ data: { turnId: turn.id, chunkId: 999_999n, rank: 1, score: 0 } })).rejects.toMatchObject({ code: 'P2003' });
  });
});
