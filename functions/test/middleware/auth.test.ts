import { describe, it, expect, vi } from 'vitest';
import { createMockRequest, createMockResponse, createMockFirestore } from '../helpers/firebase-mock.js';
import { createAuthMiddleware } from '../../src/middleware/auth.js';
import { hashApiKey } from '../../src/lib/api-key.js';

describe('Auth middleware', () => {
  it('rejects requests without Authorization header', async () => {
    const db = createMockFirestore();
    const middleware = createAuthMiddleware(db as any);
    const req = createMockRequest({});
    const res = createMockResponse();
    const next = vi.fn();

    await middleware(req as any, res as any, next);

    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('unauthorized');
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects requests with invalid Bearer token', async () => {
    const db = createMockFirestore();
    const middleware = createAuthMiddleware(db as any);
    const req = createMockRequest({
      headers: { authorization: 'Bearer invalid-key' },
    });
    const res = createMockResponse();
    const next = vi.fn();

    await middleware(req as any, res as any, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects suspended agents', async () => {
    const db = createMockFirestore();
    const key = 'test-api-key';
    const hash = hashApiKey(key);

    // Seed a suspended agent
    db._store['agents'] = {
      'agent-1': { id: 'agent-1', api_key_hash: hash, suspended: true, email_verified: true },
    };

    // Override where().limit().get() to find the agent by hash
    db.collection = vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(() => ({
          get: vi.fn(async () => ({
            empty: false,
            docs: [{ data: () => db._store['agents']['agent-1'], id: 'agent-1' }],
          })),
        })),
      })),
      doc: vi.fn(),
    })) as any;

    const middleware = createAuthMiddleware(db as any);
    const req = createMockRequest({
      headers: { authorization: `Bearer ${key}` },
    });
    const res = createMockResponse();
    const next = vi.fn();

    await middleware(req as any, res as any, next);

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('suspended');
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects agents with unverified email', async () => {
    const db = createMockFirestore();
    const key = 'test-api-key';
    const hash = hashApiKey(key);

    const agentData = { id: 'agent-1', api_key_hash: hash, suspended: false, email_verified: false };
    db._store['agents'] = { 'agent-1': agentData };

    db.collection = vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(() => ({
          get: vi.fn(async () => ({
            empty: false,
            docs: [{ data: () => agentData, id: 'agent-1' }],
          })),
        })),
      })),
      doc: vi.fn(),
    })) as any;

    const middleware = createAuthMiddleware(db as any);
    const req = createMockRequest({
      headers: { authorization: `Bearer ${key}` },
    });
    const res = createMockResponse();
    const next = vi.fn();

    await middleware(req as any, res as any, next);

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('email_not_verified');
    expect(next).not.toHaveBeenCalled();
  });

  it('passes valid authenticated requests and attaches agent to req', async () => {
    const db = createMockFirestore();
    const key = 'test-api-key';
    const hash = hashApiKey(key);

    const agentData = { id: 'agent-1', api_key_hash: hash, suspended: false, email_verified: true };
    db._store['agents'] = { 'agent-1': agentData };

    db.collection = vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(() => ({
          get: vi.fn(async () => ({
            empty: false,
            docs: [{ data: () => agentData, id: 'agent-1' }],
          })),
        })),
      })),
      doc: vi.fn(),
    })) as any;

    const middleware = createAuthMiddleware(db as any);
    const req = createMockRequest({
      headers: { authorization: `Bearer ${key}` },
    }) as any;
    const res = createMockResponse();
    const next = vi.fn();

    await middleware(req, res as any, next);

    expect(next).toHaveBeenCalled();
    expect(req.agent).toBeDefined();
    expect(req.agent.id).toBe('agent-1');
  });
});
