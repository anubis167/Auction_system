import { createHash, timingSafeEqual } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config';
import { prisma } from '../db';
import { cache } from '../lib/cache';
import { normalizeQuestion } from '../lib/faqs';
import { answerKey, bumpKnowledgeVersion, knowledgeVersion } from '../lib/ragAnswerCache';
import { HttpError, asyncHandler } from '../lib/http';
import { toJsonl, toTrainingRecord } from '../lib/ragExport';
import { optionalAuth, requireAuth, requirePermission } from '../middleware/auth';
import { parseId } from './auctions';
import { FAQ_MATCH_PREFIX } from './faqs';

// rag2-1.1: the only data the Python chat service (be/rag) may read or write. It forwards the visitor's own session
// cookie, so the user and their permissions are decided here; service-only routes also need X-Internal-Token.
export const ragRouter = Router();

/** Constant-time check of X-Internal-Token against RAG_INTERNAL_TOKEN; unset token means the routes are off (503). */
export const requireInternal = asyncHandler(async (req, _res, next) => {
  const expected = config.ragInternalToken;
  if (!expected) throw new HttpError(503, 'RAG service token is not configured');
  const given = Buffer.from(req.get('x-internal-token') ?? '');
  const want = Buffer.from(expected);
  if (given.length !== want.length || !timingSafeEqual(given, want)) throw new HttpError(401, 'Invalid internal token');
  next();
});

const money = (value: { toFixed(digits: number): string }) => value.toFixed(2);

/** The signed-in visitor's own account, for the bot's prompt (rag-1.7 moved here from Python SQL). */
ragRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = req.user!.id;
    const [user, bids, lots] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id }, select: { username: true, creditBalance: true, heldBalance: true } }),
      prisma.bidTicket.findMany({
        where: { bidderId: id, auction: { deletedAt: null } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 5,
        select: { amount: true, status: true, auction: { select: { name: true } } },
      }),
      prisma.auction.findMany({
        where: { sellerId: id, deletedAt: null, status: { in: ['upcoming', 'active'] }, endTime: { gt: new Date() } },
        orderBy: { endTime: 'asc' },
        take: 5,
        select: { name: true, status: true, currentPrice: true, initialPrice: true, endTime: true },
      }),
    ]);
    res.json({
      id: Number(id),
      role: req.user!.role,
      username: user.username,
      credit: {
        balance: money(user.creditBalance),
        held: money(user.heldBalance),
        available: money(user.creditBalance.minus(user.heldBalance)),
      },
      bids: bids.map((b) => ({ auction: b.auction.name, amount: money(b.amount), status: b.status })),
      lots: lots.map((l) => ({
        name: l.name,
        status: l.status,
        price: money(l.currentPrice ?? l.initialPrice),
        endsAt: l.endTime.toISOString(),
      })),
    });
  }),
);

/** Every live chunk with its id and embedding; Python ranks them (shortcut until pgvector). */
ragRouter.get(
  '/chunks',
  requireInternal,
  asyncHandler(async (_req, res) => {
    const chunks = await prisma.knowledgeChunk.findMany({
      where: { document: { deletedAt: null } },
      orderBy: [{ documentId: 'asc' }, { position: 'asc' }],
      select: { id: true, text: true, embedding: true, document: { select: { title: true } } },
    });
    res.json(chunks.map((c) => ({ id: Number(c.id), title: c.document.title, text: c.text, embedding: c.embedding })));
  }),
);

/** faq-cache-5: a question nobody asked as an FAQ is remembered this long, so repeats skip Postgres. */
const NO_MATCH_TTL_SECONDS = 300;
type FaqMatch = { faqId: number; question: string; answer: string } | { none: true };

/** The FAQ whose normalized question equals the visitor's, from Redis (faq:q:<sha256>) or Postgres; 404 when none. */
ragRouter.get(
  '/faq-match',
  requireInternal,
  asyncHandler(async (req, res) => {
    const normalized = normalizeQuestion(z.string().max(4000).parse(req.query.q));
    if (!normalized) throw new HttpError(400, 'Question is required');
    const key = FAQ_MATCH_PREFIX + createHash('sha256').update(normalized).digest('hex');
    let match = await cache.get<FaqMatch>(key);
    res.set('X-Cache', match === null ? 'MISS' : 'HIT');
    if (match === null) {
      const row = await prisma.faq.findFirst({ where: { normalizedQuestion: normalized, deletedAt: null } });
      match = row ? { faqId: Number(row.id), question: row.question, answer: row.answer } : { none: true };
      // FAQ writes clear every faq:q: key (clearFaqCache), so a new FAQ is matched at once despite this entry
      await cache.set(key, match, row ? config.faqCacheTtlSeconds : NO_MATCH_TTL_SECONDS);
    }
    if ('none' in match) throw new HttpError(404, 'No FAQ matches this question');
    res.json(match);
  }),
);

