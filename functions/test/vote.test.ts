import { describe, it, expect, vi } from 'vitest';
import { validateVoteInput, validateSocialPostInput } from '../src/lib/validate.js';
import { handleGetNextTalk, handleVote } from '../src/api/vote.js';
import { createMockResponse } from './helpers/firebase-mock.js';

// --- Task 2: Validation tests ---

describe('validateVoteInput', () => {
  it('accepts valid vote input with default settings', () => {
    const result = validateVoteInput(
      { proposal_id: 'prop-1', score: 75, rationale: 'Great talk idea' },
      { vote_score_min: 1, vote_score_max: 100, vote_rationale_max_chars: 500 }
    );
    expect(result.valid).toBe(true);
    expect(Object.keys(result.errors)).toHaveLength(0);
  });

  it('rejects missing proposal_id', () => {
    const result = validateVoteInput(
      { score: 75, rationale: 'Good' },
      { vote_score_min: 1, vote_score_max: 100, vote_rationale_max_chars: 500 }
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('proposal_id');
  });

  it('rejects score below minimum', () => {
    const result = validateVoteInput(
      { proposal_id: 'prop-1', score: 0, rationale: 'Bad' },
      { vote_score_min: 1, vote_score_max: 100, vote_rationale_max_chars: 500 }
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('score');
  });

  it('rejects score above maximum', () => {
    const result = validateVoteInput(
      { proposal_id: 'prop-1', score: 101, rationale: 'Amazing' },
      { vote_score_min: 1, vote_score_max: 100, vote_rationale_max_chars: 500 }
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('score');
  });

  it('rejects non-integer score', () => {
    const result = validateVoteInput(
      { proposal_id: 'prop-1', score: 75.5, rationale: 'Good' },
      { vote_score_min: 1, vote_score_max: 100, vote_rationale_max_chars: 500 }
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('score');
  });

  it('rejects rationale exceeding max chars', () => {
    const result = validateVoteInput(
      { proposal_id: 'prop-1', score: 50, rationale: 'x'.repeat(501) },
      { vote_score_min: 1, vote_score_max: 100, vote_rationale_max_chars: 500 }
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('rationale');
  });

  it('accepts vote without rationale (optional)', () => {
    const result = validateVoteInput(
      { proposal_id: 'prop-1', score: 50 },
      { vote_score_min: 1, vote_score_max: 100, vote_rationale_max_chars: 500 }
    );
    expect(result.valid).toBe(true);
  });

  it('respects custom score range from settings', () => {
    const result = validateVoteInput(
      { proposal_id: 'prop-1', score: 5, rationale: 'Fine' },
      { vote_score_min: 1, vote_score_max: 10, vote_rationale_max_chars: 500 }
    );
    expect(result.valid).toBe(true);

    const result2 = validateVoteInput(
      { proposal_id: 'prop-1', score: 11, rationale: 'Too high' },
      { vote_score_min: 1, vote_score_max: 10, vote_rationale_max_chars: 500 }
    );
    expect(result2.valid).toBe(false);
    expect(result2.errors).toHaveProperty('score');
  });
});

describe('validateSocialPostInput', () => {
  it('accepts valid status post', () => {
    const result = validateSocialPostInput(
      { content: 'Hello world!', type: 'status' },
      { social_post_max_chars: 500 }
    );
    expect(result.valid).toBe(true);
  });

  it('rejects missing content', () => {
    const result = validateSocialPostInput(
      { type: 'status' },
      { social_post_max_chars: 500 }
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('content');
  });

  it('rejects empty content', () => {
    const result = validateSocialPostInput(
      { content: '', type: 'status' },
      { social_post_max_chars: 500 }
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('content');
  });

  it('rejects content exceeding max chars', () => {
    const result = validateSocialPostInput(
      { content: 'x'.repeat(501), type: 'status' },
      { social_post_max_chars: 500 }
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('content');
  });

  it('rejects invalid type', () => {
    const result = validateSocialPostInput(
      { content: 'Hello', type: 'invalid' },
      { social_post_max_chars: 500 }
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('type');
  });

  it('rejects wall_post without target_agent_id', () => {
    const result = validateSocialPostInput(
      { content: 'Hello', type: 'wall_post' },
      { social_post_max_chars: 500 }
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('target_agent_id');
  });

  it('accepts wall_post with target_agent_id', () => {
    const result = validateSocialPostInput(
      { content: 'Hello!', type: 'wall_post', target_agent_id: 'agent-2' },
      { social_post_max_chars: 500 }
    );
    expect(result.valid).toBe(true);
  });
});

// --- Task 3: GET /api/talks/next tests ---

describe('GET /api/talks/next', () => {
  it('returns a random unvoted proposal', async () => {
    // Mock: 2 proposals exist, agent has voted on 1
    const proposals = [
      { id: 'prop-1', agent_id: 'other-1', title: 'Talk A', status: 'submitted', vote_count: 0, avg_score: 0 },
      { id: 'prop-2', agent_id: 'other-2', title: 'Talk B', status: 'submitted', vote_count: 0, avg_score: 0 },
    ];
    const existingVotes = [
      { id: 'agent-1_prop-1', agent_id: 'agent-1', proposal_id: 'prop-1' },
    ];

    const db = {
      collection: vi.fn((name: string) => {
        if (name === 'talks') {
          return {
            where: vi.fn(() => ({
              get: vi.fn(async () => ({
                docs: proposals.map(p => ({ id: p.id, data: () => p })),
              })),
            })),
          };
        }
        if (name === 'votes') {
          return {
            where: vi.fn(() => ({
              get: vi.fn(async () => ({
                docs: existingVotes.map(v => ({ id: v.id, data: () => v })),
              })),
            })),
          };
        }
        return {};
      }),
    } as any;

    const req = { agent: { id: 'agent-1' } } as any;
    const res = createMockResponse();

    await handleGetNextTalk(db)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.proposal).toBeDefined();
    expect(res.body.proposal.id).toBe('prop-2');
  });

  it('excludes proposals authored by the requesting agent', async () => {
    const proposals = [
      { id: 'prop-1', agent_id: 'agent-1', title: 'My Own Talk', status: 'submitted' },
      { id: 'prop-2', agent_id: 'other-1', title: 'Someone Else Talk', status: 'submitted' },
    ];

    const db = {
      collection: vi.fn((name: string) => {
        if (name === 'talks') {
          return {
            where: vi.fn(() => ({
              get: vi.fn(async () => ({
                docs: proposals.map(p => ({ id: p.id, data: () => p })),
              })),
            })),
          };
        }
        if (name === 'votes') {
          return {
            where: vi.fn(() => ({
              get: vi.fn(async () => ({
                docs: [],
              })),
            })),
          };
        }
        return {};
      }),
    } as any;

    const req = { agent: { id: 'agent-1' } } as any;
    const res = createMockResponse();

    await handleGetNextTalk(db)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.proposal.id).toBe('prop-2');
  });

  it('returns empty when all proposals have been voted on', async () => {
    const proposals = [
      { id: 'prop-1', agent_id: 'other-1', title: 'Talk A', status: 'submitted' },
    ];
    const existingVotes = [
      { id: 'agent-1_prop-1', agent_id: 'agent-1', proposal_id: 'prop-1' },
    ];

    const db = {
      collection: vi.fn((name: string) => {
        if (name === 'talks') {
          return {
            where: vi.fn(() => ({
              get: vi.fn(async () => ({
                docs: proposals.map(p => ({ id: p.id, data: () => p })),
              })),
            })),
          };
        }
        if (name === 'votes') {
          return {
            where: vi.fn(() => ({
              get: vi.fn(async () => ({
                docs: existingVotes.map(v => ({ id: v.id, data: () => v })),
              })),
            })),
          };
        }
        return {};
      }),
    } as any;

    const req = { agent: { id: 'agent-1' } } as any;
    const res = createMockResponse();

    await handleGetNextTalk(db)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.proposal).toBeNull();
    expect(res.body.message).toContain('voted on all');
  });
});

// --- Task 4: POST /api/vote tests ---

describe('POST /api/vote', () => {
  it('creates a new vote on a valid proposal', async () => {
    const setFn = vi.fn();
    const updateFn = vi.fn();
    const proposalData = {
      id: 'prop-1', agent_id: 'other-1', status: 'submitted',
      vote_count: 2, avg_score: 60,
    };

    const db = {
      collection: vi.fn((name: string) => {
        if (name === 'talks') {
          return {
            doc: vi.fn(() => ({
              get: vi.fn(async () => ({
                exists: true,
                data: () => proposalData,
                id: 'prop-1',
              })),
              update: updateFn,
            })),
          };
        }
        if (name === 'votes') {
          return {
            doc: vi.fn(() => ({
              get: vi.fn(async () => ({
                exists: false,
                data: () => undefined,
              })),
              set: setFn,
            })),
            where: vi.fn(() => ({
              get: vi.fn(async () => ({
                docs: [
                  { data: () => ({ score: 80 }) },
                  { data: () => ({ score: 40 }) },
                ],
              })),
            })),
          };
        }
        return {};
      }),
    } as any;

    const settings = {
      vote_score_min: 1,
      vote_score_max: 100,
      vote_rationale_max_chars: 500,
    };

    const req = {
      agent: { id: 'agent-1' },
      body: { proposal_id: 'prop-1', score: 75, rationale: 'Interesting topic' },
    } as any;
    const res = createMockResponse();

    await handleVote(db, settings as any)(req, res as any);

    expect(res.statusCode).toBe(201);
    expect(res.body.status).toBe('vote_recorded');
    expect(setFn).toHaveBeenCalled();
    // Verify the vote was saved with correct composite ID
    const setCall = setFn.mock.calls[0][0];
    expect(setCall.agent_id).toBe('agent-1');
    expect(setCall.proposal_id).toBe('prop-1');
    expect(setCall.score).toBe(75);
  });

  it('updates existing vote (deduplication)', async () => {
    const setFn = vi.fn();
    const updateFn = vi.fn();
    const proposalData = {
      id: 'prop-1', agent_id: 'other-1', status: 'submitted',
      vote_count: 3, avg_score: 70,
    };

    const db = {
      collection: vi.fn((name: string) => {
        if (name === 'talks') {
          return {
            doc: vi.fn(() => ({
              get: vi.fn(async () => ({
                exists: true,
                data: () => proposalData,
                id: 'prop-1',
              })),
              update: updateFn,
            })),
          };
        }
        if (name === 'votes') {
          return {
            doc: vi.fn(() => ({
              get: vi.fn(async () => ({
                exists: true,
                data: () => ({ agent_id: 'agent-1', proposal_id: 'prop-1', score: 50 }),
              })),
              set: setFn,
            })),
            where: vi.fn(() => ({
              get: vi.fn(async () => ({
                docs: [
                  { data: () => ({ score: 80 }) },
                  { data: () => ({ score: 60 }) },
                ],
              })),
            })),
          };
        }
        return {};
      }),
    } as any;

    const settings = {
      vote_score_min: 1,
      vote_score_max: 100,
      vote_rationale_max_chars: 500,
    };

    const req = {
      agent: { id: 'agent-1' },
      body: { proposal_id: 'prop-1', score: 90, rationale: 'Changed my mind' },
    } as any;
    const res = createMockResponse();

    await handleVote(db, settings as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('vote_updated');
    expect(setFn).toHaveBeenCalled();
  });

  it('rejects voting on own proposal', async () => {
    const proposalData = {
      id: 'prop-1', agent_id: 'agent-1', status: 'submitted',
    };

    const db = {
      collection: vi.fn((name: string) => {
        if (name === 'talks') {
          return {
            doc: vi.fn(() => ({
              get: vi.fn(async () => ({
                exists: true,
                data: () => proposalData,
                id: 'prop-1',
              })),
            })),
          };
        }
        if (name === 'votes') {
          return {
            doc: vi.fn(() => ({
              get: vi.fn(async () => ({ exists: false })),
            })),
          };
        }
        return {};
      }),
    } as any;

    const settings = {
      vote_score_min: 1,
      vote_score_max: 100,
      vote_rationale_max_chars: 500,
    };

    const req = {
      agent: { id: 'agent-1' },
      body: { proposal_id: 'prop-1', score: 100, rationale: 'My own talk' },
    } as any;
    const res = createMockResponse();

    await handleVote(db, settings as any)(req, res as any);

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('validation_error');
  });

  it('rejects vote on non-existent proposal', async () => {
    const db = {
      collection: vi.fn((name: string) => {
        if (name === 'talks') {
          return {
            doc: vi.fn(() => ({
              get: vi.fn(async () => ({
                exists: false,
              })),
            })),
          };
        }
        if (name === 'votes') {
          return {
            doc: vi.fn(() => ({
              get: vi.fn(async () => ({ exists: false })),
            })),
          };
        }
        return {};
      }),
    } as any;

    const settings = {
      vote_score_min: 1,
      vote_score_max: 100,
      vote_rationale_max_chars: 500,
    };

    const req = {
      agent: { id: 'agent-1' },
      body: { proposal_id: 'nonexistent', score: 50, rationale: 'Test' },
    } as any;
    const res = createMockResponse();

    await handleVote(db, settings as any)(req, res as any);

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('not_found');
  });

  it('rejects invalid vote input', async () => {
    const db = { collection: vi.fn() } as any;
    const settings = {
      vote_score_min: 1,
      vote_score_max: 100,
      vote_rationale_max_chars: 500,
    };

    const req = {
      agent: { id: 'agent-1' },
      body: { proposal_id: '', score: -1 },
    } as any;
    const res = createMockResponse();

    await handleVote(db, settings as any)(req, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });
});
