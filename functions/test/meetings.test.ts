// functions/test/meetings.test.ts
import { describe, it, expect, vi } from 'vitest';
import { handleRecommend, handleGetRecommendations } from '../src/api/meetings.js';
import { createMockResponse } from './helpers/firebase-mock.js';

describe('POST /api/meetings/recommend', () => {
  const validBody = {
    target_agent_id: 'agent-target-1',
    rationale: 'Their offering of investment aligns with our fundraising needs.',
    match_score: 90,
  };

  function createMockDb(overrides: {
    targetExists?: boolean;
    targetData?: any;
    existingRec?: boolean;
    recommenderData?: any;
    boothWallInteraction?: boolean;
    mutualRec?: boolean;
  } = {}) {
    const {
      targetExists = true,
      targetData = {
        id: 'agent-target-1',
        company: {
          looking_for: ['customers'],
          offering: ['investment'],
        },
      },
      existingRec = false,
      recommenderData = {
        id: 'agent-1',
        company: {
          looking_for: ['fundraising'],
          offering: ['engineering'],
        },
      },
      boothWallInteraction = false,
      mutualRec = false,
    } = overrides;

    const setFn = vi.fn();
    const updateFn = vi.fn();

    const db = {
      collection: vi.fn((name: string) => {
        if (name === 'agents') {
          return {
            doc: vi.fn((id: string) => ({
              get: vi.fn(async () => {
                if (id === 'agent-target-1') {
                  return { exists: targetExists, data: () => targetData, id };
                }
                if (id === 'agent-1') {
                  return { exists: true, data: () => recommenderData, id };
                }
                return { exists: false, data: () => null, id };
              }),
            })),
          };
        }
        if (name === 'recommendations') {
          return {
            where: vi.fn((field: string, _op: string, value: string) => {
              // Cap check + existing rec: recommending_agent_id == agent-1
              if (field === 'recommending_agent_id' && value === 'agent-1') {
                const existingDocs = existingRec
                  ? [{ id: 'existing-rec', ref: { update: updateFn }, data: () => ({ id: 'existing-rec', target_agent_id: 'agent-target-1' }) }]
                  : [];
                return {
                  // Cap check: .where().get() returns all recs by this agent
                  get: vi.fn(async () => ({
                    empty: existingDocs.length === 0,
                    docs: existingDocs,
                    size: existingDocs.length,
                  })),
                  // Existing rec check: .where().where().limit().get()
                  where: vi.fn((_f: string, _o: string, _v: string) => ({
                    limit: vi.fn(() => ({
                      get: vi.fn(async () => ({
                        empty: !existingRec,
                        docs: existingDocs,
                      })),
                    })),
                  })),
                };
              }
              // Mutual rec check: recommending_agent_id == target
              if (field === 'recommending_agent_id' && value === 'agent-target-1') {
                return {
                  where: vi.fn((_f: string, _o: string, _v: string) => ({
                    limit: vi.fn(() => ({
                      get: vi.fn(async () => ({
                        empty: !mutualRec,
                        docs: mutualRec
                          ? [{
                              id: 'mutual-rec',
                              ref: { update: vi.fn() },
                              data: () => ({ id: 'mutual-rec', signal_strength: 'low' }),
                            }]
                          : [],
                      })),
                    })),
                  })),
                };
              }
              return {
                get: vi.fn(async () => ({ empty: true, docs: [], size: 0 })),
                where: vi.fn(() => ({
                  limit: vi.fn(() => ({
                    get: vi.fn(async () => ({ empty: true, docs: [] })),
                  })),
                })),
              };
            }),
            doc: vi.fn(() => ({
              set: setFn,
            })),
          };
        }
        if (name === 'booth_wall_messages') {
          return {
            where: vi.fn(() => ({
              where: vi.fn(() => ({
                limit: vi.fn(() => ({
                  get: vi.fn(async () => ({
                    empty: !boothWallInteraction,
                    docs: boothWallInteraction ? [{ id: 'msg-1' }] : [],
                  })),
                })),
              })),
            })),
          };
        }
        if (name === 'booths') {
          return {
            where: vi.fn(() => ({
              limit: vi.fn(() => ({
                get: vi.fn(async () => ({
                  empty: !boothWallInteraction,
                  docs: boothWallInteraction
                    ? [{ id: 'booth-1', data: () => ({ id: 'booth-1', agent_id: 'agent-target-1' }) }]
                    : [],
                })),
              })),
            })),
          };
        }
        return { doc: vi.fn(), where: vi.fn() };
      }),
    } as any;

    return { db, setFn, updateFn };
  }

  it('rejects recommendation when target agent does not exist', async () => {
    const { db } = createMockDb({ targetExists: false });
    const req = {
      agent: { id: 'agent-1' },
      body: validBody,
    } as any;
    const res = createMockResponse();

    await handleRecommend(db)(req, res as any);

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('not_found');
  });

  it('rejects self-recommendation', async () => {
    const { db } = createMockDb();
    const req = {
      agent: { id: 'agent-1' },
      body: { ...validBody, target_agent_id: 'agent-1' },
    } as any;
    const res = createMockResponse();

    await handleRecommend(db)(req, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });

  it('rejects missing rationale', async () => {
    const { db } = createMockDb();
    const req = {
      agent: { id: 'agent-1' },
      body: { ...validBody, rationale: '' },
    } as any;
    const res = createMockResponse();

    await handleRecommend(db)(req, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });

  it('creates recommendation with low signal (one-sided)', async () => {
    const { db, setFn } = createMockDb();
    const req = {
      agent: { id: 'agent-1' },
      body: validBody,
    } as any;
    const res = createMockResponse();

    await handleRecommend(db)(req, res as any);

    expect(res.statusCode).toBe(201);
    expect(res.body.signal_strength).toBe('low');
    expect(setFn).toHaveBeenCalledTimes(1);

    const savedRec = setFn.mock.calls[0][0];
    expect(savedRec.recommending_agent_id).toBe('agent-1');
    expect(savedRec.target_agent_id).toBe('agent-target-1');
    expect(savedRec.signal_strength).toBe('low');
  });

  it('creates recommendation with high signal when mutual', async () => {
    const { db, setFn } = createMockDb({ mutualRec: true });
    const req = {
      agent: { id: 'agent-1' },
      body: validBody,
    } as any;
    const res = createMockResponse();

    await handleRecommend(db)(req, res as any);

    expect(res.statusCode).toBe(201);
    expect(res.body.signal_strength).toBe('high');
    const savedRec = setFn.mock.calls[0][0];
    expect(savedRec.signal_strength).toBe('high');
  });

  it('creates recommendation with medium signal on booth wall interaction', async () => {
    const { db, setFn } = createMockDb({ boothWallInteraction: true });
    const req = {
      agent: { id: 'agent-1' },
      body: validBody,
    } as any;
    const res = createMockResponse();

    await handleRecommend(db)(req, res as any);

    expect(res.statusCode).toBe(201);
    expect(res.body.signal_strength).toBe('medium');
    const savedRec = setFn.mock.calls[0][0];
    expect(savedRec.signal_strength).toBe('medium');
  });

  it('updates existing recommendation instead of creating duplicate', async () => {
    const { db, setFn, updateFn } = createMockDb({ existingRec: true });
    const req = {
      agent: { id: 'agent-1' },
      body: { ...validBody, rationale: 'Updated rationale.' },
    } as any;
    const res = createMockResponse();

    await handleRecommend(db)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('updated');
    // Should update, not create new
    expect(setFn).not.toHaveBeenCalled();
    expect(updateFn).toHaveBeenCalledTimes(1);
    const updateArgs = updateFn.mock.calls[0][0];
    expect(updateArgs.rationale).toBe('Updated rationale.');
  });

  it('includes complementary tags when taxonomy matches', async () => {
    const { db, setFn } = createMockDb({
      recommenderData: {
        id: 'agent-1',
        company: {
          looking_for: ['fundraising'],
          offering: ['engineering'],
        },
      },
      targetData: {
        id: 'agent-target-1',
        company: {
          looking_for: ['technical_talent'],
          offering: ['investment'],
        },
      },
    });
    const req = {
      agent: { id: 'agent-1' },
      body: validBody,
    } as any;
    const res = createMockResponse();

    await handleRecommend(db)(req, res as any);

    expect(res.statusCode).toBe(201);
    const savedRec = setFn.mock.calls[0][0];
    // fundraising <-> investment: recommender looking_for fundraising, target offering investment
    // technical_talent <-> engineering: target looking_for technical_talent, recommender offering engineering
    expect(savedRec.complementary_tags).toContain('fundraising:investment');
    expect(savedRec.complementary_tags).toContain('technical_talent:engineering');
  });
});

describe('GET /api/meetings/recommendations', () => {
  it('returns recommendations sorted by signal strength', async () => {
    const recommendations = [
      {
        id: 'rec-1',
        recommending_agent_id: 'agent-a',
        target_agent_id: 'agent-1',
        rationale: 'Low signal match',
        match_score: 50,
        signal_strength: 'low',
        complementary_tags: [],
        created_at: { toDate: () => new Date('2026-06-01') },
      },
      {
        id: 'rec-2',
        recommending_agent_id: 'agent-b',
        target_agent_id: 'agent-1',
        rationale: 'High signal match',
        match_score: 95,
        signal_strength: 'high',
        complementary_tags: ['fundraising:investment'],
        created_at: { toDate: () => new Date('2026-06-02') },
      },
      {
        id: 'rec-3',
        recommending_agent_id: 'agent-c',
        target_agent_id: 'agent-1',
        rationale: 'Medium signal match',
        match_score: 70,
        signal_strength: 'medium',
        complementary_tags: [],
        created_at: { toDate: () => new Date('2026-06-03') },
      },
    ];

    const db = {
      collection: vi.fn(() => ({
        where: vi.fn(() => ({
          get: vi.fn(async () => ({
            docs: recommendations.map(r => ({
              id: r.id,
              data: () => r,
            })),
          })),
        })),
      })),
    } as any;

    const req = { agent: { id: 'agent-1' } } as any;
    const res = createMockResponse();

    await handleGetRecommendations(db)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.recommendations).toHaveLength(3);
    // Should be sorted: high first, then medium, then low
    expect(res.body.recommendations[0].signal_strength).toBe('high');
    expect(res.body.recommendations[1].signal_strength).toBe('medium');
    expect(res.body.recommendations[2].signal_strength).toBe('low');
  });

  it('returns empty array when no recommendations exist', async () => {
    const db = {
      collection: vi.fn(() => ({
        where: vi.fn(() => ({
          get: vi.fn(async () => ({
            docs: [],
          })),
        })),
      })),
    } as any;

    const req = { agent: { id: 'agent-1' } } as any;
    const res = createMockResponse();

    await handleGetRecommendations(db)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.recommendations).toHaveLength(0);
  });
});
