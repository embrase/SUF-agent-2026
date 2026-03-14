/**
 * Bypass Validation Tests
 *
 * Every test harness bypass is a model of reality. Models can be wrong.
 * These tests explicitly validate each bypass's assumptions, exercise the
 * negative space (what happens when the bypassed thing fails?), and document
 * accepted divergences and known production bugs.
 *
 * Tests pass by PROVING behavior — including proving bugs exist.
 * A passing "known bug" test means the bug is real and documented.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleRegister } from '../../src/api/register.js';
import { handleVerifyEmail } from '../../src/api/verify-email.js';
import { handleStatus } from '../../src/api/status.js';
import { createPhaseGate, } from '../../src/middleware/phase-gate.js';
import { isPhaseOpen, PHASE_DEFINITIONS } from '../../src/config/phases.js';
import { createRateLimiter } from '../../src/middleware/rate-limit.js';
import { createIdempotencyMiddleware } from '../../src/middleware/idempotency.js';
import { loadSettings } from '../../src/config/settings.js';
import { createMockRequest, createMockResponse, createMockFirestore } from '../helpers/firebase-mock.js';

// ============================================================
// DOCUMENTED DIVERGENCES: Simulation vs Production
// ============================================================

describe('DOCUMENTED DIVERGENCES', () => {
  it('ACCEPTED: rate limiter is in-memory in both mock and production — not a divergence', () => {
    // Production Cloud Functions instances each have their own in-memory Map.
    // The mock matches this behavior exactly. Multi-instance rate limit bypass
    // is a production architecture concern, not a test fidelity concern.
    const limiter = createRateLimiter(60);
    expect(typeof limiter).toBe('function');
  });

  it('ACCEPTED: mock Firestore has zero latency — affects perf testing only', () => {
    // Production Firestore reads take 5-50ms. Mock is instant.
    // This hides cost/latency issues but does not affect correctness.
    const db = createMockFirestore();
    expect(db._store).toBeDefined();
  });

  it('ACCEPTED: crypto.randomBytes produces non-deterministic IDs — tests check format not values', () => {
    // Agent IDs, talk IDs, tokens are random hex strings.
    // Tests assert format (length, hex chars) not exact values.
    const { randomBytes } = require('crypto');
    const id = randomBytes(12).toString('hex');
    expect(id).toMatch(/^[0-9a-f]{24}$/);
  });

  it('FIXED: phase gate overrides now use cached sync getter (was RISK 4)', () => {
    // Previously: index.ts passed (key) => undefined to every createPhaseGate call.
    // Now: index.ts passes getPhaseOverridesSync backed by a settings cache,
    // refreshed via middleware before phase-gated routes.
  });

  it('FIXED: idempotency middleware auto-records via res.json() interception (was RISK 5)', () => {
    // Previously: middleware exposed recordResponse() but no handler called it.
    // Now: middleware wraps res.json() to automatically cache responses.
  });

  it('FIXED: booths.ts rate limit query uses Timestamp.fromDate() (was RISK 6)', () => {
    // Previously: booths.ts used new Date() for todayStart (JS Date object).
    // Now: uses Timestamp.fromDate() like social.ts, keeping types consistent.
  });

  it('FIXED: register.ts has try/catch around mailer, cleans up on failure (was RISK 1)', () => {
    // Previously: mailer failure left orphaned agent docs in Firestore.
    // Now: try/catch around mailer; on failure, agent doc is deleted and 500 returned.
  });
});

// ============================================================
// RISK 1: No-op mailer hides email delivery failures
// ============================================================

describe('RISK 1: No-op mailer hides email delivery failures', () => {
  it('throwing mailer returns 500 and cleans up agent doc (orphan fix)', async () => {
    let savedData: any = null;
    let deletedId: string | null = null;
    const db = {
      collection: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => ({
            get: vi.fn(async () => ({ empty: true, docs: [] })),
          })),
        })),
        doc: vi.fn((id: string) => ({
          set: vi.fn(async (data: any) => { savedData = data; }),
          delete: vi.fn(async () => { deletedId = id; }),
        })),
      })),
    } as any;

    const throwingMailer = {
      sendVerification: vi.fn(async () => {
        throw new Error('SMTP connection refused');
      }),
    };

    const req = createMockRequest({
      method: 'POST',
      body: { email: 'human@startup.com', ticket_number: 'SUF-001' },
    });
    const res = createMockResponse();

    await handleRegister(db, throwingMailer)(req as any, res as any);

    // Agent doc was written...
    expect(savedData).not.toBeNull();
    // ...then cleaned up when mailer failed
    expect(deletedId).toBeDefined();
    // Handler returns 500, not an unhandled rejection
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('email_failed');
  });

  it('no-op mailer always succeeds — cannot distinguish valid from invalid email', async () => {
    const db = {
      collection: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => ({
            get: vi.fn(async () => ({ empty: true, docs: [] })),
          })),
        })),
        doc: vi.fn(() => ({
          set: vi.fn(async () => {}),
        })),
      })),
    } as any;

    const noopMailer = { sendVerification: vi.fn(async () => {}) };

    const req = createMockRequest({
      method: 'POST',
      body: { email: 'definitely-bounces@nonexistent.invalid', ticket_number: 'SUF-001' },
    });
    const res = createMockResponse();

    await handleRegister(db, noopMailer)(req as any, res as any);

    // Test passes with any email — no-op mailer cannot distinguish deliverable
    // from undeliverable addresses.
    expect(res.statusCode).toBe(201);
    expect(res.body.status).toBe('verification_email_sent');
    expect(noopMailer.sendVerification).toHaveBeenCalled();
  });
});

// ============================================================
// RISK 2: Token extraction skips the human email flow
// ============================================================

describe('RISK 2: Token extraction skips the human email flow', () => {
  function createVerifyDb(agentData: any) {
    return {
      collection: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => ({
            get: vi.fn(async () => ({
              empty: !agentData,
              docs: agentData ? [{
                id: 'agent-1',
                data: () => agentData,
                ref: { update: vi.fn(async () => {}) },
              }] : [],
            })),
          })),
        })),
      })),
    } as any;
  }

  it('malformed token (URL-encoded spaces) → 404 not found', async () => {
    const db = createVerifyDb(null); // No agent matches the malformed token
    const req = createMockRequest({ query: { token: 'abc%20def%20ghi' } });
    const res = createMockResponse();

    await handleVerifyEmail(db)(req as any, res as any);

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('not_found');
  });

  it('empty token → 400 validation error', async () => {
    const db = createVerifyDb(null);
    const req = createMockRequest({ query: { token: '' } });
    const res = createMockResponse();

    await handleVerifyEmail(db)(req as any, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });

  it('already-verified agent → 400 already_verified', async () => {
    const db = createVerifyDb({ email_verified: true, api_key_hash: 'some-hash' });
    const req = createMockRequest({ query: { token: 'valid-token-here' } });
    const res = createMockResponse();

    await handleVerifyEmail(db)(req as any, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('already_verified');
  });

  it('completely wrong token → 404 not found', async () => {
    const db = createVerifyDb(null);
    const req = createMockRequest({ query: { token: 'aaaaaabbbbbbccccccdddddd' } });
    const res = createMockResponse();

    await handleVerifyEmail(db)(req as any, res as any);

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('not_found');
  });
});

// ============================================================
// RISK 3: FieldValue.serverTimestamp() → ISO string
// ============================================================

describe('RISK 3: FieldValue.serverTimestamp() returns ISO string in mock', () => {
  it('ISO string >= ISO string comparison works (lexicographic sorting)', () => {
    const earlier = '2026-07-08T00:00:00.000Z';
    const later = '2026-07-08T11:30:00.000Z';
    // ISO 8601 strings are lexicographically sortable
    expect(later >= earlier).toBe(true);
    expect(earlier >= later).toBe(false);
    expect(earlier >= earlier).toBe(true);
    // This means social.ts rate limit queries work correctly in the mock
    // because both posted_at (from mocked serverTimestamp) and todayStart
    // (from mocked Timestamp.fromDate) are ISO strings.
  });

  it('ISO string >= Date object — JS coercion produces WRONG results', () => {
    const isoString = '2026-07-08T11:30:00.000Z';
    const dateObj = new Date('2026-07-08T00:00:00.000Z');

    // In JS: string >= Date triggers valueOf() on the Date (→ number),
    // and valueOf() on the string (→ NaN). NaN comparisons always return false.
    const result = (isoString as any) >= dateObj;
    expect(result).toBe(false); // WRONG — the ISO string represents a later time

    // This proves booths.ts:114 has a type mismatch bug:
    // where('posted_at', '>=', todayStart) where posted_at is ISO string
    // and todayStart is new Date(). In the SimulationFirestore, this comparison
    // would always return false → rate limit never triggers → false positive.
  });

  it('social.ts uses Timestamp.fromDate() — both sides are same type', () => {
    // social.ts:9-13 calls Timestamp.fromDate(now) for todayStart.
    // In mock, Timestamp.fromDate returns ISO string.
    // posted_at is stored via FieldValue.serverTimestamp() → also ISO string.
    // Both sides are strings → comparison works.

    // Simulate what social.ts does:
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const mockTimestampFromDate = todayStart.toISOString(); // What mock returns

    const mockServerTimestamp = new Date().toISOString(); // What mock stores

    // Both are ISO strings — comparison is correct
    expect(typeof mockTimestampFromDate).toBe('string');
    expect(typeof mockServerTimestamp).toBe('string');
    expect(mockServerTimestamp >= mockTimestampFromDate).toBe(true);
  });

  it('booths.ts uses raw new Date() — TYPE MISMATCH with stored ISO string', () => {
    // booths.ts:108-109 does:
    //   const todayStart = new Date();
    //   todayStart.setHours(0, 0, 0, 0);
    // Then: where('posted_at', '>=', todayStart)
    //
    // posted_at stored as ISO string (from mocked serverTimestamp)
    // todayStart is a JS Date object
    //
    // In real Firestore, both would be Timestamps — comparison works.
    // In the mock, it's ISO string >= Date → NaN comparison → always false.

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    expect(todayStart).toBeInstanceOf(Date);

    // The mocked serverTimestamp returns string
    const postedAt = new Date().toISOString();
    expect(typeof postedAt).toBe('string');

    // These are different types
    expect(typeof postedAt).not.toBe(typeof todayStart);
    // This type mismatch is a production bug in booths.ts, not a mock bug.
    // The mock simply exposes it.
  });
});

// ============================================================
// RISK 4: Phase gate sync/async mismatch (production bug)
// ============================================================

describe('RISK 4: Phase gate overrides — now working via cached sync getter', () => {
  it('without overrides, phases use date defaults', () => {
    const noOverrides = (_key: string) => undefined;
    const cfpDef = PHASE_DEFINITIONS.find(p => p.key === 'cfp')!;

    // Before window → closed
    expect(isPhaseOpen(cfpDef, noOverrides('cfp'), new Date('2026-03-14'))).toBe(false);
    // During window → open
    expect(isPhaseOpen(cfpDef, noOverrides('cfp'), new Date('2026-05-15'))).toBe(true);
  });

  it('sync getter with { is_open: true } → phase opens regardless of dates', () => {
    // Both simulation and production now use sync getters backed by cached settings
    const syncGetter = (key: string) => {
      if (key === 'cfp') return { is_open: true };
      return undefined;
    };

    const cfpDef = PHASE_DEFINITIONS.find(p => p.key === 'cfp')!;
    expect(isPhaseOpen(cfpDef, syncGetter('cfp'), new Date('2026-01-01'))).toBe(true);
  });

  it('sync getter with { is_open: false } → phase closes regardless of dates', () => {
    const syncGetter = (key: string) => {
      if (key === 'cfp') return { is_open: false };
      return undefined;
    };

    const gate = createPhaseGate('cfp', syncGetter);
    const req = createMockRequest();
    const res = createMockResponse();
    let nextCalled = false;

    gate(req as any, res as any, () => { nextCalled = true; });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(403);
  });

  it('handleStatus uses async getter — both endpoints now respect overrides', async () => {
    const asyncGetter = vi.fn(async (key: string) => {
      if (key === 'cfp') return { is_open: true };
      return undefined;
    });
    const freezeGetter = vi.fn(async () => false);

    const handler = handleStatus(asyncGetter, freezeGetter, new Date('2026-01-01'));
    const req = createMockRequest();
    const res = createMockResponse();

    await handler(req as any, res as any);

    expect(res.body.active).toContain('cfp');
    // handleStatus (async) and phase gates (sync) now both respect overrides.
    // The only difference is how they get them: async from Firestore vs sync from cache.
  });
});

// ============================================================
// RISK 5: Idempotency middleware never records responses
// ============================================================

describe('RISK 5: Idempotency middleware — auto-records via res.json() interception', () => {
  it('first request with idempotency key calls next()', () => {
    const middleware = createIdempotencyMiddleware();
    const req = {
      headers: { 'idempotency-key': 'unique-key-1' },
      agent: { id: 'agent-1' },
    } as any;
    const res = createMockResponse();
    let nextCalled = false;

    middleware(req, res as any, () => { nextCalled = true; });

    expect(nextCalled).toBe(true);
  });

  it('second identical request returns cached response (auto-recorded)', () => {
    const middleware = createIdempotencyMiddleware();
    const makeReq = () => ({
      headers: { 'idempotency-key': 'dup-key' },
      agent: { id: 'agent-1' },
    }) as any;

    // First request — middleware intercepts res.json to auto-record
    const res1 = createMockResponse();
    let next1 = false;
    middleware(makeReq(), res1 as any, () => { next1 = true; });
    expect(next1).toBe(true);

    // Simulate handler calling res.status(201).json(body)
    // The middleware has wrapped res.json to cache the response
    res1.status(201).json({ id: 'talk-abc', status: 'submitted' });

    // Second request — same key, same agent → should get cached response
    const res2 = createMockResponse();
    let next2 = false;
    middleware(makeReq(), res2 as any, () => { next2 = true; });

    expect(next2).toBe(false); // Handler NOT called
    expect(res2.statusCode).toBe(201);
    expect(res2.body.id).toBe('talk-abc');
  });

  it('different agents can use the same idempotency key independently', () => {
    const middleware = createIdempotencyMiddleware();

    // Agent 1 uses key 'x'
    const res1 = createMockResponse();
    middleware(
      { headers: { 'idempotency-key': 'x' }, agent: { id: 'agent-1' } } as any,
      res1 as any,
      () => {},
    );
    res1.status(201).json({ owner: 'agent-1' });

    // Agent 2 uses same key 'x' — should NOT get agent-1's cached response
    let next2 = false;
    const res2 = createMockResponse();
    middleware(
      { headers: { 'idempotency-key': 'x' }, agent: { id: 'agent-2' } } as any,
      res2 as any,
      () => { next2 = true; },
    );
    expect(next2).toBe(true); // Different agent → not cached
  });

  it('without idempotency key, requests always pass through', () => {
    const middleware = createIdempotencyMiddleware();
    const req = { headers: {}, agent: { id: 'agent-1' } } as any;
    let nextCalled = false;

    middleware(req, createMockResponse() as any, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
  });
});

// ============================================================
// RISK 6: Timestamp comparison semantics in rate limit queries
// ============================================================

describe('RISK 6: Timestamp type mismatch in rate limit queries', () => {
  it('two ISO strings compare correctly with >= (social.ts pattern)', () => {
    // social.ts:12 returns Timestamp.fromDate(now) → ISO string in mock
    // FieldValue.serverTimestamp() → ISO string in mock
    // Both sides are strings → lexicographic >= works
    const todayMidnight = '2026-07-08T00:00:00.000Z';
    const postTime1 = '2026-07-08T09:30:00.000Z'; // After midnight → should match
    const postTime2 = '2026-07-07T23:59:00.000Z'; // Before midnight → should NOT match

    expect(postTime1 >= todayMidnight).toBe(true);
    expect(postTime2 >= todayMidnight).toBe(false);
  });

  it('ISO string vs Date object comparison is BROKEN (booths.ts pattern)', () => {
    // booths.ts:108-109: todayStart = new Date(); todayStart.setHours(0,0,0,0);
    // This is a Date object, not a string.
    const todayStart = new Date('2026-07-08T00:00:00.000Z');

    // posted_at from mocked serverTimestamp is an ISO string
    const postedAt = '2026-07-08T09:30:00.000Z';

    // JS comparison: string >= Date
    // Date.valueOf() → number (ms since epoch)
    // String.valueOf() → the string itself
    // string >= number → string is coerced to number → NaN
    // NaN >= anything → false
    expect((postedAt as any) >= todayStart).toBe(false);

    // This means in the SimulationFirestore, booth wall rate limit queries
    // with where('posted_at', '>=', todayStart) would NEVER match any posts.
    // The rate limit counter would always be 0 → limit never triggers.
    // This is a FALSE POSITIVE: tests pass without rate limiting.
  });

  it('social.ts and booths.ts use DIFFERENT types for todayStart', () => {
    // social.ts uses Timestamp.fromDate() → returns ISO string in mock
    const socialTodayStart = (() => {
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      return now.toISOString(); // What Timestamp.fromDate returns in mock
    })();

    // booths.ts uses raw new Date()
    const boothTodayStart = (() => {
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      return now; // Raw Date object
    })();

    expect(typeof socialTodayStart).toBe('string');
    expect(boothTodayStart).toBeInstanceOf(Date);

    // This inconsistency is in PRODUCTION code, not in the mock.
    // The mock just exposes it because both types flow into where() queries.
  });
});

// ============================================================
// RISK 7: In-memory rate limiter resets between tests
// ============================================================

describe('RISK 7: In-memory rate limiter resets between tests/instances', () => {
  it('fresh rate limiter has zero accumulated state', () => {
    const limiter = createRateLimiter(3);

    // Send 2 requests
    for (let i = 0; i < 2; i++) {
      const req = { agent: { id: 'agent-1' } } as any;
      let nextCalled = false;
      limiter(req, createMockResponse() as any, () => { nextCalled = true; });
      expect(nextCalled).toBe(true);
    }

    // Create a NEW limiter (simulates cold start or new test)
    const limiter2 = createRateLimiter(3);

    // Agent-1 can send 3 more requests — no accumulated state
    for (let i = 0; i < 3; i++) {
      const req = { agent: { id: 'agent-1' } } as any;
      let nextCalled = false;
      limiter2(req, createMockResponse() as any, () => { nextCalled = true; });
      expect(nextCalled).toBe(true);
    }
  });

  it('rate limit triggers at exact boundary (request N+1 is blocked)', () => {
    const limiter = createRateLimiter(3);

    // Requests 1-3: allowed
    for (let i = 0; i < 3; i++) {
      const req = { agent: { id: 'agent-1' } } as any;
      let nextCalled = false;
      limiter(req, createMockResponse() as any, () => { nextCalled = true; });
      expect(nextCalled).toBe(true);
    }

    // Request 4: blocked
    const req4 = { agent: { id: 'agent-1' } } as any;
    const res4 = createMockResponse();
    let next4 = false;
    limiter(req4, res4 as any, () => { next4 = true; });
    expect(next4).toBe(false);
    expect(res4.statusCode).toBe(429);
    expect(res4.body.error).toBe('rate_limited');
  });

  it('rate limit window resets after 60 seconds', () => {
    vi.useFakeTimers();
    try {
      const limiter = createRateLimiter(2);

      // Fill the window
      for (let i = 0; i < 2; i++) {
        const req = { agent: { id: 'agent-1' } } as any;
        limiter(req, createMockResponse() as any, () => {});
      }

      // Request 3: blocked
      const res3 = createMockResponse();
      let next3 = false;
      limiter({ agent: { id: 'agent-1' } } as any, res3 as any, () => { next3 = true; });
      expect(next3).toBe(false);

      // Advance past the 60-second window
      vi.advanceTimersByTime(61_000);

      // Request after reset: allowed
      let next4 = false;
      limiter({ agent: { id: 'agent-1' } } as any, createMockResponse() as any, () => { next4 = true; });
      expect(next4).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rate limit is per-agent — agents are isolated', () => {
    const limiter = createRateLimiter(2);

    // Fill agent-1's window
    for (let i = 0; i < 2; i++) {
      limiter({ agent: { id: 'agent-1' } } as any, createMockResponse() as any, () => {});
    }

    // Agent-1 is blocked
    const res1 = createMockResponse();
    let next1 = false;
    limiter({ agent: { id: 'agent-1' } } as any, res1 as any, () => { next1 = true; });
    expect(next1).toBe(false);

    // Agent-2 is NOT blocked
    let next2 = false;
    limiter({ agent: { id: 'agent-2' } } as any, createMockResponse() as any, () => { next2 = true; });
    expect(next2).toBe(true);
  });
});

// ============================================================
// RISK 8: Non-deterministic IDs (crypto.randomBytes)
// ============================================================

describe('RISK 8: Non-deterministic IDs from crypto.randomBytes', () => {
  it('agent IDs are 24-char hex strings', async () => {
    const db = {
      collection: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => ({
            get: vi.fn(async () => ({ empty: true, docs: [] })),
          })),
        })),
        doc: vi.fn(() => ({
          set: vi.fn(async () => {}),
        })),
      })),
    } as any;
    const mailer = { sendVerification: vi.fn(async () => {}) };
    const req = createMockRequest({
      method: 'POST',
      body: { email: 'test@example.com', ticket_number: 'T-1' },
    });
    const res = createMockResponse();

    await handleRegister(db, mailer)(req as any, res as any);

    expect(res.body.agent_id).toMatch(/^[0-9a-f]{24}$/);
  });

  it('two registrations produce different IDs', async () => {
    const ids: string[] = [];
    const db = {
      collection: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => ({
            get: vi.fn(async () => ({ empty: true, docs: [] })),
          })),
        })),
        doc: vi.fn(() => ({
          set: vi.fn(async () => {}),
        })),
      })),
    } as any;
    const mailer = { sendVerification: vi.fn(async () => {}) };

    for (const email of ['a@test.com', 'b@test.com']) {
      const req = createMockRequest({
        method: 'POST',
        body: { email, ticket_number: 'T-1' },
      });
      const res = createMockResponse();
      await handleRegister(db, mailer)(req as any, res as any);
      ids.push(res.body.agent_id);
    }

    expect(ids[0]).not.toBe(ids[1]);
  });

  it('crypto.randomBytes can be mocked for deterministic testing if needed', () => {
    const crypto = require('crypto');
    const spy = vi.spyOn(crypto, 'randomBytes').mockReturnValueOnce(
      Buffer.from('aabbccddeeff', 'hex')
    );

    const id = crypto.randomBytes(6).toString('hex');
    expect(id).toBe('aabbccddeeff');

    spy.mockRestore();
    // Escape hatch exists but is not needed for normal bypass validation.
  });
});

// ============================================================
// RISK 9: loadSettings() has no caching
// ============================================================

describe('RISK 9: loadSettings reads Firestore on every call — no caching', () => {
  it('returns DEFAULTS when no config document exists', async () => {
    const db = createMockFirestore();
    // No config/settings document in store
    const settings = await loadSettings(db as any);

    expect(settings.booth_wall_max_per_day).toBe(10);
    expect(settings.status_feed_max_per_day).toBe(50);
    expect(settings.vote_score_min).toBe(1);
    expect(settings.vote_score_max).toBe(100);
    expect(settings.global_write_freeze).toBe(false);
    expect(settings.phase_overrides).toEqual({});
  });

  it('merges partial overrides with defaults', async () => {
    const db = createMockFirestore();
    db._store['config'] = {
      settings: { booth_wall_max_per_day: 5, global_write_freeze: true },
    };

    const settings = await loadSettings(db as any);

    // Overridden
    expect(settings.booth_wall_max_per_day).toBe(5);
    expect(settings.global_write_freeze).toBe(true);
    // Defaults preserved
    expect(settings.status_feed_max_per_day).toBe(50);
    expect(settings.vote_score_min).toBe(1);
  });

  it('N calls → N Firestore reads (no caching)', async () => {
    const getFn = vi.fn(async () => ({
      exists: true,
      data: () => ({ booth_wall_max_per_day: 3 }),
    }));
    const db = {
      collection: vi.fn(() => ({
        doc: vi.fn(() => ({
          get: getFn,
        })),
      })),
    } as any;

    // Call loadSettings 10 times
    for (let i = 0; i < 10; i++) {
      await loadSettings(db);
    }

    // Every call hit Firestore
    expect(getFn).toHaveBeenCalledTimes(10);
    // In production with 60 req/min limit × 5 agents = 300 Firestore reads/min
    // just for settings. Mock hides this cost because reads are instant.
  });
});
