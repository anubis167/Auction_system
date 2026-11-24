import { Router } from 'express';
import { prisma } from '../db';
import { asyncHandler } from '../lib/http';

export const healthRouter = Router();

healthRouter.get(
  '/db',
  asyncHandler(async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;

    res.status(200).json({
      status: 'ok',
      database: 'connected',
    });
  }),
);