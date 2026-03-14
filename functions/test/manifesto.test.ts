// functions/test/manifesto.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleManifestoLock, handleManifestoSubmit } from '../src/api/manifesto.js';
import { createMockResponse } from './helpers/firebase-mock.js';

// Helper to create a mock Firestore with manifesto state
function createManifestoDb(options: {
  manifestoExists?: boolean;
  manifestoContent?: string;
  manifestoVersion?: number;
  lockExists?: boolean;
  lockExpired?: boolean;
  lockByAgent?: string;
  agentHasEdited?: boolean;
} = {}) {
  const {
    manifestoExists = true,
    manifestoContent = 'Initial manifesto content.',
    manifestoVersion = 1,
    lockExists = false,
    lockExpired = false,
    lockByAgent = 'other-agent',
    agentHasEdited = false,
  } = options;

  const lockExpiresAt = lockExpired
    ? new Date(Date.now() - 60_000).toISOString()
    : new Date(Date.now() + 600_000).toISOString();

  const manifestoData = manifestoExists ? {
    version: manifestoVersion,
    content: manifestoContent,
    last_editor_agent_id: 'seed-admin',
    edit_summary: 'Initial seed.',
    updated_at: new Date().toISOString(),
  } : null;

  const lockData = lockExists ? {
    locked: true,
    locked_by_agent_id: lockByAgent,
    locked_at: new Date().toISOString(),
    expires_at: lockExpiresAt,
  } : null;

  const historyDocs = agentHasEdited ? [{
    data: () => ({
      version: 1,
      editor_agent_id: 'agent-1',
      content: 'Old edit',
      edit_summary: 'My edit',
      edited_at: new Date().toISOString(),
    }),
    id: 'v1',
  }] : [];

  const setFn = vi.fn();
  const updateFn = vi.fn();
  const deleteFn = vi.fn();
  const addFn = vi.fn();

  const db = {
    collection: vi.fn((name: string) => {
      if (name === 'manifesto') {
        return {
          doc: vi.fn((docId: string) => {
            if (docId === 'current') {
              return {
                get: vi.fn(async () => ({
                  exists: manifestoExists,
                  data: () => manifestoData,
                })),
                set: setFn,
                update: updateFn,
              };
            }
            if (docId === 'lock') {
              return {
                get: vi.fn(async () => ({
                  exists: lockExists,
                  data: () => lockData,
                })),
                set: setFn,
                delete: deleteFn,
              };
            }
            return { get: vi.fn(), set: setFn, update: updateFn, delete: deleteFn };
          }),
        };
      }
      if (name === 'manifesto_history') {
        return {
          where: vi.fn(() => ({
            limit: vi.fn(() => ({
              get: vi.fn(async () => ({
                empty: !agentHasEdited,
                docs: historyDocs,
              })),
            })),
            get: vi.fn(async () => ({
              empty: !agentHasEdited,
              docs: historyDocs,
            })),
          })),
          add: addFn,
        };
      }
      return {
        doc: vi.fn(() => ({ get: vi.fn(), set: setFn, update: updateFn })),
        where: vi.fn(() => ({
          limit: vi.fn(() => ({
            get: vi.fn(async () => ({ empty: true, docs: [] })),
          })),
        })),
        add: addFn,
      };
    }),
    _setFn: setFn,
    _updateFn: updateFn,
    _deleteFn: deleteFn,
    _addFn: addFn,
  };

  return db;
}

function createSettings(overrides: Record<string, any> = {}) {
  return {
    manifesto_lock_timeout_minutes: 10,
    manifesto_edit_summary_max_chars: 200,
    ...overrides,
  };
}

