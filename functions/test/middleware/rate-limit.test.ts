// functions/test/middleware/rate-limit.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRateLimiter } from '../../src/middleware/rate-limit.js';
import { createMockResponse } from '../helpers/firebase-mock.js';

describe('Rate limiter', () => {
  let limiter: ReturnType<typeof createRateLimiter>;

  beforeEach(() => {
    limiter = createRateLimiter(5); // 5 requests per minute for testing
  });

  it('allows requests under the limit', () => {
    const req = { agent: { id: 'agent-1' } } as any;
    const res = createMockResponse();
    const next = vi.fn();
    limiter(req, res as any, next);
    expect(next).toHaveBeenCalled();
  });

  it('rejects requests over the limit', () => {
    const req = { agent: { id: 'agent-1' } } as any;
    const res = createMockResponse();
    const next = vi.fn();
    for (let i = 0; i < 5; i++) {
      const n = vi.fn();
      limiter(req, createMockResponse() as any, n);
    }
    limiter(req, res as any, next);
    expect(res.statusCode).toBe(429);
    expect(res.body.error).toBe('rate_limited');
    expect(next).not.toHaveBeenCalled();
  });

  it('tracks agents independently', () => {
    const req1 = { agent: { id: 'agent-1' } } as any;
    const req2 = { agent: { id: 'agent-2' } } as any;
    const res = createMockResponse();
    const next = vi.fn();
    for (let i = 0; i < 5; i++) {
      limiter(req1, createMockResponse() as any, vi.fn());
    }
    limiter(req2, res as any, next);
    expect(next).toHaveBeenCalled();
  });
});
