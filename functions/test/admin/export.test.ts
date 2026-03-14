import { describe, it, expect, vi } from 'vitest';
import { handleExport } from '../../src/api/admin/export.js';
import { createMockResponse } from '../helpers/firebase-mock.js';

function createExportDb(collections: Record<string, Record<string, any>> = {}) {
  const store: Record<string, Record<string, any>> = {
    admin_audit_log: {},
    ...collections,
  };

  return {
    collection: vi.fn((name: string) => ({
      doc: vi.fn((id: string) => ({
        set: vi.fn(async (data: any) => {
          if (!store[name]) store[name] = {};
          store[name][id] = data;
        }),
      })),
      get: vi.fn(async () => ({
        docs: Object.entries(store[name] || {}).map(([id, data]) => ({
          id,
          data: () => data,
        })),
        size: Object.keys(store[name] || {}).length,
      })),
    })),
    _store: store,
  };
}

describe('GET /api/admin/export/:collection', () => {
  it('exports agents collection as JSON', async () => {
    const db = createExportDb({
      agents: {
        'a1': { id: 'a1', name: 'Agent One', suspended: false },
        'a2': { id: 'a2', name: 'Agent Two', suspended: true },
      },
    });

    const req = {
      params: { collection: 'agents' },
      adminUser: { uid: 'admin-1', email: 'admin@test.com', role: 'admin' },
    } as any;
    const res = createMockResponse();

    await handleExport(db as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.collection).toBe('agents');
    expect(res.body.count).toBe(2);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.exported_at).toBeDefined();
  });

  it('exports talks collection', async () => {
    const db = createExportDb({
      talks: {
        't1': { id: 't1', title: 'Talk One' },
      },
    });

    const req = {
      params: { collection: 'talks' },
      adminUser: { uid: 'admin-1', email: 'admin@test.com', role: 'admin' },
    } as any;
    const res = createMockResponse();

    await handleExport(db as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.collection).toBe('talks');
    expect(res.body.count).toBe(1);
  });

  it('exports votes collection', async () => {
    const db = createExportDb({
      votes: {
        'v1': { agent_id: 'a1', proposal_id: 't1', score: 85 },
      },
    });

    const req = {
      params: { collection: 'votes' },
      adminUser: { uid: 'admin-1', email: 'admin@test.com', role: 'admin' },
    } as any;
    const res = createMockResponse();

    await handleExport(db as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.collection).toBe('votes');
  });

  it('rejects invalid collection names', async () => {
    const db = createExportDb({});

    const req = {
      params: { collection: 'passwords' },
      adminUser: { uid: 'admin-1', email: 'admin@test.com', role: 'admin' },
    } as any;
    const res = createMockResponse();

    await handleExport(db as any)(req, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });

  it('returns empty data for empty collection', async () => {
    const db = createExportDb({ agents: {} });

    const req = {
      params: { collection: 'agents' },
      adminUser: { uid: 'admin-1', email: 'admin@test.com', role: 'admin' },
    } as any;
    const res = createMockResponse();

    await handleExport(db as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveLength(0);
    expect(res.body.count).toBe(0);
  });
});
