// functions/src/middleware/idempotency.ts
import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.js';

interface CachedResponse {
  status: number;
  body: any;
}

export function createIdempotencyMiddleware() {
  // Key format: `${agentId}:${idempotencyKey}`
  const cache = new Map<string, CachedResponse>();

  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
    if (!idempotencyKey || !req.agent?.id) {
      next();
      return;
    }

    const cacheKey = `${req.agent.id}:${idempotencyKey}`;
    const cached = cache.get(cacheKey);

    if (cached) {
      res.status(cached.status).json(cached.body);
      return;
    }

    // Intercept res.json() to auto-record the response
    const originalJson = res.json.bind(res);
    res.json = function (body: any) {
      cache.set(cacheKey, { status: res.statusCode, body });
      return originalJson(body);
    };

    next();
  };
}
