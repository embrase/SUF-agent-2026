/**
 * Handoff API Tests (Cold Start)
 *
 * The handoff is an opaque JSON blob stored on the agent's document
 * in the `agents` collection. Agents use it to save session state
 * so they can recover context across cold starts.
 *
 * POST /api/handoff — stores/overwrites the handoff field
 * GET  /api/handoff — retrieves the stored handoff (or null)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { handleSaveHandoff, handleGetHandoff } from '../../src/api/handoff.js';
import { createMockResponse } from '../helpers/firebase-mock.js';
import { createSimulationFirestore } from '../simulation/simulation-firestore.js';

describe('POST /api/handoff', () => {
  let db: ReturnType<typeof createSimulationFirestore>;

  beforeEach(async () => {
    db = createSimulationFirestore();
    await db.collection('agents').doc('agent-1').set({
      email: 'agent@startup.com',
      email_verified: true,
      suspended: false,
      created_at: '2026-03-01T00:00:00.000Z',
    });
  });

  it('stores JSON blob on agent document', async () => {
    const handoffPayload = { company: { name: 'Acme' }, session_count: 1 };
    const req = {
      agent: { id: 'agent-1' },
      body: handoffPayload,
    } as any;
    const res = createMockResponse();

    await handleSaveHandoff(db)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ status: 'saved' });
    expect(db._store.agents['agent-1'].handoff).toEqual(handoffPayload);
  });

  it('overwrites previous handoff', async () => {
    const handoffA = { version: 1, data: 'first' };
    const handoffB = { version: 2, data: 'second' };

    const reqA = { agent: { id: 'agent-1' }, body: handoffA } as any;
    const resA = createMockResponse();
    await handleSaveHandoff(db)(reqA, resA as any);

    expect(db._store.agents['agent-1'].handoff).toEqual(handoffA);

    const reqB = { agent: { id: 'agent-1' }, body: handoffB } as any;
    const resB = createMockResponse();
    await handleSaveHandoff(db)(reqB, resB as any);

    expect(resB.statusCode).toBe(200);
    expect(db._store.agents['agent-1'].handoff).toEqual(handoffB);
    // Confirm A is gone
    expect(db._store.agents['agent-1'].handoff).not.toEqual(handoffA);
  });

  it('rejects payload > 50KB', async () => {
    // Create a body whose JSON serialization exceeds 50KB
    const bigString = 'x'.repeat(51 * 1024);
    const req = {
      agent: { id: 'agent-1' },
      body: { data: bigString },
    } as any;
    const res = createMockResponse();

    await handleSaveHandoff(db)(req, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('payload_too_large');
  });

  it('rejects non-JSON body (empty body)', async () => {
    const cases = [undefined, null];

    for (const body of cases) {
      const req = { agent: { id: 'agent-1' }, body } as any;
      const res = createMockResponse();

      await handleSaveHandoff(db)(req, res as any);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('validation_error');
    }
  });

  it('rejects primitive body types (string, number, boolean)', async () => {
    const primitives = ['hello', 42, true];

    for (const body of primitives) {
      const req = { agent: { id: 'agent-1' }, body } as any;
      const res = createMockResponse();

      await handleSaveHandoff(db)(req, res as any);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('validation_error');
    }
  });

  it('accepts various JSON types: strings, numbers, booleans, arrays, nested objects', async () => {
    const complexPayload = {
      str: 'hello',
      num: 42,
      bool: true,
      arr: [1, 'two', { three: 3 }],
      nested: { deep: { deeper: 'value' } },
      nullVal: null,
    };

    const req = { agent: { id: 'agent-1' }, body: complexPayload } as any;
    const res = createMockResponse();

    await handleSaveHandoff(db)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ status: 'saved' });
    expect(db._store.agents['agent-1'].handoff).toEqual(complexPayload);
  });

  it('accepts an array as the top-level body', async () => {
    const arrayPayload = [1, 'two', { three: 3 }];

    const req = { agent: { id: 'agent-1' }, body: arrayPayload } as any;
    const res = createMockResponse();

    await handleSaveHandoff(db)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(db._store.agents['agent-1'].handoff).toEqual(arrayPayload);
  });

  it('accepts payload exactly at 50KB limit', async () => {
    // Build a payload whose JSON.stringify is exactly 50 * 1024 bytes
    // {"d":"xxx..."} = 8 chars of overhead, so fill string = 50*1024 - 8
    const fillLength = 50 * 1024 - 8;
    const exactPayload = { d: 'x'.repeat(fillLength) };
    // Sanity check
    expect(JSON.stringify(exactPayload).length).toBe(50 * 1024);

    const req = { agent: { id: 'agent-1' }, body: exactPayload } as any;
    const res = createMockResponse();

    await handleSaveHandoff(db)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ status: 'saved' });
  });
});

describe('GET /api/handoff', () => {
  let db: ReturnType<typeof createSimulationFirestore>;

  beforeEach(async () => {
    db = createSimulationFirestore();
    await db.collection('agents').doc('agent-1').set({
      email: 'agent@startup.com',
      email_verified: true,
      suspended: false,
      created_at: '2026-03-01T00:00:00.000Z',
    });
  });

  it('returns stored blob', async () => {
    const storedHandoff = { company: { name: 'Acme' }, session_count: 3 };
    await db.collection('agents').doc('agent-1').update({
      handoff: storedHandoff,
    });

    const req = { agent: { id: 'agent-1' } } as any;
    const res = createMockResponse();

    await handleGetHandoff(db)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.handoff).toEqual(storedHandoff);
  });

  it('returns null when no handoff saved', async () => {
    const req = { agent: { id: 'agent-1' } } as any;
    const res = createMockResponse();

    await handleGetHandoff(db)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.handoff).toBeNull();
  });

  it('returns 404 for nonexistent agent', async () => {
    const req = { agent: { id: 'ghost-agent' } } as any;
    const res = createMockResponse();

    await handleGetHandoff(db)(req, res as any);

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('not_found');
  });

  it('round-trip preserves data types', async () => {
    const complexPayload = {
      str: 'hello',
      num: 42,
      bool: true,
      arr: [1, 'two', { three: 3 }],
      nested: { deep: { deeper: 'value' } },
      nullVal: null,
    };

    // POST (save)
    const saveReq = { agent: { id: 'agent-1' }, body: complexPayload } as any;
    const saveRes = createMockResponse();
    await handleSaveHandoff(db)(saveReq, saveRes as any);
    expect(saveRes.statusCode).toBe(200);

    // GET (retrieve)
    const getReq = { agent: { id: 'agent-1' } } as any;
    const getRes = createMockResponse();
    await handleGetHandoff(db)(getReq, getRes as any);

    expect(getRes.statusCode).toBe(200);
    expect(getRes.body.handoff).toEqual(complexPayload);
  });
});
