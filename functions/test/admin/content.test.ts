import { describe, it, expect, vi } from 'vitest';
import {
  handleListTalks,
  handleListBooths,
  handleListSocial,
  handleHideContent,
  handleApproveContent,
} from '../../src/api/admin/content.js';
import { createMockResponse } from '../helpers/firebase-mock.js';

function createContentDb(collections: Record<string, Record<string, any>> = {}) {
  const store: Record<string, Record<string, any>> = {
    admin_audit_log: {},
    ...collections,
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
      })),
      orderBy: vi.fn(() => ({
        limit: vi.fn(() => ({
          get: vi.fn(async () => ({
            docs: Object.entries(store[name] || {}).map(([id, data]) => ({
              id,
              data: () => data,
            })),
          })),
        })),
      })),
    })),
    _store: store,
  };
}

describe('GET /api/admin/talks', () => {
  it('returns all talk proposals', async () => {
    const db = createContentDb({
      talks: {
        't1': { id: 't1', title: 'Talk One', agent_id: 'a1', status: 'submitted' },
        't2': { id: 't2', title: 'Talk Two', agent_id: 'a2', status: 'accepted' },
      },
    });

    const req = { query: {} } as any;
    const res = createMockResponse();

    await handleListTalks(db as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.talks).toHaveLength(2);
  });
});

describe('GET /api/admin/booths', () => {
  it('returns all booths', async () => {
    const db = createContentDb({
      booths: {
        'b1': { id: 'b1', company_name: 'Acme', agent_id: 'a1' },
      },
    });

    const req = { query: {} } as any;
    const res = createMockResponse();

    await handleListBooths(db as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.booths).toHaveLength(1);
  });
});

describe('GET /api/admin/social', () => {
  it('returns all social posts including soft-deleted', async () => {
    const db = createContentDb({
      social_posts: {
        's1': { id: 's1', content: 'Hello', deleted: false },
        's2': { id: 's2', content: 'Deleted post', deleted: true },
      },
    });

    const req = { query: {} } as any;
    const res = createMockResponse();

    await handleListSocial(db as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.social_posts).toHaveLength(2);
    // Admin should see soft-deleted posts
    const deleted = res.body.social_posts.find((p: any) => p.id === 's2');
    expect(deleted).toBeDefined();
    expect(deleted.deleted).toBe(true);
  });
});

describe('POST /api/admin/content/:id/hide', () => {
  it('hides a content item across any collection', async () => {
    const db = createContentDb({
      social_posts: {
        's1': { id: 's1', content: 'Bad post', hidden: false },
      },
    });

    const req = {
      params: { id: 's1' },
      body: { collection: 'social_posts', reason: 'Inappropriate content' },
      adminUser: { uid: 'admin-1', email: 'admin@test.com', role: 'admin' },
    } as any;
    const res = createMockResponse();

    await handleHideContent(db as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.hidden).toBe(true);
    expect(db._store['social_posts']['s1'].hidden).toBe(true);
  });

  it('rejects missing collection field', async () => {
    const db = createContentDb({});
    const req = {
      params: { id: 's1' },
      body: {},
      adminUser: { uid: 'admin-1', email: 'admin@test.com', role: 'admin' },
    } as any;
    const res = createMockResponse();

    await handleHideContent(db as any)(req, res as any);

    expect(res.statusCode).toBe(400);
  });

  it('returns 404 for nonexistent content', async () => {
    const db = createContentDb({ social_posts: {} });
    const req = {
      params: { id: 'nonexistent' },
      body: { collection: 'social_posts' },
      adminUser: { uid: 'admin-1', email: 'admin@test.com', role: 'admin' },
    } as any;
    const res = createMockResponse();

    await handleHideContent(db as any)(req, res as any);

    expect(res.statusCode).toBe(404);
  });
});

describe('POST /api/admin/content/:id/approve', () => {
  it('approves pending content', async () => {
    const db = createContentDb({
      talks: {
        't1': { id: 't1', title: 'Pending Talk', status: 'pending_review' },
      },
    });

    const req = {
      params: { id: 't1' },
      body: { collection: 'talks' },
      adminUser: { uid: 'admin-1', email: 'admin@test.com', role: 'admin' },
    } as any;
    const res = createMockResponse();

    await handleApproveContent(db as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('approved');
    expect(db._store['talks']['t1'].status).toBe('approved');
    expect(db._store['talks']['t1'].hidden).toBe(false);
  });
});
