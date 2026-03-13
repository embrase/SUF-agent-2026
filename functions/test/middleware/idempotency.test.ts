// functions/test/middleware/idempotency.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createIdempotencyMiddleware } from '../../src/middleware/idempotency.js';
import { createMockResponse } from '../helpers/firebase-mock.js';

describe('Idempotency middleware', () => {
  it('passes through when no Idempotency-Key header', () => {
    const middleware = createIdempotencyMiddleware();
    const req = { headers: {}, agent: { id: 'a1' } } as any;
    const res = createMockResponse();
    const next = vi.fn();
    middleware(req, res as any, next);
    expect(next).toHaveBeenCalled();
  });

  it('passes first request with a given key', () => {
    const middleware = createIdempotencyMiddleware();
    const req = { headers: { 'idempotency-key': 'key-1' }, agent: { id: 'a1' } } as any;
    const res = createMockResponse();
    const next = vi.fn();
    middleware(req, res as any, next);
    expect(next).toHaveBeenCalled();
  });

  it('returns cached response on duplicate key from same agent', () => {
    const middleware = createIdempotencyMiddleware();
    const key = 'key-dup';
    const agentId = 'a1';

    // First request
    const req1 = { headers: { 'idempotency-key': key }, agent: { id: agentId } } as any;
    const res1 = createMockResponse();
    middleware(req1, res1 as any, vi.fn());
    // Simulate response being recorded
    middleware.recordResponse(agentId, key, 201, { id: 'created-1' });

    // Duplicate request
    const req2 = { headers: { 'idempotency-key': key }, agent: { id: agentId } } as any;
    const res2 = createMockResponse();
    const next2 = vi.fn();
    middleware(req2, res2 as any, next2);

    expect(next2).not.toHaveBeenCalled();
    expect(res2.statusCode).toBe(201);
    expect(res2.body).toEqual({ id: 'created-1' });
  });

  it('different agents can use the same key independently', () => {
    const middleware = createIdempotencyMiddleware();
    const key = 'shared-key';

    const req1 = { headers: { 'idempotency-key': key }, agent: { id: 'a1' } } as any;
    const req2 = { headers: { 'idempotency-key': key }, agent: { id: 'a2' } } as any;
    const next1 = vi.fn();
    const next2 = vi.fn();

    middleware(req1, createMockResponse() as any, next1);
    middleware(req2, createMockResponse() as any, next2);

    expect(next1).toHaveBeenCalled();
    expect(next2).toHaveBeenCalled();
  });
});
