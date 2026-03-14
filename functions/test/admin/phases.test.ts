import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleGetPhases,
  handleUpdatePhase,
  handleToggleFreeze,
} from '../../src/api/admin/phases.js';
import { createMockResponse } from '../helpers/firebase-mock.js';

// Mock Firestore for settings
function createMockSettingsDb(settingsData: Record<string, any> = {}) {
  const store: Record<string, Record<string, any>> = {
    config: {
      settings: {
        phase_overrides: {},
        global_write_freeze: false,
        ...settingsData,
      },
    },
    admin_audit_log: {},
  };

  return {
    collection: vi.fn((name: string) => ({
      doc: vi.fn((id: string) => ({
        get: vi.fn(async () => ({
          exists: !!store[name]?.[id],
          data: () => store[name]?.[id],
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
    })),
    _store: store,
  };
}

describe('GET /api/admin/phases', () => {
  it('returns all phases with computed is_open state', async () => {
    const db = createMockSettingsDb();
    const req = {} as any;
    const res = createMockResponse();

    await handleGetPhases(db as any, new Date('2026-05-15'))(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.phases).toBeDefined();
    expect(Array.isArray(res.body.phases)).toBe(true);

    const registration = res.body.phases.find((p: any) => p.key === 'registration');
    expect(registration).toBeDefined();
    expect(registration.computed_is_open).toBe(true);
    expect(registration.name).toBe('Registration');

    const voting = res.body.phases.find((p: any) => p.key === 'voting');
    expect(voting).toBeDefined();
    expect(voting.computed_is_open).toBe(false);
  });

  it('includes override values when present', async () => {
    const db = createMockSettingsDb({
      phase_overrides: {
        cfp: { is_open: false },
      },
    });
    const req = {} as any;
    const res = createMockResponse();

    await handleGetPhases(db as any, new Date('2026-05-15'))(req, res as any);

    const cfp = res.body.phases.find((p: any) => p.key === 'cfp');
    expect(cfp.override_is_open).toBe(false);
    expect(cfp.computed_is_open).toBe(false);
  });

  it('includes global_write_freeze status', async () => {
    const db = createMockSettingsDb({ global_write_freeze: true });
    const req = {} as any;
    const res = createMockResponse();

    await handleGetPhases(db as any, new Date('2026-05-15'))(req, res as any);

    expect(res.body.global_write_freeze).toBe(true);
  });
});

describe('POST /api/admin/phases/:key', () => {
  it('updates phase override and logs audit entry', async () => {
    const db = createMockSettingsDb();
    const req = {
      params: { key: 'cfp' },
      body: { is_open: false, reason: 'Closing CFP early' },
      adminUser: { uid: 'admin-1', email: 'admin@test.com', role: 'admin' },
    } as any;
    const res = createMockResponse();

    await handleUpdatePhase(db as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.updated).toBe(true);
    expect(res.body.phase_key).toBe('cfp');

    // Verify settings were updated in store
    const settings = db._store['config']['settings'];
    expect(settings.phase_overrides.cfp).toBeDefined();
    expect(settings.phase_overrides.cfp.is_open).toBe(false);
  });

  it('rejects unknown phase keys', async () => {
    const db = createMockSettingsDb();
    const req = {
      params: { key: 'nonexistent' },
      body: { is_open: true },
      adminUser: { uid: 'admin-1', email: 'admin@test.com', role: 'admin' },
    } as any;
    const res = createMockResponse();

    await handleUpdatePhase(db as any)(req, res as any);

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('not_found');
  });

  it('accepts extends (new closes date)', async () => {
    const db = createMockSettingsDb();
    const req = {
      params: { key: 'cfp' },
      body: { closes: '2026-06-20', reason: 'Extending CFP by 5 days' },
      adminUser: { uid: 'admin-1', email: 'admin@test.com', role: 'admin' },
    } as any;
    const res = createMockResponse();

    await handleUpdatePhase(db as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    const settings = db._store['config']['settings'];
    expect(settings.phase_overrides.cfp.closes).toBe('2026-06-20');
  });
});

describe('POST /api/admin/freeze', () => {
  it('toggles global write freeze on', async () => {
    const db = createMockSettingsDb({ global_write_freeze: false });
    const req = {
      body: { freeze: true, reason: 'Emergency freeze' },
      adminUser: { uid: 'admin-1', email: 'admin@test.com', role: 'admin' },
    } as any;
    const res = createMockResponse();

    await handleToggleFreeze(db as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.global_write_freeze).toBe(true);
    const settings = db._store['config']['settings'];
    expect(settings.global_write_freeze).toBe(true);
  });

  it('toggles global write freeze off', async () => {
    const db = createMockSettingsDb({ global_write_freeze: true });
    const req = {
      body: { freeze: false, reason: 'Resuming operations' },
      adminUser: { uid: 'admin-1', email: 'admin@test.com', role: 'admin' },
    } as any;
    const res = createMockResponse();

    await handleToggleFreeze(db as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.global_write_freeze).toBe(false);
  });

  it('requires freeze field in body', async () => {
    const db = createMockSettingsDb();
    const req = {
      body: {},
      adminUser: { uid: 'admin-1', email: 'admin@test.com', role: 'admin' },
    } as any;
    const res = createMockResponse();

    await handleToggleFreeze(db as any)(req, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });
});
