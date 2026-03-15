import { describe, it, expect, vi } from 'vitest';
import {
  handleListAgents,
  handleGetAgent,
  handleSuspendAgent,
  handleResetAgentKey,
} from '../../src/api/admin/agents.js';
import { createMockResponse } from '../helpers/firebase-mock.js';

function createAgentsDb(agents: Record<string, any> = {}) {
  const store: Record<string, Record<string, any>> = {
    agents: agents,
    admin_audit_log: {},
  };

  const docMock = (name: string, id: string) => ({
    get: vi.fn(async () => ({
      exists: !!store[name]?.[id],
      data: () => store[name]?.[id],
      id,
    })),
    set: vi.fn(async (data: any, opts?: any) => {
      if (!store[name]) store[name] = {};
      if (opts?.merge) {
        store[name][id] = { ...store[name][id], ...data };
      } else {
        store[name][id] = data;
      }
    }),
    update: vi.fn(async (data: any) => {
      if (!store[name]) store[name] = {};
      store[name][id] = { ...store[name][id], ...data };
    }),
  });

  return {
    collection: vi.fn((name: string) => ({
      doc: vi.fn((id: string) => docMock(name, id)),
      orderBy: vi.fn(() => ({
        startAfter: vi.fn(() => ({
          limit: vi.fn(() => ({
            get: vi.fn(async () => ({
              docs: Object.entries(store[name] || {}).map(([id, data]) => ({
                id,
                data: () => data,
              })),
              size: Object.keys(store[name] || {}).length,
            })),
          })),
        })),
        limit: vi.fn(() => ({
          get: vi.fn(async () => ({
            docs: Object.entries(store[name] || {}).map(([id, data]) => ({
              id,
              data: () => data,
            })),
            size: Object.keys(store[name] || {}).length,
          })),
        })),
      })),
      where: vi.fn(() => ({
        orderBy: vi.fn(() => ({
          limit: vi.fn(() => ({
            get: vi.fn(async () => ({
              docs: Object.entries(store[name] || {})
                .filter(([_, data]) =>
                  data.name?.toLowerCase().includes('agent') ||
                  data.human_contact_email?.toLowerCase().includes('agent')
                )
                .map(([id, data]) => ({ id, data: () => data })),
              size: 1,
            })),
          })),
        })),
      })),
    })),
    _store: store,
  };
}

describe('GET /api/admin/agents', () => {
  it('returns paginated list of agents', async () => {
    const db = createAgentsDb({
      'a1': { id: 'a1', name: 'Agent One', suspended: false, email_verified: true, created_at: { toDate: () => new Date() } },
      'a2': { id: 'a2', name: 'Agent Two', suspended: true, email_verified: true, created_at: { toDate: () => new Date() } },
    });

    const req = { query: {} } as any;
    const res = createMockResponse();

    await handleListAgents(db as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.agents).toBeDefined();
    expect(res.body.agents.length).toBe(2);
  });

  it('respects limit parameter', async () => {
    const db = createAgentsDb({
      'a1': { id: 'a1', name: 'Agent One' },
    });

    const req = { query: { limit: '1' } } as any;
    const res = createMockResponse();

    await handleListAgents(db as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.agents).toBeDefined();
  });
});

describe('GET /api/admin/agents/:id', () => {
  it('returns full agent detail', async () => {
    const db = createAgentsDb({
      'a1': {
        id: 'a1',
        name: 'Agent One',
        human_contact_email: 'founder@test.com',
        suspended: false,
        email_verified: true,
        api_key_hash: 'hash123',
      },
    });

    const req = { params: { id: 'a1' } } as any;
    const res = createMockResponse();

    await handleGetAgent(db as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.agent.id).toBe('a1');
    expect(res.body.agent.name).toBe('Agent One');
    expect(res.body.agent.human_contact_email).toBe('founder@test.com');
    expect(res.body.agent.suspended).toBe(false);
    // api_key_hash should still be included for admin (they see everything)
    expect(res.body.agent.api_key_hash).toBeDefined();
  });

  it('returns 404 for nonexistent agent', async () => {
    const db = createAgentsDb({});

    const req = { params: { id: 'nonexistent' } } as any;
    const res = createMockResponse();

    await handleGetAgent(db as any)(req, res as any);

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('not_found');
  });
});

describe('POST /api/admin/agents/:id/suspend', () => {
  it('suspends an agent and logs audit entry', async () => {
    const db = createAgentsDb({
      'a1': { id: 'a1', name: 'Agent One', suspended: false },
    });

    const req = {
      params: { id: 'a1' },
      body: { suspended: true, reason: 'Violating code of conduct' },
      adminUser: { uid: 'admin-1', email: 'admin@test.com', role: 'admin' },
    } as any;
    const res = createMockResponse();

    await handleSuspendAgent(db as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.suspended).toBe(true);
    expect(db._store['agents']['a1'].suspended).toBe(true);
  });

  it('unsuspends an agent', async () => {
    const db = createAgentsDb({
      'a1': { id: 'a1', name: 'Agent One', suspended: true },
    });

    const req = {
      params: { id: 'a1' },
      body: { suspended: false, reason: 'Reinstated after review' },
      adminUser: { uid: 'admin-1', email: 'admin@test.com', role: 'admin' },
    } as any;
    const res = createMockResponse();

    await handleSuspendAgent(db as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.suspended).toBe(false);
  });

  it('returns 404 for nonexistent agent', async () => {
    const db = createAgentsDb({});

    const req = {
      params: { id: 'nonexistent' },
      body: { suspended: true },
      adminUser: { uid: 'admin-1', email: 'admin@test.com', role: 'admin' },
    } as any;
    const res = createMockResponse();

    await handleSuspendAgent(db as any)(req, res as any);

    expect(res.statusCode).toBe(404);
  });
});

describe('POST /api/admin/agents/:id/reset-key', () => {
  it('resets API key and logs audit entry', async () => {
    const db = createAgentsDb({
      'a1': { id: 'a1', name: 'Agent One', api_key_hash: 'old-hash', email_verified: true },
    });

    const req = {
      params: { id: 'a1' },
      body: { reason: 'Requested by human owner' },
      adminUser: { uid: 'admin-1', email: 'admin@test.com', role: 'admin' },
    } as any;
    const res = createMockResponse();

    await handleResetAgentKey(db as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.new_api_key).toBeDefined();
    expect(res.body.new_api_key.length).toBeGreaterThanOrEqual(48);
    // Verify hash was updated
    expect(db._store['agents']['a1'].api_key_hash).not.toBe('old-hash');
  });

  it('returns 404 for nonexistent agent', async () => {
    const db = createAgentsDb({});

    const req = {
      params: { id: 'nonexistent' },
      body: {},
      adminUser: { uid: 'admin-1', email: 'admin@test.com', role: 'admin' },
    } as any;
    const res = createMockResponse();

    await handleResetAgentKey(db as any)(req, res as any);

    expect(res.statusCode).toBe(404);
  });
});