// faq-cache-7: Gemini answers to guests' questions, reused for the same question until the knowledge changes.
// Signed-in visitors never use it: their prompt holds their own bids and credit. Flask decides who is a guest.
const cacheQuestion = z.string().max(4000).refine((q) => normalizeQuestion(q) !== '', 'Question is required');
type CachedAnswer = { reply: string; sources: string[] };

/** {version, answer}: answer is null on a miss; version is what PUT must send back. */
ragRouter.get(
  '/answer-cache',
  requireInternal,
  asyncHandler(async (req, res) => {
    const question = cacheQuestion.parse(req.query.q);
    const version = await knowledgeVersion();
    res.json({ version, answer: await cache.get<CachedAnswer>(answerKey(version, question)) });
  }),
);

const answerBody = z.object({
  question: cacheQuestion,
  version: z.string().min(1).max(64),
  reply: z.string().min(1).max(20000),
  sources: z.array(z.string().max(255)).max(20).default([]),
});

/** Store an answer; 409 when the knowledge changed while it was being written, so it is not cached. */
ragRouter.put(
  '/answer-cache',
  requireInternal,
  asyncHandler(async (req, res) => {
    const body = answerBody.parse(req.body);
    if (body.version !== (await knowledgeVersion())) throw new HttpError(409, 'Knowledge changed; answer not cached');
    await cache.set(answerKey(body.version, body.question), { reply: body.reply, sources: body.sources }, config.ragAnswerTtlSeconds);
    res.status(204).end();
  }),
);

export const MAX_CHUNKS = 15000; // 10 MB / ~850 new chars per chunk is ~12500 at worst; real documents stay far below
const documentBody = z.object({
  title: z.string().trim().min(1).max(255),
  filename: z.string().trim().min(1).max(255),
  mimeType: z.enum(['text/plain', 'text/markdown']),
  content: z.string().min(1).max(10 * 1024 * 1024),
  chunks: z
    .array(z.object({ text: z.string().min(1).max(1000), embedding: z.array(z.number().finite()).min(1).max(3072) }))
    .min(1)
    .max(MAX_CHUNKS),
});

ragRouter.post(
  '/documents',
  requireInternal,
  requirePermission('knowledge.manage'),
  asyncHandler(async (req, res) => {
    const body = documentBody.parse(req.body);
    const doc = await prisma.knowledgeDocument.create({
      data: {
        title: body.title,
        filename: body.filename,
        mimeType: body.mimeType,
        content: body.content,
        sizeBytes: Buffer.byteLength(body.content),
        uploadedById: req.user!.id,
        // Nested create: the document and all its chunks in one transaction
        chunks: { create: body.chunks.map((c, position) => ({ position, text: c.text, embedding: c.embedding })) },
      },
      select: { id: true, title: true },
    });
    await bumpKnowledgeVersion(); // faq-cache-7: cached answers predate this document
    res.status(201).json({ id: Number(doc.id), title: doc.title, chunks: body.chunks.length });
  }),
);

ragRouter.get(
  '/documents',
  requirePermission('knowledge.manage'),
  asyncHandler(async (_req, res) => {
    const docs = await prisma.knowledgeDocument.findMany({
      where: { deletedAt: null },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true, title: true, filename: true, sizeBytes: true, createdAt: true, _count: { select: { chunks: true } } },
    });
    res.json({
      documents: docs.map((d) => ({
        id: Number(d.id),
        title: d.title,
        filename: d.filename,
        sizeBytes: d.sizeBytes,
        createdAt: d.createdAt.toISOString(),
        chunks: d._count.chunks,
      })),
    });
  }),
);

// rag-3.4: one live document with its chunks, for GET /api/docs/<id> in be/rag
ragRouter.get(
  '/documents/:id',
  requirePermission('knowledge.manage'),
  asyncHandler(async (req, res) => {
    const d = await prisma.knowledgeDocument.findFirst({
      where: { id: parseId(req.params.id), deletedAt: null },
      include: { chunks: { orderBy: { position: 'asc' }, select: { id: true, position: true, text: true } } },
    });
    if (!d) throw new HttpError(404, 'Document not found');
    res.json({
      id: Number(d.id),
      title: d.title,
      filename: d.filename,
      mimeType: d.mimeType,
      sizeBytes: d.sizeBytes,
      uploadedById: Number(d.uploadedById),
      createdAt: d.createdAt.toISOString(),
      content: d.content,
      chunks: d.chunks.map((c) => ({ id: Number(c.id), position: c.position, text: c.text })),
    });
  }),
);

