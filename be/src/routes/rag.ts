import { createHash, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config';
import { prisma } from '../db';
import { HttpError, asyncHandler } from '../lib/http';
import { optionalAuth, requireAuth, requirePermission } from '../middleware/auth';
import { parseId } from './auctions';

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

/** Every live chunk with its embedding; Python ranks them (shortcut until pgvector). */
ragRouter.get(
  '/chunks',
  requireInternal,
  asyncHandler(async (_req, res) => {
    const chunks = await prisma.knowledgeChunk.findMany({
      where: { document: { deletedAt: null } },
      orderBy: [{ documentId: 'asc' }, { position: 'asc' }],
      select: { text: true, embedding: true, document: { select: { title: true } } },
    });
    res.json(chunks.map((c) => ({ title: c.document.title, text: c.text, embedding: c.embedding })));
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
});

// rag-train-2: one chat turn, written by the Python service. The visitor's cookie decides user_id (null = guest);
// one rag_sessions row per chat-box conversation (visitor token) and user.
ragRouter.post(
  '/turns',
  requireInternal,
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { visitor, ...turn } = turnBody.parse(req.body);
    const userId = req.user?.id ?? null;
    const hash = visitorHash(visitor);
    const saved = await prisma.$transaction(async (tx) => {
      const session =
        (await tx.ragSession.findFirst({ where: { visitorHash: hash, userId, deletedAt: null }, select: { id: true } })) ??
        (await tx.ragSession.create({ data: { visitorHash: hash, userId }, select: { id: true } }));
      // Deleted turns keep their index, so count them too; the unique key catches a concurrent write
      const turnIndex = await tx.ragTurn.count({ where: { sessionId: session.id } });
      return tx.ragTurn.create({ data: { ...turn, sessionId: session.id, turnIndex }, select: { id: true, sessionId: true } });
    });
    res.status(201).json({ turnId: Number(saved.id), sessionId: Number(saved.sessionId) });
  }),
);
