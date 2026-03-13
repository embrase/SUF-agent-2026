// functions/src/middleware/rate-limit.ts
import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.js';
import { sendError } from '../lib/errors.js';

interface RateEntry {
  count: number;
  reset_at: number;
}

export function createRateLimiter(maxPerMinute: number) {
  const entries = new Map<string, RateEntry>();

  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const agentId = req.agent?.id;
    if (!agentId) {
      next();
      return;
    }

    const now = Date.now();
    const entry = entries.get(agentId);

    if (!entry || now > entry.reset_at) {
      entries.set(agentId, { count: 1, reset_at: now + 60_000 });
      next();
      return;
    }

    if (entry.count >= maxPerMinute) {
      sendError(res, 429, 'rate_limited', `Rate limit exceeded. Max ${maxPerMinute} requests per minute.`);
      return;
    }

    entry.count++;
    next();
  };
}