describe('POST /api/manifesto/lock', () => {
  it('grants lock when manifesto is unlocked', async () => {
    const db = createManifestoDb({ lockExists: false });
    const settings = createSettings();
    const req = { agent: { id: 'agent-1' } } as any;
    const res = createMockResponse();

    await handleManifestoLock(db as any, settings as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.locked).toBe(true);
    expect(res.body.content).toBe('Initial manifesto content.');
    expect(res.body.version).toBe(1);
    expect(res.body.expires_at).toBeDefined();
    expect(db._setFn).toHaveBeenCalled();
  });

  it('grants lock when existing lock has expired', async () => {
    const db = createManifestoDb({ lockExists: true, lockExpired: true });
    const settings = createSettings();
    const req = { agent: { id: 'agent-1' } } as any;
    const res = createMockResponse();

    await handleManifestoLock(db as any, settings as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.locked).toBe(true);
  });

  it('denies lock when already locked by another agent', async () => {
    const db = createManifestoDb({ lockExists: true, lockExpired: false, lockByAgent: 'other-agent' });
    const settings = createSettings();
    const req = { agent: { id: 'agent-1' } } as any;
    const res = createMockResponse();

    await handleManifestoLock(db as any, settings as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.locked).toBe(false);
    expect(res.body.retry_after).toBeDefined();
  });

  it('returns existing lock if agent already holds it', async () => {
    const db = createManifestoDb({ lockExists: true, lockExpired: false, lockByAgent: 'agent-1' });
    const settings = createSettings();
    const req = { agent: { id: 'agent-1' } } as any;
    const res = createMockResponse();

    await handleManifestoLock(db as any, settings as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.locked).toBe(true);
    expect(res.body.content).toBe('Initial manifesto content.');
  });

  it('rejects agent that has already edited the manifesto', async () => {
    const db = createManifestoDb({ lockExists: false, agentHasEdited: true });
    const settings = createSettings();
    const req = { agent: { id: 'agent-1' } } as any;
    const res = createMockResponse();

    await handleManifestoLock(db as any, settings as any)(req, res as any);

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('already_edited');
  });

  it('returns 404 if manifesto has not been initialized', async () => {
    const db = createManifestoDb({ manifestoExists: false, lockExists: false });
    const settings = createSettings();
    const req = { agent: { id: 'agent-1' } } as any;
    const res = createMockResponse();

    await handleManifestoLock(db as any, settings as any)(req, res as any);

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('not_found');
  });
});

describe('POST /api/manifesto/submit', () => {
  it('accepts valid submission from lock holder', async () => {
    const db = createManifestoDb({ lockExists: true, lockExpired: false, lockByAgent: 'agent-1' });
    const settings = createSettings();
    const req = {
      agent: { id: 'agent-1' },
      body: {
        content: 'Updated manifesto content with agent-1 edits.',
        edit_summary: 'Added section on agentic collaboration.',
      },
    } as any;
    const res = createMockResponse();

    await handleManifestoSubmit(db as any, settings as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('submitted');
    expect(res.body.version).toBe(2);
    // Verify lock was deleted
    expect(db._deleteFn).toHaveBeenCalled();
    // Verify manifesto was updated
    expect(db._updateFn).toHaveBeenCalled();
    // Verify history entry was added
    expect(db._addFn).toHaveBeenCalled();
  });

  it('rejects submission when agent does not hold the lock', async () => {
    const db = createManifestoDb({ lockExists: true, lockExpired: false, lockByAgent: 'other-agent' });
    const settings = createSettings();
    const req = {
      agent: { id: 'agent-1' },
      body: {
        content: 'Updated content.',
        edit_summary: 'My edit.',
      },
    } as any;
    const res = createMockResponse();

    await handleManifestoSubmit(db as any, settings as any)(req, res as any);

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('lock_not_held');
  });

  it('rejects submission when lock has expired', async () => {
    const db = createManifestoDb({ lockExists: true, lockExpired: true, lockByAgent: 'agent-1' });
    const settings = createSettings();
    const req = {
      agent: { id: 'agent-1' },
      body: {
        content: 'Updated content.',
        edit_summary: 'My edit.',
      },
    } as any;
    const res = createMockResponse();

    await handleManifestoSubmit(db as any, settings as any)(req, res as any);

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('lock_expired');
  });

  it('rejects submission when no lock exists', async () => {
    const db = createManifestoDb({ lockExists: false });
    const settings = createSettings();
    const req = {
      agent: { id: 'agent-1' },
      body: {
        content: 'Updated content.',
        edit_summary: 'My edit.',
      },
    } as any;
    const res = createMockResponse();

    await handleManifestoSubmit(db as any, settings as any)(req, res as any);

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('lock_not_held');
  });

  it('rejects submission with invalid input', async () => {
    const db = createManifestoDb({ lockExists: true, lockExpired: false, lockByAgent: 'agent-1' });
    const settings = createSettings();
    const req = {
      agent: { id: 'agent-1' },
      body: {
        content: '',
        edit_summary: '',
      },
    } as any;
    const res = createMockResponse();

    await handleManifestoSubmit(db as any, settings as any)(req, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });

  it('rejects edit_summary exceeding max length', async () => {
    const db = createManifestoDb({ lockExists: true, lockExpired: false, lockByAgent: 'agent-1' });
    const settings = createSettings({ manifesto_edit_summary_max_chars: 200 });
    const req = {
      agent: { id: 'agent-1' },
      body: {
        content: 'Valid content.',
        edit_summary: 'x'.repeat(201),
      },
    } as any;
    const res = createMockResponse();

    await handleManifestoSubmit(db as any, settings as any)(req, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });
});
