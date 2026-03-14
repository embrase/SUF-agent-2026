import { describe, it, expect, vi } from 'vitest';
import {
  handleListModeration,
  handleModerationApprove,
  handleModerationReject,
} from '../../src/api/admin/moderation.js';
import { createMockResponse } from '../helpers/firebase-mock.js';

function createModerationDb(items: Record<string, any> = {}, collectionItems: Record<string, Record<string, any>> = {}) {
  const store: Record<string, Record<string, any>> = {
    moderation_queue: items,
    admin_audit_log: {},
    ...collectionItems,
  };

  return {
    collection: vi.fn((name: string) => ({
      doc: vi.fn((id: string) => ({
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
        delete: vi.fn(async () => {
          if (store[name]) delete store[name][id];
        }),
      })),
      where: vi.fn((field: string, op: string, value: any) => ({
        orderBy: vi.fn(() => ({
          limit: vi.fn(() => ({
            get: vi.fn(async () => {
              const docs = Object.entries(store[name] || {})
                .filter(([_, data]) => {
                  if (op === '==') return data[field] === value;
                  return true;
                })
                .map(([id, data]) => ({
                  id,
                  data: () => data,
                }));
              return { docs };
            }),
          })),
        })),
      })),
    })),
    _store: store,
  };
}

describe('GET /api/admin/moderation', () => {
  it('returns items pending review', async () => {
    const db = createModerationDb({
      'm1': {
        id: 'm1',
        collection: 'talks',
        document_id: 't1',
        status: 'pending_review',
        content_snapshot: { title: 'My Talk' },
        submitted_at: { toDate: () => new Date() },
      },
      'm2': {
        id: 'm2',
        collection: 'social_posts',
        document_id: 's1',
        status: 'pending_review',
        content_snapshot: { content: 'Hello' },
        submitted_at: { toDate: () => new Date() },
      },
    });

    const req = { query: {} } as any;
    const res = createMockResponse();

    await handleListModeration(db as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.items).toBeDefined();
    expect(res.body.items).toHaveLength(2);
  });

  it('returns empty array when no pending items', async () => {
    const db = createModerationDb({});
    const req = { query: {} } as any;
    const res = createMockResponse();

    await handleListModeration(db as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.items).toHaveLength(0);
  });
});

describe('POST /api/admin/moderation/:id/approve', () => {
  it('approves item and updates source document', async () => {
    const db = createModerationDb(
      {
        'm1': {
          id: 'm1',
          collection: 'talks',
          document_id: 't1',
          status: 'pending_review',
          content_snapshot: { title: 'My Talk' },
        },
      },
      {
        talks: {
          't1': { id: 't1', title: 'My Talk', status: 'pending_review' },
        },
      }
    );

    const req = {
      params: { id: 'm1' },
      body: {},
      adminUser: { uid: 'admin-1', email: 'admin@test.com', role: 'moderator' },
    } as any;
    const res = createMockResponse();

    await handleModerationApprove(db as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('approved');
    // Source document should be updated
    expect(db._store['talks']['t1'].status).toBe('approved');
    // Moderation queue item should be updated
    expect(db._store['moderation_queue']['m1'].status).toBe('approved');
  });

  it('returns 404 for nonexistent moderation item', async () => {
    const db = createModerationDb({});
    const req = {
      params: { id: 'nonexistent' },
      body: {},
      adminUser: { uid: 'admin-1', email: 'admin@test.com', role: 'moderator' },
    } as any;
    const res = createMockResponse();

    await handleModerationApprove(db as any)(req, res as any);

    expect(res.statusCode).toBe(404);
  });
});

describe('POST /api/admin/moderation/:id/reject', () => {
  it('rejects item and updates source document', async () => {
    const db = createModerationDb(
      {
        'm1': {
          id: 'm1',
          collection: 'social_posts',
          document_id: 's1',
          status: 'pending_review',
        },
      },
      {
        social_posts: {
          's1': { id: 's1', content: 'Bad content', status: 'pending_review' },
        },
      }
    );

    const req = {
      params: { id: 'm1' },
      body: { reason: 'Violates code of conduct' },
      adminUser: { uid: 'admin-1', email: 'admin@test.com', role: 'moderator' },
    } as any;
    const res = createMockResponse();

    await handleModerationReject(db as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('rejected');
    expect(db._store['social_posts']['s1'].status).toBe('rejected');
    expect(db._store['social_posts']['s1'].hidden).toBe(true);
    expect(db._store['moderation_queue']['m1'].status).toBe('rejected');
  });
});
