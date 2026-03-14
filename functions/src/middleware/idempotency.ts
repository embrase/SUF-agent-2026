// functions/src/middleware/idempotency.ts
import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.js';

interface CachedResponse {
  status: number;
  body: any;
}

export function createIdempotencyMiddleware() {
  // Key format: `${agentId}:${idempotencyKey}`
  const cache = new Map<string, CachedResponse | 'pending'>();

  const middleware = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
    if (!idempotencyKey || !req.agent?.id) {
      next();
      return;
    }

    const cacheKey = `${req.agent.id}:${idempotencyKey}`;
    const cached = cache.get(cacheKey);

    if (cached && cached !== 'pending') {
      res.status(cached.status).json(cached.body);
      return;
    }

    // Mark as pending (first time seeing this key)
    if (!cached) {
      cache.set(cacheKey, 'pending');
    }

    next();
  };

  middleware.recordResponse = (agentId: string, idempotencyKey: string, status: number, body: any): void => {
    cache.set(`${agentId}:${idempotencyKey}`, { status, body });
  };

  return middleware;
}
