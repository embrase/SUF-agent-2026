import { describe, it, expect, vi } from 'vitest';
import { createAdminAuthMiddleware } from '../../src/middleware/admin-auth.js';
import { createMockResponse } from '../helpers/firebase-mock.js';

function createMockAuth(claims: Record<string, any> | null, email?: string) {
  return {
    verifyIdToken: vi.fn(async (token: string) => {
      if (token === 'invalid-token') throw new Error('Invalid token');
      return {
        uid: 'admin-uid-1',
        email: email || 'admin@startupfest.com',
        ...(claims || {}),
      };
    }),
  };
}

describe('Admin auth middleware', () => {
  it('rejects requests without Authorization header', async () => {
    const auth = createMockAuth({ role: 'admin' });
    const middleware = createAdminAuthMiddleware(auth as any);
    const req = { headers: {} } as any;
    const res = createMockResponse();
    const next = vi.fn();

    await middleware(req, res as any, next);

    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('unauthorized');
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects requests with invalid Firebase ID token', async () => {
    const auth = createMockAuth({ role: 'admin' });
    const middleware = createAdminAuthMiddleware(auth as any);
    const req = { headers: { authorization: 'Bearer invalid-token' } } as any;
    const res = createMockResponse();
    const next = vi.fn();

    await middleware(req, res as any, next);

    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('unauthorized');
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects users without admin or moderator role', async () => {
    const auth = createMockAuth({});  // No role claim
    const middleware = createAdminAuthMiddleware(auth as any);
    const req = { headers: { authorization: 'Bearer valid-token' } } as any;
    const res = createMockResponse();
    const next = vi.fn();

    await middleware(req, res as any, next);

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('forbidden');
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts admin role and attaches admin user to req', async () => {
    const auth = createMockAuth({ role: 'admin' });
    const middleware = createAdminAuthMiddleware(auth as any);
    const req = { headers: { authorization: 'Bearer valid-token' } } as any;
    const res = createMockResponse();
    const next = vi.fn();

    await middleware(req, res as any, next);

    expect(next).toHaveBeenCalled();
    expect(req.adminUser).toBeDefined();
    expect(req.adminUser.uid).toBe('admin-uid-1');
    expect(req.adminUser.email).toBe('admin@startupfest.com');
    expect(req.adminUser.role).toBe('admin');
  });

  it('accepts moderator role and attaches admin user to req', async () => {
    const auth = createMockAuth({ role: 'moderator' });
    const middleware = createAdminAuthMiddleware(auth as any);
    const req = { headers: { authorization: 'Bearer valid-token' } } as any;
    const res = createMockResponse();
    const next = vi.fn();

    await middleware(req, res as any, next);

    expect(next).toHaveBeenCalled();
    expect(req.adminUser.role).toBe('moderator');
  });

  it('uses requireAdmin to restrict moderator access', async () => {
    const auth = createMockAuth({ role: 'moderator' });
    const { requireAdmin } = await import('../../src/middleware/admin-auth.js');
    const req = { adminUser: { uid: 'u1', email: 'mod@test.com', role: 'moderator' } } as any;
    const res = createMockResponse();
    const next = vi.fn();

    requireAdmin(req, res as any, next);

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('forbidden');
    expect(res.body.message).toContain('admin');
    expect(next).not.toHaveBeenCalled();
  });

  it('requireAdmin passes for admin role', async () => {
    const { requireAdmin } = await import('../../src/middleware/admin-auth.js');
    const req = { adminUser: { uid: 'u1', email: 'admin@test.com', role: 'admin' } } as any;
    const res = createMockResponse();
    const next = vi.fn();

    requireAdmin(req, res as any, next);

    expect(next).toHaveBeenCalled();
  });
});