ragRouter.delete(
  '/documents/:id',
  requirePermission('knowledge.manage'),
  asyncHandler(async (req, res) => {
    // Soft delete (SRS: all delete means soft delete); its chunks drop out of /chunks with it
    const { count } = await prisma.knowledgeDocument.updateMany({
      where: { id: parseId(req.params.id), deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (count === 0) throw new HttpError(404, 'Document not found');
    await bumpKnowledgeVersion(); // faq-cache-7: cached answers may quote this document
    res.status(204).end();
  }),
);

/** rag-train-2: the chat box's visitor token is only ever stored as this hash. */
export const visitorHash = (visitor: string) => createHash('sha256').update(visitor).digest('hex');

const visitorToken = z.string().min(16).max(200);
const turnBody = z.object({
  visitor: visitorToken,
  userText: z.string().min(1).max(4000),
  botText: z.string().max(20000).nullable().default(null),
  outcome: z.enum(['answered', 'refused', 'handed_off', 'error']),
  guardTriggered: z.string().min(1).max(40).nullable().default(null),
  model: z.string().min(1).max(60),
  promptVersion: z.string().min(1).max(64),
  promptTokens: z.number().int().nonnegative().nullable().default(null),
  completionTokens: z.number().int().nonnegative().nullable().default(null),
  latencyMs: z.number().int().nonnegative().nullable().default(null),
  // rag-train-3: the chunks the retriever returned, best first
  retrievals: z
    .array(z.object({ chunkId: z.number().int().positive(), rank: z.number().int().positive(), score: z.number().finite(), cited: z.boolean() }))
    .max(20)
    .default([]),
});

// rag-train-2: one chat turn, written by the Python service. The visitor's cookie decides user_id (null = guest);
// one rag_sessions row per chat-box conversation (visitor token) and user.
ragRouter.post(
  '/turns',
  requireInternal,
  optionalAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user?.id ?? null;
    /** The visitor's session row, created on first use; its consent follows the visitor's latest choice. */
    const sessionOf = async (tx: Prisma.TransactionClient, visitor: string, loggingConsent: boolean) => {
      const where = { visitorHash: visitorHash(visitor), userId, deletedAt: null };
      const found = await tx.ragSession.findFirst({ where, select: { id: true, loggingConsent: true } });
      if (!found) return tx.ragSession.create({ data: { visitorHash: where.visitorHash, userId, loggingConsent }, select: { id: true } });
      if (found.loggingConsent !== loggingConsent) await tx.ragSession.update({ where: { id: found.id }, data: { loggingConsent } });
      return found;
    };

    // rag-train-5: an opted-out visitor's turn carries no text at all; only the session's consent flag is saved
    if (req.body?.logging === false) {
      const { visitor } = z.object({ visitor: visitorToken, logging: z.literal(false) }).parse(req.body);
      const session = await prisma.$transaction((tx) => sessionOf(tx, visitor, false));
      res.json({ turnId: null, sessionId: Number(session.id) });
      return;
    }
    const { visitor, retrievals, ...turn } = turnBody.parse(req.body);
    const saved = await prisma.$transaction(async (tx) => {
      const session = await sessionOf(tx, visitor, true);
      // Deleted turns keep their index, so count them too; the unique key catches a concurrent write
      const turnIndex = await tx.ragTurn.count({ where: { sessionId: session.id } });
      return tx.ragTurn.create({
        data: {
          ...turn,
          sessionId: session.id,
          turnIndex,
          retrievals: { create: retrievals.map(({ chunkId, ...r }) => ({ ...r, chunkId: BigInt(chunkId) })) },
        },
        select: { id: true, sessionId: true },
      });
    }).catch((e: unknown) => {
      // A chunk id missing from knowledge_chunks (foreign key) is the caller's mistake, not a server fault
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') throw new HttpError(400, 'Unknown chunk');
      throw e;
    });
    res.status(201).json({ turnId: Number(saved.id), sessionId: Number(saved.sessionId) });
  }),
);

// rag-train-4: the visitor's thumbs on a bot answer, relayed by be/rag. Only the visitor whose token started the
// conversation may set it; a second tap replaces the first.
ragRouter.put(
  '/turns/:id/feedback',
  requireInternal,
  asyncHandler(async (req, res) => {
    const { visitor, feedback } = z.object({ visitor: visitorToken, feedback: z.enum(['up', 'down']) }).parse(req.body);
    const turn = await prisma.ragTurn.findFirst({
      where: { id: parseId(req.params.id), deletedAt: null },
      select: { id: true, session: { select: { visitorHash: true } } },
    });
    if (!turn) throw new HttpError(404, 'Turn not found');
    // Hashes on both sides, so a plain compare leaks nothing about the token
    if (turn.session.visitorHash !== visitorHash(visitor)) throw new HttpError(403, 'Not your conversation');
    await prisma.ragTurn.update({ where: { id: turn.id }, data: { feedback } });
    res.json({ turnId: Number(turn.id), feedback });
  }),
);

// rag-train-6: the staff review queue. A turn is waiting until it has a rag_examples row that is no longer raw.
const LABELS = ['good', 'bad', 'needs_fix'] as const;
const waiting: Prisma.RagTurnWhereInput = { OR: [{ example: { is: null } }, { example: { is: { status: 'raw' } } }] };

ragRouter.get(
  '/review',
  requirePermission('rag.review'),
  asyncHandler(async (req, res) => {
    const turns = await prisma.ragTurn.findMany({
      // ?all=1 also lists reviewed turns; soft-deleted turns (rag-train-8) never show
      where: { deletedAt: null, session: { deletedAt: null }, ...(req.query.all === '1' ? {} : waiting) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 50,
      include: {
        session: { select: { user: { select: { username: true } } } },
        example: { select: { status: true, label: true, idealReply: true } },
        retrievals: {
          orderBy: { rank: 'asc' },
          select: { rank: true, score: true, cited: true, chunk: { select: { text: true, document: { select: { title: true } } } } },
        },
      },
    });
    res.json({
      turns: turns.map((t) => ({
        id: Number(t.id),
        createdAt: t.createdAt.toISOString(),
        user: t.session.user?.username ?? null,
        question: t.userText,
        reply: t.botText,
        outcome: t.outcome,
        guardTriggered: t.guardTriggered,
        feedback: t.feedback,
        model: t.model,
        review: t.example && t.example.status !== 'raw' ? t.example : null,
        chunks: t.retrievals.map((r) => ({ rank: r.rank, score: r.score, cited: r.cited, title: r.chunk.document.title, text: r.chunk.text })),
      })),
    });
  }),
);

const reviewBody = z.object({
  decision: z.enum(['approve', 'reject']),
  label: z.enum(LABELS).optional(),
  idealReply: z.string().trim().min(1).max(4000).optional(),
});

ragRouter.post(
  '/review/:id',
  requirePermission('rag.review'),
  asyncHandler(async (req, res) => {
    const body = reviewBody.parse(req.body);
    if (body.decision === 'approve' && !body.label) throw new HttpError(400, 'Pick a label to approve');
    if (body.decision === 'approve' && body.label === 'needs_fix' && !body.idealReply) throw new HttpError(400, 'Write the better reply');
    const turnId = parseId(req.params.id);
    const status = body.decision === 'approve' ? 'approved' : 'rejected';
    await prisma.$transaction(async (tx) => {
      const turn = await tx.ragTurn.findFirst({ where: { id: turnId, deletedAt: null }, select: { example: { select: { status: true } } } });
      if (!turn) throw new HttpError(404, 'Turn not found');
      if (turn.example && turn.example.status !== 'raw') throw new HttpError(409, 'This turn was already reviewed');
      const data = { status, label: body.label ?? null, idealReply: body.idealReply ?? null, reviewerId: req.user!.id, reviewedAt: new Date() };
      await tx.ragExample.upsert({ where: { turnId }, create: { turnId, ...data }, update: data });
    });
    res.json({ turnId: Number(turnId), status });
  }),
);

// rag-train-7: approved examples as a JSONL download; each is marked exported so the next export skips it.
ragRouter.get(
  '/examples/export',
  requirePermission('rag.review'),
  asyncHandler(async (_req, res) => {
    const exportedAt = new Date();
    // Claim first, read second: a concurrent export cannot claim the same rows, so no example is in two files
    await prisma.ragExample.updateMany({
      where: { status: 'approved', turn: { deletedAt: null } },
      data: { status: 'exported', exportedAt },
    });
    const examples = await prisma.ragExample.findMany({
      where: { status: 'exported', exportedAt },
      orderBy: { id: 'asc' },
      select: {
        label: true,
        idealReply: true,
        turn: { select: { userText: true, botText: true, retrievals: { select: { rank: true, chunk: { select: { text: true } } } } } },
      },
    });
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="rag-examples-${exportedAt.toISOString().slice(0, 10)}.jsonl"`);
    res.send(toJsonl(examples.map(toTrainingRecord)));
  }),
);
