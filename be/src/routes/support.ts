import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { publishChatMessages, publishChatWaiting } from '../lib/chatEvents';
import { HttpError, asyncHandler } from '../lib/http';
import { requireAuth } from '../middleware/auth';
import { parseId } from './auctions';

// sch-1.4: a signed-in customer's conversation with staff, opened when the chat bot hands off (sch-1.3).
// Mounted at /api/support, not /api/chat: the Vite dev proxy sends every /api/chat* path to the Python bot.
export const supportRouter = Router();

export const OPEN_STATUSES = ['waiting', 'assigned'];
const MAX_TEXT = 1000;
const MAX_TRANSCRIPT = 20;

const text = z
  .string({ required_error: 'Message cannot be empty' })
  .trim()
  .min(1, 'Message cannot be empty')
  .max(MAX_TEXT, `Message is too long (max ${MAX_TEXT} characters)`);

const handoffBody = z.object({
  reason: z.enum(['limit', 'unavailable']),
  // The browser's bot conversation so far; 'model' lines are the bot's (same shape as POST /api/chat).
  transcript: z
    .array(z.object({ role: z.enum(['user', 'model']), text: z.string().min(1).max(MAX_TEXT) }))
    .min(1)
    .max(MAX_TRANSCRIPT),
});

export const conversationInclude = {
  assignedStaff: { select: { id: true, username: true } },
  messages: { where: { deletedAt: null }, orderBy: { id: 'asc' as const } },
};

const customerOnly = asyncHandler(async (req, _res, next) => {
  if (req.user!.role !== 'customer') throw new HttpError(403, 'Only customers can chat with staff');
  next();
});

supportRouter.use(requireAuth, customerOnly);

supportRouter.post(
  '/conversations',
  asyncHandler(async (req, res) => {
    const { reason, transcript } = handoffBody.parse(req.body);
    const customerId = req.user!.id;
    const { id, created, added } = await prisma.$transaction(async (tx) => {
      // Locks the customer's row so two handoffs at once cannot open two conversations.
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${customerId} FOR UPDATE`;
      const open = await tx.chatConversation.findFirst({
        where: { customerId, status: { in: OPEN_STATUSES }, deletedAt: null },
        select: { id: true },
      });
      const conversation = open ?? (await tx.chatConversation.create({ data: { customerId, handoffReason: reason }, select: { id: true } }));
      const added = await tx.chatMessage.createManyAndReturn({
        data: transcript.map((line) => ({
          conversationId: conversation.id,
          sender: line.role === 'user' ? 'customer' : 'bot',
          senderId: line.role === 'user' ? customerId : null,
          text: line.text,
        })),
      });
      return { id: conversation.id, created: !open, added };
    });
    const conversation = await prisma.chatConversation.findUniqueOrThrow({ where: { id }, include: conversationInclude });
    // sch-1.6: a new conversation enters the staff queue; a reused one streams the added lines to whoever follows it.
    if (created) {
      publishChatWaiting({ id, customer: { id: customerId, username: req.user!.username }, handoffReason: conversation.handoffReason, createdAt: conversation.createdAt }, added.at(-1));
    } else {
      publishChatMessages(conversation, added);
    }
    res.status(created ? 201 : 200).json({ conversation });
  }),
);

supportRouter.get(
  '/conversations/mine',
  asyncHandler(async (req, res) => {
    const conversation = await prisma.chatConversation.findFirst({
      where: { customerId: req.user!.id, status: { in: OPEN_STATUSES }, deletedAt: null },
      include: conversationInclude,
    });
    res.json({ conversation });
  }),
);

supportRouter.post(
  '/conversations/:id/messages',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const conversation = await prisma.chatConversation.findUnique({ where: { id }, select: { id: true, customerId: true, assignedStaffId: true, status: true, deletedAt: true } });
    // Someone else's conversation answers like a missing one, so ids cannot be probed.
    if (!conversation || conversation.deletedAt || conversation.customerId !== req.user!.id) throw new HttpError(404, 'Conversation not found');
    if (conversation.status === 'closed') throw new HttpError(409, 'This conversation is closed');
    const body = z.object({ text }).parse(req.body);
    const message = await prisma.chatMessage.create({ data: { conversationId: id, sender: 'customer', senderId: req.user!.id, text: body.text } });
    publishChatMessages(conversation, [message]);
    res.status(201).json({ message });
  }),
);
