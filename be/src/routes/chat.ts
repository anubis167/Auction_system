import { Router } from 'express';
import { config } from '../config';
import { asyncHandler, HttpError } from '../lib/http';

export const chatRouter = Router();

chatRouter.post(
    '/',
    asyncHandler(async (req, res) => {
        const response = await fetch(`${config.ragBaseUrl}/api/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(req.headers.cookie ? { Cookie: req.headers.cookie } : {}),
            },
            body: JSON.stringify(req.body),
            signal: AbortSignal.timeout(60_000),
        });

        const data = await response.json().catch(() => null);

        if (!response.ok) {
            res.status(response.status).json(
                data ?? { error: 'RAG service request failed' },
            );
            return;
        }

        res.status(response.status).json(data);
    }),
);
