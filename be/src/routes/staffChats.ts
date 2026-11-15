import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { publishChatClaimed, publishChatClosed, publishChatMessages } from '../lib/chatEvents';
import { HttpError, asyncHandler } from '../lib/http';
import { requirePermission } from '../middleware/auth';
import { conversationInclude } from './support';

/** sch-1.5 staff side of handed-off chats. Mounted at /api/staff/chats; every route needs chat.handle. */
export const staffChatsRouter = Router();
staffChatsRouter.use(requirePermission('chat.handle'));

const idParam = (raw: string) => {
  if (!/^\d{1,18}$/.test(raw)) throw new HttpError(404, 'Conversation not found');
  return BigInt(raw);
};

const listInclude = {
  customer: { select: { id: true, username: true } },
  assignedStaff: { select: { id: true, username: true } },
  messages: { where: { deletedAt: null }, orderBy: { id: 'desc' as const }, take: 1 },
};

/** waiting = the queue (oldest first); mine = assigned to the caller; all = every conversation (newest first). */
staffChatsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { status } = z.object({ status: z.enum(['waiting', 'mine', 'all']).default('all') }).parse(req.query);
    const where =
      status === 'waiting'
        ? { status: 'waiting' }
        : status === 'mine'
          ? { status: 'assigned', assignedStaffId: req.user!.id }
          : {};
    const rows = await prisma.chatConversation.findMany({
      where: { ...where, deletedAt: null },
      include: listInclude,
      orderBy: { id: status === 'waiting' ? 'asc' : 'desc' },
      take: 200,
    });
    const conversations = rows.map(({ messages, ...c }) => ({ ...c, lastMessage: messages[0] ?? null }));
    res.json({ conversations });
  }),
);

/** Loads a live conversation the caller may see: waiting ones are open to all staff, assigned/closed ones to their staff member and admins. */
async function loadVisible(id: bigint, user: { id: bigint; role: string }) {
  const conversation = await prisma.chatConversation.findUnique({
    where: { id },
    include: { ...conversationInclude, customer: { select: { id: true, username: true } } },
  });
  if (!conversation || conversation.deletedAt) throw new HttpError(404, 'Conversation not found');
  const visible = conversation.status === 'waiting' || conversation.assignedStaffId === user.id || user.role === 'admin';
  if (!visible) throw new HttpError(403, 'This conversation belongs to another staff member');
  return conversation;
}

staffChatsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json({ conversation: await loadVisible(idParam(req.params.id), req.user!) });
  }),
);

staffChatsRouter.post(
  '/:id/claim',
  asyncHandler(async (req, res) => {
    const id = idParam(req.params.id);
    // One conditional update: of two staff claiming at once, exactly one matches the waiting row.
    const { count } = await prisma.chatConversation.updateMany({
      where: { id, status: 'waiting', deletedAt: null },
      data: { status: 'assigned', assignedStaffId: req.user!.id, assignedAt: new Date() },
    });
    if (count === 0) {
      const row = await prisma.chatConversation.findUnique({ where: { id }, select: { deletedAt: true } });
      if (!row || row.deletedAt) throw new HttpError(404, 'Conversation not found');
      throw new HttpError(409, 'This conversation is no longer waiting');
    }
    const conversation = await loadVisible(id, req.user!);
    publishChatClaimed(conversation, { id: req.user!.id, username: req.user!.username });
    res.json({ conversation });
  }),
);

staffChatsRouter.post(
  '/:id/messages',
  asyncHandler(async (req, res) => {
    const id = idParam(req.params.id);
    const conversation = await loadVisible(id, req.user!);
    if (conversation.status === 'closed') throw new HttpError(409, 'This conversation is closed');
    if (conversation.assignedStaffId !== req.user!.id) throw new HttpError(403, 'Claim the conversation before replying');
    const { text } = z
      .object({ text: z.string({ required_error: 'Message cannot be empty' }).trim().min(1, 'Message cannot be empty').max(1000, 'Message is too long (max 1000 characters)') })
      .parse(req.body);
    const message = await prisma.chatMessage.create({ data: { conversationId: id, sender: 'staff', senderId: req.user!.id, text } });
    publishChatMessages(conversation, [message]);
    res.status(201).json({ message });
  }),
);

staffChatsRouter.post(
  '/:id/close',
  asyncHandler(async (req, res) => {
    const id = idParam(req.params.id);
    const conversation = await loadVisible(id, req.user!);
    if (conversation.status === 'closed') throw new HttpError(409, 'This conversation is already closed');
    if (conversation.assignedStaffId !== req.user!.id && req.user!.role !== 'admin') throw new HttpError(403, 'Only the assigned staff member or an admin can close it');
    const closed = await prisma.chatConversation.update({ where: { id }, data: { status: 'closed', closedAt: new Date() } });
    publishChatClosed(closed, 'closed');
    res.json({ conversation: await loadVisible(id, req.user!) });
  }),
);

/** Admin only; soft delete: hidden everywhere, rows kept. */
staffChatsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    if (req.user!.role !== 'admin') throw new HttpError(403, 'Only admins can delete conversations');
    const id = idParam(req.params.id);
    const { count } = await prisma.chatConversation.updateMany({ where: { id, deletedAt: null }, data: { deletedAt: new Date() } });
    if (count === 0) throw new HttpError(404, 'Conversation not found');
    publishChatClosed(await prisma.chatConversation.findUniqueOrThrow({ where: { id } }), 'deleted');
    res.json({ message: 'Conversation deleted' });
  }),
);
