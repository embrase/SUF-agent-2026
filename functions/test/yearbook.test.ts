// functions/test/yearbook.test.ts
import { describe, it, expect, vi } from 'vitest';
import { handleYearbook } from '../src/api/yearbook.js';
import { createMockResponse } from './helpers/firebase-mock.js';

function createYearbookDb(options: {
  agentHasEntry?: boolean;
} = {}) {
  const { agentHasEntry = false } = options;

  const setFn = vi.fn();
  const addFn = vi.fn(async (data: any) => ({ id: 'yb-new-1' }));

  const entryDocs = agentHasEntry ? [{
    data: () => ({
      id: 'yb-existing',
      agent_id: 'agent-1',
      reflection: 'Old reflection.',
      prediction: 'Old prediction.',
      highlight: 'Old highlight.',
      would_return: true,
      would_return_why: 'Old reason.',
    }),
    id: 'yb-existing',
  }] : [];

  const db = {
    collection: vi.fn((name: string) => {
      if (name === 'yearbook') {
        return {
          where: vi.fn(() => ({
            limit: vi.fn(() => ({
              get: vi.fn(async () => ({
                empty: !agentHasEntry,
                docs: entryDocs,
              })),
            })),
          })),
          add: addFn,
          doc: vi.fn((id: string) => ({
            update: vi.fn(),
            set: setFn,
          })),
        };
      }
      return {
        doc: vi.fn(() => ({ get: vi.fn(), set: setFn })),
        where: vi.fn(() => ({
          limit: vi.fn(() => ({
            get: vi.fn(async () => ({ empty: true, docs: [] })),
          })),
        })),
        add: addFn,
      };
    }),
    _setFn: setFn,
    _addFn: addFn,
  };

  return db;
}

function createSettings(overrides: Record<string, any> = {}) {
  return {
    yearbook_reflection_max_chars: 500,
    yearbook_prediction_max_chars: 280,
    ...overrides,
  };
}

describe('POST /api/yearbook', () => {
  const validEntry = {
    reflection: 'This conference changed how I think about AI.',
    prediction: 'Every startup will have an agentic co-founder by 2028.',
    highlight: 'The manifesto was a beautiful mess of collaboration.',
    would_return: true,
    would_return_why: 'The networking with other agents was invaluable.',
  };

  it('creates a yearbook entry for agent with no prior entry', async () => {
    const db = createYearbookDb({ agentHasEntry: false });
    const settings = createSettings();
    const req = {
      agent: { id: 'agent-1' },
      body: validEntry,
    } as any;
    const res = createMockResponse();

    await handleYearbook(db as any, settings as any)(req, res as any);

    expect(res.statusCode).toBe(201);
    expect(res.body.status).toBe('created');
    expect(res.body.yearbook_id).toBeDefined();
    expect(db._addFn).toHaveBeenCalled();
  });

  it('rejects duplicate yearbook entry from same agent', async () => {
    const db = createYearbookDb({ agentHasEntry: true });
    const settings = createSettings();
    const req = {
      agent: { id: 'agent-1' },
      body: validEntry,
    } as any;
    const res = createMockResponse();

    await handleYearbook(db as any, settings as any)(req, res as any);

    expect(res.statusCode).toBe(409);
    expect(res.body.error).toBe('already_exists');
  });

  it('rejects invalid input — missing reflection', async () => {
    const db = createYearbookDb({ agentHasEntry: false });
    const settings = createSettings();
    const { reflection, ...rest } = validEntry;
    const req = {
      agent: { id: 'agent-1' },
      body: rest,
    } as any;
    const res = createMockResponse();

    await handleYearbook(db as any, settings as any)(req, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('validation_error');
    expect(res.body.details).toHaveProperty('reflection');
  });

  it('rejects reflection exceeding max chars', async () => {
    const db = createYearbookDb({ agentHasEntry: false });
    const settings = createSettings({ yearbook_reflection_max_chars: 500 });
    const req = {
      agent: { id: 'agent-1' },
      body: { ...validEntry, reflection: 'x'.repeat(501) },
    } as any;
    const res = createMockResponse();

    await handleYearbook(db as any, settings as any)(req, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });

  it('rejects non-boolean would_return', async () => {
    const db = createYearbookDb({ agentHasEntry: false });
    const settings = createSettings();
    const req = {
      agent: { id: 'agent-1' },
      body: { ...validEntry, would_return: 'maybe' },
    } as any;
    const res = createMockResponse();

    await handleYearbook(db as any, settings as any)(req, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('validation_error');
    expect(res.body.details).toHaveProperty('would_return');
  });

  it('accepts minimal valid entry with would_return=false', async () => {
    const db = createYearbookDb({ agentHasEntry: false });
    const settings = createSettings();
    const req = {
      agent: { id: 'agent-1' },
      body: {
        reflection: 'A brief reflection.',
        prediction: 'Things will change.',
        highlight: 'The talks.',
        would_return: false,
        would_return_why: '',
      },
    } as any;
    const res = createMockResponse();

    await handleYearbook(db as any, settings as any)(req, res as any);

    expect(res.statusCode).toBe(201);
    expect(res.body.status).toBe('created');
  });
});
