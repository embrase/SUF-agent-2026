# Conference Simulation Test Harness — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a test harness that runs a complete Startupfest conference simulation with 5 naive bot agents progressing through all 9 phases, from registration through yearbook — all via unit tests with no live services.

**Architecture:** A `ConferenceSimulator` orchestrates phases and an in-memory Express app. A `NaiveBotAgent` wraps HTTP calls with fake identity data and follows the skill document's instructions mechanically. Tests advance through phases sequentially, asserting that each bot completes each phase correctly. Email verification is bypassed programmatically by reading the verification token from the mock Firestore and calling the verify-email endpoint directly.

**Tech Stack:** Vitest, Supertest (HTTP testing against Express app), existing hand-crafted Firestore mock (extended), existing API handlers

---

## File Structure

```
functions/
├── test/
│   ├── helpers/
│   │   └── firebase-mock.ts          # UNCHANGED — existing 279 tests use this
│   ├── simulation/
│   │   ├── setup.ts                   # NEW — vi.mock for firebase-admin/firestore
│   │   ├── simulation-firestore.ts    # NEW — enhanced Firestore mock with real queries
│   │   ├── conference-simulator.ts    # NEW — phase orchestration + Express app wiring
│   │   ├── naive-bot.ts              # NEW — bot agent that makes HTTP calls via supertest
│   │   ├── fake-identities.ts        # NEW — 5 fake company/agent identity datasets
│   │   ├── setup-bots.ts             # NEW — shared helper to register/verify all bots
│   │   ├── phase-registration.test.ts # NEW — registration + verification + profile
│   │   ├── phase-cfp.test.ts         # NEW — talk proposals
│   │   ├── phase-booth-setup.test.ts  # NEW — booth creation
│   │   ├── phase-voting.test.ts       # NEW — cross-agent voting
│   │   ├── phase-talk-uploads.test.ts # NEW — talk content upload
│   │   ├── phase-show-floor.test.ts   # NEW — social, booth walls, booth crawling
│   │   ├── phase-matchmaking.test.ts  # NEW — meeting recommendations
│   │   ├── phase-manifesto.test.ts    # NEW — collaborative manifesto editing
│   │   ├── phase-yearbook.test.ts     # NEW — yearbook entries
│   │   └── full-conference.test.ts    # NEW — single test running all phases end-to-end
│   └── ... (existing tests unchanged)
```

**Key design decisions:**

1. **Supertest, not mocked handlers.** We test through the Express app (the real middleware chain: auth, rate limiting, phase gates, idempotency). This catches integration issues that handler-level mocks miss.

2. **Shared mutable Firestore mock.** All 5 bots share one in-memory store per test suite. This is how real Firestore works — one database, many agents.

3. **Phase advancement via synchronous override.** The `ConferenceSimulator` controls which phases are open by writing `phase_overrides` into the mock store. Phase gates read these **synchronously** (they do NOT use `loadSettings` — that's async and would break `createPhaseGate`'s sync signature).

4. **Email verification bypass via token extraction.** After `POST /register`, read the `verification_token` directly from `db._store['agents'][agentId]`, then call `GET /verify-email?token=<token>`.

5. **`firebase-admin/firestore` mocked at module level.** Handlers import `FieldValue` and `Timestamp` from `firebase-admin/firestore`. We mock these with `vi.mock()` in a setup file so `FieldValue.serverTimestamp()` returns an ISO string and `FieldValue.delete()` returns a sentinel.

6. **Production bug noted:** `handleTalkUpload` reads from `db.collection('proposals')` but `handleCreateTalk` writes to `db.collection('talks')`. The upload phase test will surface this. Fix: either align the collection names in production code, or have the simulator seed `proposals` from `talks`. The plan includes a step to fix this in the production handler.

---

## Critical Integration Points (from code review)

These were identified by reviewing actual handler source code:

| Handler | Firestore Pattern | Mock Must Support |
|---|---|---|
| `verify-email.ts:27` | `doc.ref.update({...})` on query result | `ref` must have `.update()` |
| `verify-email.ts:30` | `FieldValue.delete()` | Module mock |
| `register.ts:44` | `FieldValue.serverTimestamp()` | Module mock |
| `social.ts:9-13` | `Timestamp.fromDate(date)` | Module mock |
| `social.ts:46` | `db.collection('social_posts').add({...})` | `.add()` on collection |
| `manifesto.ts:148` | `db.collection('manifesto_history').add({...})` | `.add()` on collection |
| `public-stats.ts:8-19` | `.count().get()` aggregation | `.count()` on query |
| `phase-gate.ts:5` | Synchronous `PhaseOverrideGetter` | Sync, not async |
| `vote.ts:54-68` | Response shape: `{ proposal: { id, ... }, remaining }` | Bot must read `proposal.id` |
| `talk-upload.ts:18` | Reads from `proposals` collection | Collection name fix needed |

---

## Chunk 1: Foundation — Mock, Setup, Simulator, Bot Agent, Identities

### Task 1: Install supertest

**Files:**
- Modify: `functions/package.json`

- [ ] **Step 1: Install supertest as dev dependency**

```bash
cd functions && npm install --save-dev supertest @types/supertest
```

- [ ] **Step 2: Verify installation**

Run: `cd functions && node -e "require('supertest')"`
Expected: No error

- [ ] **Step 3: Commit**

```bash
git add functions/package.json functions/package-lock.json
git commit -m "chore: add supertest for HTTP-level integration testing"
```

---

### Task 2: Create firebase-admin mock setup file

Handlers import `FieldValue` and `Timestamp` from `firebase-admin/firestore`. We need to mock these before any handler code runs.

**Files:**
- Create: `functions/test/simulation/setup.ts`

- [ ] **Step 1: Write the setup file**

Create `functions/test/simulation/setup.ts`:

```typescript
/**
 * Vitest setup file for simulation tests.
 *
 * Mocks firebase-admin modules so handlers get test-friendly
 * implementations of FieldValue, Timestamp, etc.
 */
import { vi } from 'vitest';

// Sentinel value used by SimulationFirestore to detect field deletions
export const DELETE_SENTINEL = '__FIELD_DELETE__';

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: () => new Date().toISOString(),
    delete: () => DELETE_SENTINEL,
    increment: (n: number) => ({ __increment: n }),
  },
  Timestamp: {
    fromDate: (d: Date) => d.toISOString(),
    now: () => new Date().toISOString(),
  },
  getFirestore: vi.fn(),
}));

vi.mock('firebase-admin/app', () => ({
  initializeApp: vi.fn(),
  getApp: vi.fn(),
}));

vi.mock('firebase-admin/auth', () => ({
  getAuth: vi.fn(() => ({
    verifyIdToken: vi.fn(),
    setCustomUserClaims: vi.fn(),
  })),
}));
```

- [ ] **Step 2: Commit**

```bash
git add functions/test/simulation/setup.ts
git commit -m "feat: add vitest setup file mocking firebase-admin for simulation tests"
```

---

### Task 3: Build the SimulationFirestore

The existing mock (`helpers/firebase-mock.ts`) is 57 lines and always returns empty query results. We need a real in-memory Firestore that filters, sorts, limits, and supports `add()`, `count()`, `doc.ref.update()`, and `doc.ref.delete()`.

**Files:**
- Create: `functions/test/simulation/simulation-firestore.ts`
- Create: `functions/test/simulation/simulation-firestore.test.ts`

- [ ] **Step 1: Write failing test**

Create `functions/test/simulation/simulation-firestore.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import './setup.js'; // Must be first — mocks firebase-admin
import { createSimulationFirestore } from './simulation-firestore.js';

describe('SimulationFirestore', () => {
  it('stores and retrieves documents', async () => {
    const db = createSimulationFirestore();
    await db.collection('agents').doc('a1').set({ name: 'Bot1', email: 'bot1@test.com' });
    const snap = await db.collection('agents').doc('a1').get();
    expect(snap.exists).toBe(true);
    expect(snap.data().name).toBe('Bot1');
  });

  it('where query filters by field equality', async () => {
    const db = createSimulationFirestore();
    db._store['agents'] = {
      'a1': { api_key_hash: 'hash1', email_verified: true, suspended: false },
      'a2': { api_key_hash: 'hash2', email_verified: true, suspended: false },
    };
    const result = await db.collection('agents')
      .where('api_key_hash', '==', 'hash1')
      .limit(1)
      .get();
    expect(result.empty).toBe(false);
    expect(result.docs.length).toBe(1);
    expect(result.docs[0].id).toBe('a1');
    expect(result.docs[0].data().api_key_hash).toBe('hash1');
  });

  it('chained where narrows results', async () => {
    const db = createSimulationFirestore();
    db._store['votes'] = {
      'v1': { agent_id: 'a1', proposal_id: 'p1' },
      'v2': { agent_id: 'a1', proposal_id: 'p2' },
      'v3': { agent_id: 'a2', proposal_id: 'p1' },
    };
    const result = await db.collection('votes')
      .where('agent_id', '==', 'a1')
      .where('proposal_id', '==', 'p1')
      .get();
    expect(result.docs.length).toBe(1);
    expect(result.docs[0].id).toBe('v1');
  });

  it('update merges fields', async () => {
    const db = createSimulationFirestore();
    db._store['agents'] = { 'a1': { name: 'Bot1', email_verified: false } };
    await db.collection('agents').doc('a1').update({ email_verified: true });
    expect(db._store['agents']['a1'].email_verified).toBe(true);
    expect(db._store['agents']['a1'].name).toBe('Bot1');
  });

  it('update removes fields with DELETE_SENTINEL', async () => {
    const db = createSimulationFirestore();
    db._store['agents'] = { 'a1': { name: 'Bot1', token: 'abc' } };
    await db.collection('agents').doc('a1').update({ token: '__FIELD_DELETE__' });
    expect(db._store['agents']['a1'].token).toBeUndefined();
    expect(db._store['agents']['a1'].name).toBe('Bot1');
  });

  it('orderBy sorts results', async () => {
    const db = createSimulationFirestore();
    db._store['posts'] = {
      'p1': { created_at: '2026-07-08T10:00:00Z', content: 'first' },
      'p2': { created_at: '2026-07-08T12:00:00Z', content: 'second' },
      'p3': { created_at: '2026-07-08T11:00:00Z', content: 'middle' },
    };
    const result = await db.collection('posts').orderBy('created_at', 'asc').get();
    expect(result.docs.map((d: any) => d.data().content)).toEqual(['first', 'middle', 'second']);
  });

  it('limit caps result count', async () => {
    const db = createSimulationFirestore();
    db._store['agents'] = {
      'a1': { x: 1 },
      'a2': { x: 1 },
      'a3': { x: 1 },
    };
    const result = await db.collection('agents')
      .where('x', '==', 1)
      .limit(2)
      .get();
    expect(result.docs.length).toBe(2);
  });

  it('add() generates an ID and stores document', async () => {
    const db = createSimulationFirestore();
    const ref = await db.collection('posts').add({ content: 'hello' });
    expect(ref.id).toBeTruthy();
    const stored = db._store['posts'][ref.id];
    expect(stored.content).toBe('hello');
  });

  it('count().get() returns document count', async () => {
    const db = createSimulationFirestore();
    db._store['agents'] = {
      'a1': { email_verified: true },
      'a2': { email_verified: true },
      'a3': { email_verified: false },
    };
    const result = await db.collection('agents')
      .where('email_verified', '==', true)
      .count()
      .get();
    expect(result.data().count).toBe(2);
  });

  it('query result doc.ref.update() writes back to store', async () => {
    const db = createSimulationFirestore();
    db._store['agents'] = { 'a1': { name: 'Bot1', verified: false } };
    const result = await db.collection('agents')
      .where('name', '==', 'Bot1')
      .limit(1)
      .get();
    await result.docs[0].ref.update({ verified: true });
    expect(db._store['agents']['a1'].verified).toBe(true);
  });

  it('doc.delete() removes document from store', async () => {
    const db = createSimulationFirestore();
    db._store['agents'] = { 'a1': { name: 'Bot1' } };
    await db.collection('agents').doc('a1').delete();
    expect(db._store['agents']['a1']).toBeUndefined();
  });

  it('where >= comparator works for Timestamp-like strings', async () => {
    const db = createSimulationFirestore();
    db._store['posts'] = {
      'p1': { posted_at: '2026-07-08T00:00:00Z', type: 'status', agent: 'a1' },
      'p2': { posted_at: '2026-07-07T23:59:00Z', type: 'status', agent: 'a1' },
      'p3': { posted_at: '2026-07-08T12:00:00Z', type: 'status', agent: 'a1' },
    };
    const result = await db.collection('posts')
      .where('agent', '==', 'a1')
      .where('type', '==', 'status')
      .where('posted_at', '>=', '2026-07-08T00:00:00Z')
      .get();
    expect(result.docs.length).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd functions && npx vitest run test/simulation/simulation-firestore.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement SimulationFirestore**

Create `functions/test/simulation/simulation-firestore.ts`:

```typescript
/**
 * Enhanced in-memory Firestore mock for simulation tests.
 *
 * Unlike the simple mock in helpers/firebase-mock.ts (which returns
 * hardcoded empty results for queries), this mock actually filters,
 * sorts, and limits against the in-memory store. It also supports
 * add(), count(), doc.ref.update(), and doc.ref.delete().
 *
 * Used by ConferenceSimulator — NOT a replacement for existing test mocks.
 */
import { randomBytes } from 'crypto';

type Store = Record<string, Record<string, any>>;

// Must match the sentinel in setup.ts
const DELETE_SENTINEL = '__FIELD_DELETE__';

interface QueryConstraint {
  type: 'where' | 'orderBy' | 'limit';
  field?: string;
  op?: string;
  value?: any;
  direction?: 'asc' | 'desc';
  limitN?: number;
}

function applyConstraints(
  collection: string,
  store: Store,
  constraints: QueryConstraint[],
  db: ReturnType<typeof createSimulationFirestore>,
) {
  const data = store[collection] || {};
  let entries = Object.entries(data).map(([id, doc]) => ({ id, ...doc }));

  for (const c of constraints) {
    if (c.type === 'where') {
      entries = entries.filter((entry) => {
        const val = entry[c.field!];
        switch (c.op) {
          case '==': return val === c.value;
          case '!=': return val !== c.value;
          case '>': return val > c.value;
          case '>=': return val >= c.value;
          case '<': return val < c.value;
          case '<=': return val <= c.value;
          default: return true;
        }
      });
    }
  }

  const orderBy = constraints.find(c => c.type === 'orderBy');
  if (orderBy) {
    const dir = orderBy.direction === 'desc' ? -1 : 1;
    entries.sort((a, b) => {
      const aVal = a[orderBy.field!];
      const bVal = b[orderBy.field!];
      if (aVal < bVal) return -1 * dir;
      if (aVal > bVal) return 1 * dir;
      return 0;
    });
  }

  const limit = constraints.find(c => c.type === 'limit');
  if (limit) {
    entries = entries.slice(0, limit.limitN);
  }

  const docs = entries.map(entry => {
    const { id, ...docData } = entry;
    return {
      id,
      exists: true,
      data: () => ({ ...docData }),
      ref: db.collection(collection).doc(id), // Real doc ref with update/delete
    };
  });

  return {
    empty: docs.length === 0,
    docs,
    size: docs.length,
    forEach: (fn: (doc: any) => void) => docs.forEach(fn),
  };
}

function createQueryBuilder(
  collection: string,
  store: Store,
  db: ReturnType<typeof createSimulationFirestore>,
  constraints: QueryConstraint[] = [],
) {
  const builder: any = {
    where(field: string, op: string, value: any) {
      return createQueryBuilder(collection, store, db, [
        ...constraints,
        { type: 'where', field, op, value },
      ]);
    },
    orderBy(field: string, direction: 'asc' | 'desc' = 'asc') {
      return createQueryBuilder(collection, store, db, [
        ...constraints,
        { type: 'orderBy', field, direction },
      ]);
    },
    limit(n: number) {
      return createQueryBuilder(collection, store, db, [
        ...constraints,
        { type: 'limit', limitN: n },
      ]);
    },
    count() {
      return {
        get: async () => {
          const result = applyConstraints(collection, store, constraints, db);
          return { data: () => ({ count: result.size }) };
        },
      };
    },
    get: async () => applyConstraints(collection, store, constraints, db),
  };
  return builder;
}

function updateDoc(store: Store, collection: string, id: string, data: any) {
  if (!store[collection]) store[collection] = {};
  const existing = store[collection][id] || {};
  for (const [key, value] of Object.entries(data)) {
    if (value === DELETE_SENTINEL) {
      delete existing[key];
    } else {
      existing[key] = value;
    }
  }
  store[collection][id] = existing;
}

export function createSimulationFirestore() {
  const store: Store = {};

  const db: any = {
    collection(name: string) {
      return {
        doc(id: string) {
          return {
            get: async () => ({
              exists: !!store[name]?.[id],
              data: () => store[name]?.[id] ? { ...store[name][id] } : undefined,
              id,
              ref: db.collection(name).doc(id),
            }),
            set: async (data: any, options?: { merge?: boolean }) => {
              if (!store[name]) store[name] = {};
              if (options?.merge) {
                store[name][id] = { ...store[name][id], ...data };
              } else {
                store[name][id] = { ...data };
              }
            },
            update: async (data: any) => {
              updateDoc(store, name, id, data);
            },
            delete: async () => {
              if (store[name]) {
                delete store[name][id];
              }
            },
            collection(subName: string) {
              const fullPath = `${name}/${id}/${subName}`;
              return db.collection(fullPath);
            },
            // For use as ref
            id,
            path: `${name}/${id}`,
          };
        },
        add: async (data: any) => {
          const id = randomBytes(12).toString('hex');
          if (!store[name]) store[name] = {};
          store[name][id] = { ...data };
          return { id, path: `${name}/${id}` };
        },
        where(field: string, op: string, value: any) {
          return createQueryBuilder(name, store, db, [
            { type: 'where', field, op, value },
          ]);
        },
        orderBy(field: string, direction: 'asc' | 'desc' = 'asc') {
          return createQueryBuilder(name, store, db, [
            { type: 'orderBy', field, direction },
          ]);
        },
        limit(n: number) {
          return createQueryBuilder(name, store, db, [
            { type: 'limit', limitN: n },
          ]);
        },
        count() {
          return {
            get: async () => {
              const data = store[name] || {};
              return { data: () => ({ count: Object.keys(data).length }) };
            },
          };
        },
        get: async () => applyConstraints(name, store, [], db),
      };
    },
    _store: store,
  };

  return db;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd functions && npx vitest run test/simulation/simulation-firestore.test.ts`
Expected: All 12 tests PASS

- [ ] **Step 5: Commit**

```bash
git add functions/test/simulation/simulation-firestore.ts functions/test/simulation/simulation-firestore.test.ts
git commit -m "feat: add SimulationFirestore — enhanced in-memory mock with real queries, add(), count(), ref methods"
```

---

### Task 4: Create fake identities for 5 test bots

**Files:**
- Create: `functions/test/simulation/fake-identities.ts`
- Create: `functions/test/simulation/fake-identities.test.ts`

- [ ] **Step 1: Write failing test**

Create `functions/test/simulation/fake-identities.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { FAKE_BOTS } from './fake-identities.js';

describe('fake identities', () => {
  it('provides exactly 5 bot identities', () => {
    expect(FAKE_BOTS).toHaveLength(5);
  });

  it('each bot has all required fields', () => {
    for (const bot of FAKE_BOTS) {
      expect(bot.email).toMatch(/@/);
      expect(bot.ticket_number).toBeTruthy();
      expect(bot.profile.name).toBeTruthy();
      expect(bot.profile.avatar).toBeTruthy();
      expect(bot.profile.color).toMatch(/^#/);
      expect(bot.profile.bio.length).toBeLessThanOrEqual(280);
      expect(bot.profile.quote.length).toBeLessThanOrEqual(140);
      expect(bot.profile.company.name).toBeTruthy();
      expect(bot.profile.company.url).toMatch(/^https?:\/\//);
      expect(bot.profile.company.description.length).toBeLessThanOrEqual(500);
      expect(bot.profile.company.stage).toMatch(/^(pre-revenue|seed|series-a|series-b|growth)$/);
      expect(bot.profile.company.looking_for.length).toBeGreaterThan(0);
      expect(bot.profile.company.offering.length).toBeGreaterThan(0);
    }
  });

  it('each bot has a talk proposal within limits', () => {
    for (const bot of FAKE_BOTS) {
      expect(bot.talk.title.length).toBeLessThanOrEqual(100);
      expect(bot.talk.format).toBeTruthy();
      expect(bot.talk.tags.length).toBeLessThanOrEqual(5);
    }
  });

  it('each bot has booth data', () => {
    for (const bot of FAKE_BOTS) {
      expect(bot.booth.company_name).toBeTruthy();
      expect(bot.booth.product_description.length).toBeLessThanOrEqual(2000);
    }
  });

  it('all emails are unique', () => {
    const emails = FAKE_BOTS.map(b => b.email);
    expect(new Set(emails).size).toBe(5);
  });

  it('looking_for/offering create complementary matches across bots', () => {
    const allLooking = FAKE_BOTS.flatMap(b => b.profile.company.looking_for);
    const allOffering = FAKE_BOTS.flatMap(b => b.profile.company.offering);
    const overlap = allLooking.filter(l => allOffering.includes(l));
    expect(overlap.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd functions && npx vitest run test/simulation/fake-identities.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement fake identities**

Create `functions/test/simulation/fake-identities.ts` with 5 bot identities. Each bot needs: `email`, `ticket_number`, `profile` (name, avatar, color, bio ≤280, quote ≤140, company with name, url, description ≤500, stage, looking_for[], offering[]), `talk` (title ≤100, topic ≤200, description ≤1000, format, tags ≤5), `booth` (company_name, tagline ≤100, product_description ≤2000, pricing ≤500, founding_team ≤1000, looking_for[], urls[]), `manifesto_edit` string, `yearbook` (reflection ≤500, prediction ≤280, highlight ≤280, would_return boolean, would_return_why ≤280).

Use `.test` TLD for emails. Make looking_for/offering complementary across bots (e.g., bot 1 seeks `fundraising`, bot 5 offers `investment`). Use these 5 companies:

1. **SynthCorp** (seed) — AI back-office automation. Looking: fundraising, customers. Offering: engineering, feedback.
2. **GreenLeaf Analytics** (pre-revenue) — Carbon tracking for SaaS. Looking: beta_testers, mentorship. Offering: feedback, distribution_channel.
3. **VaultEdge Security** (series-a) — Zero-trust for startups. Looking: customers, hiring. Offering: engineering, mentoring.
4. **ArtisanAI** (seed) — AI brand identity. Looking: press, customers, fundraising. Offering: design, feedback.
5. **DataRoam** (growth) — Open data discovery. Looking: government_contracts, partners. Offering: distribution_channel, engineering, investment.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd functions && npx vitest run test/simulation/fake-identities.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add functions/test/simulation/fake-identities.ts functions/test/simulation/fake-identities.test.ts
git commit -m "feat: add 5 fake bot identities with complementary taxonomies"
```

---

### Task 5: Build the ConferenceSimulator

**Critical design note:** `createPhaseGate` (in `phase-gate.ts:5`) requires a **synchronous** `PhaseOverrideGetter: (phaseKey: string) => override | undefined`. The simulator must pass a sync function that reads directly from `_store`, NOT an async function using `loadSettings()`.

**Files:**
- Create: `functions/test/simulation/conference-simulator.ts`
- Create: `functions/test/simulation/conference-simulator.test.ts`

- [ ] **Step 1: Write failing test**

Create `functions/test/simulation/conference-simulator.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import './setup.js';
import { ConferenceSimulator } from './conference-simulator.js';

describe('ConferenceSimulator', () => {
  it('creates an Express app with all routes', () => {
    const sim = new ConferenceSimulator();
    expect(sim.app).toBeDefined();
    expect(sim.db).toBeDefined();
  });

  it('starts with no phases open', () => {
    const sim = new ConferenceSimulator();
    expect(sim.getOpenPhases()).toEqual([]);
  });

  it('opens and closes phases', () => {
    const sim = new ConferenceSimulator();
    sim.openPhase('registration');
    sim.openPhase('cfp');
    expect(sim.getOpenPhases()).toContain('registration');
    expect(sim.getOpenPhases()).toContain('cfp');
    sim.closePhase('registration');
    expect(sim.getOpenPhases()).not.toContain('registration');
  });

  it('setStage replaces all open phases', () => {
    const sim = new ConferenceSimulator();
    sim.openPhase('registration');
    sim.setStage(['voting', 'booth_setup']);
    expect(sim.getOpenPhases()).toEqual(expect.arrayContaining(['voting', 'booth_setup']));
    expect(sim.getOpenPhases()).not.toContain('registration');
  });

  it('extracts verification token from store', () => {
    const sim = new ConferenceSimulator();
    sim.db._store['agents'] = {
      'agent-123': { verification_token: 'abc123token', email_verified: false },
    };
    expect(sim.getVerificationToken('agent-123')).toBe('abc123token');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd functions && npx vitest run test/simulation/conference-simulator.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement ConferenceSimulator**

Create `functions/test/simulation/conference-simulator.ts`:

```typescript
/**
 * ConferenceSimulator — wires the real Express app with a SimulationFirestore.
 *
 * Controls phase advancement, provides helpers for extracting verification
 * tokens, and exposes the Express app for supertest.
 *
 * IMPORTANT: Phase gates require SYNCHRONOUS override getters. This simulator
 * reads overrides directly from _store, never via async loadSettings().
 */
import express from 'express';
import { createSimulationFirestore } from './simulation-firestore.js';
import { createAuthMiddleware } from '../../src/middleware/auth.js';
import { createRateLimiter } from '../../src/middleware/rate-limit.js';
import { createPhaseGate } from '../../src/middleware/phase-gate.js';
import { createIdempotencyMiddleware } from '../../src/middleware/idempotency.js';
import { handleRegister } from '../../src/api/register.js';
import { handleVerifyEmail } from '../../src/api/verify-email.js';
import { handleProfile, handleMe } from '../../src/api/profile.js';
import { handleStatus } from '../../src/api/status.js';
import { handleCreateTalk, handleUpdateTalk } from '../../src/api/talks.js';
import {
  handleCreateOrUpdateBooth,
  handlePostBoothWallMessage,
  handleGetBoothWall,
  handleDeleteBoothWallMessage,
} from '../../src/api/booths.js';
import { handleGetNextTalk, handleVote } from '../../src/api/vote.js';
import {
  handlePostStatus,
  handlePostWall,
  handleDeletePost,
  handleDeleteWallPost,
} from '../../src/api/social.js';
import { handleTalkUpload } from '../../src/api/talk-upload.js';
import { handleRecommend, handleGetRecommendations } from '../../src/api/meetings.js';
import { handleManifestoLock, handleManifestoSubmit } from '../../src/api/manifesto.js';
import { handleYearbook } from '../../src/api/yearbook.js';
import { handlePublicStats } from '../../src/api/public-stats.js';
import { loadSettings } from '../../src/config/settings.js';

const ALL_PHASES = [
  'registration', 'cfp', 'booth_setup', 'voting',
  'talk_uploads', 'show_floor', 'matchmaking', 'manifesto', 'yearbook',
] as const;

export class ConferenceSimulator {
  readonly db: ReturnType<typeof createSimulationFirestore>;
  readonly app: express.Express;
  private _openPhases: Set<string> = new Set();

  constructor() {
    this.db = createSimulationFirestore();
    this.app = this.buildApp();
  }

  openPhase(phase: string): void {
    this._openPhases.add(phase);
    this.syncPhasesToStore();
  }

  closePhase(phase: string): void {
    this._openPhases.delete(phase);
    this.syncPhasesToStore();
  }

  setStage(phases: string[]): void {
    this._openPhases.clear();
    for (const p of phases) this._openPhases.add(p);
    this.syncPhasesToStore();
  }

  getOpenPhases(): string[] {
    return [...this._openPhases];
  }

  getVerificationToken(agentId: string): string | undefined {
    return this.db._store['agents']?.[agentId]?.verification_token;
  }

  getAgentIds(): string[] {
    return Object.keys(this.db._store['agents'] || {});
  }

  seedManifesto(content: string): void {
    if (!this.db._store['manifesto']) this.db._store['manifesto'] = {};
    this.db._store['manifesto']['current'] = {
      content,
      version: 1,
      locked_by: null,
      lock_expires: null,
      updated_at: new Date().toISOString(),
    };
  }

  private syncPhasesToStore(): void {
    const overrides: Record<string, { is_open: boolean }> = {};
    for (const phase of ALL_PHASES) {
      overrides[phase] = { is_open: this._openPhases.has(phase) };
    }
    if (!this.db._store['config']) this.db._store['config'] = {};
    this.db._store['config']['settings'] = {
      ...(this.db._store['config']?.['settings'] || {}),
      phase_overrides: overrides,
    };
  }

  private buildApp(): express.Express {
    const app = express();
    app.use(express.json());

    const db = this.db as any;
    const auth = createAuthMiddleware(db);
    const rateLimiter = createRateLimiter(60);

    // No-op mailer — token is extracted from store directly
    const mailer = {
      sendVerification: async () => {},
    };

    // SYNCHRONOUS phase override getter — reads directly from _store.
    // createPhaseGate requires sync, NOT async.
    const getPhaseOverridesSync = (phaseKey: string) => {
      const settings = this.db._store['config']?.['settings'];
      return settings?.phase_overrides?.[phaseKey];
    };

    // ASYNC getter for handleStatus (which expects async)
    const getPhaseOverridesAsync = async (phaseKey: string) => {
      const settings = await loadSettings(db);
      return settings.phase_overrides[phaseKey];
    };

    const getGlobalWriteFreeze = async (): Promise<boolean> => {
      const settings = await loadSettings(db);
      return settings.global_write_freeze;
    };

    // Public endpoints
    app.post('/api/register', handleRegister(db, mailer));
    app.get('/api/verify-email', handleVerifyEmail(db));
    app.get('/api/status', handleStatus(getPhaseOverridesAsync, getGlobalWriteFreeze));
    app.get('/api/public/stats', handlePublicStats(db));

    // Authenticated endpoints
    app.post('/api/profile', auth, rateLimiter, handleProfile(db));
    app.get('/api/me', auth, handleMe(db));

    // Phase gates — use SYNCHRONOUS getter
    const cfpGate = createPhaseGate('cfp', getPhaseOverridesSync);
    const boothSetupGate = createPhaseGate('booth_setup', getPhaseOverridesSync);
    const votingGate = createPhaseGate('voting', getPhaseOverridesSync);
    const showFloorGate = createPhaseGate('show_floor', getPhaseOverridesSync);
    const talkUploadGate = createPhaseGate('talk_uploads', getPhaseOverridesSync);
    const matchmakingGate = createPhaseGate('matchmaking', getPhaseOverridesSync);
    const manifestoPhaseGate = createPhaseGate('manifesto', getPhaseOverridesSync);
    const yearbookPhaseGate = createPhaseGate('yearbook', getPhaseOverridesSync);

    const idempotency = createIdempotencyMiddleware();

    const getBoothWallMaxPerDay = async (): Promise<number> => {
      const settings = await loadSettings(db);
      return settings.booth_wall_max_per_day;
    };

    // Talk proposal endpoints
    app.post('/api/talks', auth, rateLimiter, cfpGate, idempotency, handleCreateTalk(db));
    app.post('/api/talks/:id', auth, rateLimiter, cfpGate, handleUpdateTalk(db));

    // Booth endpoints
    app.post('/api/booths', auth, rateLimiter, boothSetupGate, idempotency, handleCreateOrUpdateBooth(db));
    app.post('/api/booths/:id/wall', auth, rateLimiter, handlePostBoothWallMessage(db, getBoothWallMaxPerDay));
    app.get('/api/booths/:id/wall', auth, handleGetBoothWall(db));
    app.delete('/api/booths/:id/wall/:messageId', auth, rateLimiter, handleDeleteBoothWallMessage(db));

    // Voting endpoints
    app.get('/api/talks/next', auth, rateLimiter, votingGate, handleGetNextTalk(db));
    app.post('/api/vote', auth, rateLimiter, votingGate, async (req, res) => {
      const settings = await loadSettings(db);
      return handleVote(db, settings)(req as any, res);
    });

    // Social endpoints
    app.post('/api/social/status', auth, rateLimiter, showFloorGate, async (req, res) => {
      const settings = await loadSettings(db);
      return handlePostStatus(db, settings)(req as any, res);
    });
    app.post('/api/social/wall/:id', auth, rateLimiter, showFloorGate, async (req, res) => {
      const settings = await loadSettings(db);
      return handlePostWall(db, settings)(req as any, res);
    });
    app.delete('/api/social/:id', auth, rateLimiter, showFloorGate, handleDeletePost(db));
    app.delete('/api/social/wall/:id/:postId', auth, rateLimiter, showFloorGate, handleDeleteWallPost(db));

    // Talk upload
    const getTalkSettings = async () => {
      const settings = await loadSettings(db);
      return {
        talk_max_duration_seconds: settings.talk_max_duration_seconds,
        talk_accepted_formats: settings.talk_accepted_formats,
        talk_accepted_languages: settings.talk_accepted_languages,
      };
    };
    app.post('/api/talks/:id/upload', auth, rateLimiter, talkUploadGate, handleTalkUpload(db, getTalkSettings));

    // Meeting recommendation endpoints
    app.post('/api/meetings/recommend', auth, rateLimiter, matchmakingGate, handleRecommend(db));
    app.get('/api/meetings/recommendations', auth, rateLimiter, matchmakingGate, handleGetRecommendations(db));

    // Manifesto endpoints
    app.post('/api/manifesto/lock', auth, rateLimiter, manifestoPhaseGate, async (req, res) => {
      const settings = await loadSettings(db);
      await handleManifestoLock(db, settings)(req as any, res);
    });
    app.post('/api/manifesto/submit', auth, rateLimiter, manifestoPhaseGate, async (req, res) => {
      const settings = await loadSettings(db);
      await handleManifestoSubmit(db, settings)(req as any, res);
    });

    // Yearbook endpoint
    app.post('/api/yearbook', auth, rateLimiter, yearbookPhaseGate, async (req, res) => {
      const settings = await loadSettings(db);
      await handleYearbook(db, settings)(req as any, res);
    });

    // Health check
    app.get('/api/health', (_req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    return app;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd functions && npx vitest run test/simulation/conference-simulator.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add functions/test/simulation/conference-simulator.ts functions/test/simulation/conference-simulator.test.ts
git commit -m "feat: add ConferenceSimulator with sync phase overrides and Express wiring"
```

---

### Task 6: Build the NaiveBotAgent

**Critical note from code review:** The `GET /api/talks/next` response shape is `{ proposal: { id, ... }, remaining: N }`. The bot must read `proposal.id`, not `id` at top level.

**Files:**
- Create: `functions/test/simulation/naive-bot.ts`
- Create: `functions/test/simulation/naive-bot.test.ts`

- [ ] **Step 1: Write failing test**

Create `functions/test/simulation/naive-bot.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import './setup.js';
import { NaiveBotAgent } from './naive-bot.js';
import { ConferenceSimulator } from './conference-simulator.js';
import { FAKE_BOTS } from './fake-identities.js';

describe('NaiveBotAgent', () => {
  it('creates a bot from fake identity', () => {
    const sim = new ConferenceSimulator();
    const bot = new NaiveBotAgent(sim.app, FAKE_BOTS[0]);
    expect(bot.identity.email).toBe('nova@synthcorp.test');
    expect(bot.agentId).toBeUndefined();
    expect(bot.apiKey).toBeUndefined();
  });

  it('registers and receives agent_id', async () => {
    const sim = new ConferenceSimulator();
    const bot = new NaiveBotAgent(sim.app, FAKE_BOTS[0]);
    const result = await bot.register();
    expect(result.status).toBe(201);
    expect(bot.agentId).toBeDefined();
  });

  it('verifies email using extracted token', async () => {
    const sim = new ConferenceSimulator();
    const bot = new NaiveBotAgent(sim.app, FAKE_BOTS[0]);
    await bot.register();
    const token = sim.getVerificationToken(bot.agentId!);
    expect(token).toBeDefined();
    const result = await bot.verifyEmail(token!);
    expect(result.status).toBe(200);
    expect(bot.apiKey).toBeDefined();
  });

  it('can check status after verification', async () => {
    const sim = new ConferenceSimulator();
    sim.openPhase('registration');
    const bot = new NaiveBotAgent(sim.app, FAKE_BOTS[0]);
    await bot.register();
    const token = sim.getVerificationToken(bot.agentId!);
    await bot.verifyEmail(token!);
    const result = await bot.checkStatus();
    expect(result.status).toBe(200);
    expect(result.body.active).toContain('registration');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd functions && npx vitest run test/simulation/naive-bot.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement NaiveBotAgent**

Create `functions/test/simulation/naive-bot.ts`:

```typescript
/**
 * NaiveBotAgent — simulates a "naive" AI agent that only knows the skill document.
 *
 * Wraps supertest calls against the Express app. Stores credentials after
 * registration/verification. Methods match the skill lifecycle steps.
 */
import request from 'supertest';
import type { Express } from 'express';
import type { FakeBot } from './fake-identities.js';

export class NaiveBotAgent {
  readonly identity: FakeBot;
  private _app: Express;
  private _agentId?: string;
  private _apiKey?: string;

  constructor(app: Express, identity: FakeBot) {
    this._app = app;
    this.identity = identity;
  }

  get agentId(): string | undefined { return this._agentId; }
  get apiKey(): string | undefined { return this._apiKey; }

  async register() {
    const res = await request(this._app)
      .post('/api/register')
      .send({ email: this.identity.email, ticket_number: this.identity.ticket_number });
    if (res.status === 201) this._agentId = res.body.agent_id;
    return res;
  }

  async verifyEmail(token: string) {
    const res = await request(this._app)
      .get('/api/verify-email')
      .query({ token });
    if (res.status === 200 && res.body.api_key) this._apiKey = res.body.api_key;
    return res;
  }

  async checkStatus() {
    return request(this._app).get('/api/status');
  }

  async getMe() {
    return request(this._app)
      .get('/api/me')
      .set('Authorization', `Bearer ${this._apiKey}`);
  }

  async createProfile() {
    return request(this._app)
      .post('/api/profile')
      .set('Authorization', `Bearer ${this._apiKey}`)
      .send(this.identity.profile);
  }

  async submitTalk() {
    return request(this._app)
      .post('/api/talks')
      .set('Authorization', `Bearer ${this._apiKey}`)
      .set('Idempotency-Key', `talk-${this._agentId}`)
      .send(this.identity.talk);
  }

  async createBooth() {
    return request(this._app)
      .post('/api/booths')
      .set('Authorization', `Bearer ${this._apiKey}`)
      .set('Idempotency-Key', `booth-${this._agentId}`)
      .send(this.identity.booth);
  }

  async getNextTalk() {
    return request(this._app)
      .get('/api/talks/next')
      .set('Authorization', `Bearer ${this._apiKey}`);
  }

  async vote(proposalId: string, score: number, rationale: string) {
    return request(this._app)
      .post('/api/vote')
      .set('Authorization', `Bearer ${this._apiKey}`)
      .send({ proposal_id: proposalId, score, rationale });
  }

  /**
   * Vote on all available talks. Reads the correct response shape:
   * { proposal: { id, title, ... } | null, remaining: N }
   */
  async voteOnAllTalks() {
    const results = [];
    while (true) {
      const next = await this.getNextTalk();
      // No more proposals: proposal is null
      if (!next.body.proposal || !next.body.proposal.id) break;
      const score = 50 + Math.floor(Math.random() * 50);
      const res = await this.vote(
        next.body.proposal.id,
        score,
        `Interesting proposal about ${next.body.proposal.topic || next.body.proposal.title}`,
      );
      results.push(res);
    }
    return results;
  }

  async uploadTalk(proposalId: string) {
    return request(this._app)
      .post(`/api/talks/${proposalId}/upload`)
      .set('Authorization', `Bearer ${this._apiKey}`)
      .send({
        video_url: `https://storage.test/${this._agentId}/talk.mp4`,
        transcript: `Transcript for ${this.identity.talk.title}. ${this.identity.talk.description}`,
        language: 'EN',
        duration: 300,
      });
  }

  async postBoothWallMessage(boothId: string, content: string) {
    return request(this._app)
      .post(`/api/booths/${boothId}/wall`)
      .set('Authorization', `Bearer ${this._apiKey}`)
      .send({ content });
  }

  async readBoothWall(boothId: string) {
    return request(this._app)
      .get(`/api/booths/${boothId}/wall`)
      .set('Authorization', `Bearer ${this._apiKey}`);
  }

  async postSocialStatus(content: string) {
    return request(this._app)
      .post('/api/social/status')
      .set('Authorization', `Bearer ${this._apiKey}`)
      .send({ content });
  }

  async postAgentWall(targetAgentId: string, content: string) {
    return request(this._app)
      .post(`/api/social/wall/${targetAgentId}`)
      .set('Authorization', `Bearer ${this._apiKey}`)
      .send({ content });
  }

  async recommendMeeting(targetAgentId: string, rationale: string, matchScore: number) {
    return request(this._app)
      .post('/api/meetings/recommend')
      .set('Authorization', `Bearer ${this._apiKey}`)
      .send({ target_agent_id: targetAgentId, rationale, match_score: matchScore });
  }

  async getRecommendations() {
    return request(this._app)
      .get('/api/meetings/recommendations')
      .set('Authorization', `Bearer ${this._apiKey}`);
  }

  async lockManifesto() {
    return request(this._app)
      .post('/api/manifesto/lock')
      .set('Authorization', `Bearer ${this._apiKey}`);
  }

  async submitManifesto(content: string, editSummary: string) {
    return request(this._app)
      .post('/api/manifesto/submit')
      .set('Authorization', `Bearer ${this._apiKey}`)
      .send({ content, edit_summary: editSummary });
  }

  async submitYearbook() {
    return request(this._app)
      .post('/api/yearbook')
      .set('Authorization', `Bearer ${this._apiKey}`)
      .send(this.identity.yearbook);
  }

  async getPublicStats() {
    return request(this._app).get('/api/public/stats');
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd functions && npx vitest run test/simulation/naive-bot.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add functions/test/simulation/naive-bot.ts functions/test/simulation/naive-bot.test.ts
git commit -m "feat: add NaiveBotAgent with correct response shape handling"
```

---

## Chunk 2: Phase-by-Phase Simulation Tests

### Task 7: Shared setup helper — register and verify all bots

**Files:**
- Create: `functions/test/simulation/setup-bots.ts`

- [ ] **Step 1: Write the helper**

Create `functions/test/simulation/setup-bots.ts`:

```typescript
import { ConferenceSimulator } from './conference-simulator.js';
import { NaiveBotAgent } from './naive-bot.js';
import { FAKE_BOTS } from './fake-identities.js';

export async function registerAllBots(sim: ConferenceSimulator): Promise<NaiveBotAgent[]> {
  const bots: NaiveBotAgent[] = [];
  for (const identity of FAKE_BOTS) {
    const bot = new NaiveBotAgent(sim.app, identity);
    const regRes = await bot.register();
    if (regRes.status !== 201) {
      throw new Error(`Registration failed for ${identity.email}: ${regRes.status} ${JSON.stringify(regRes.body)}`);
    }
    const token = sim.getVerificationToken(bot.agentId!);
    if (!token) {
      throw new Error(`No verification token found for ${identity.email}`);
    }
    const verRes = await bot.verifyEmail(token);
    if (verRes.status !== 200) {
      throw new Error(`Verification failed for ${identity.email}: ${verRes.status} ${JSON.stringify(verRes.body)}`);
    }
    bots.push(bot);
  }
  return bots;
}
```

- [ ] **Step 2: Commit**

```bash
git add functions/test/simulation/setup-bots.ts
git commit -m "feat: add registerAllBots helper for simulation test setup"
```

---

### Task 8: Phase test — Registration + Verification + Profile

**Files:**
- Create: `functions/test/simulation/phase-registration.test.ts`

- [ ] **Step 1: Write the test**

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import './setup.js';
import { ConferenceSimulator } from './conference-simulator.js';
import { NaiveBotAgent } from './naive-bot.js';
import { FAKE_BOTS } from './fake-identities.js';
import { registerAllBots } from './setup-bots.js';

describe('Phase: Registration + Verification + Profile', () => {
  let sim: ConferenceSimulator;
  let bots: NaiveBotAgent[];

  beforeAll(async () => {
    sim = new ConferenceSimulator();
    bots = await registerAllBots(sim);
  });

  it('all 5 bots registered successfully', () => {
    expect(bots).toHaveLength(5);
    for (const bot of bots) {
      expect(bot.agentId).toBeDefined();
      expect(bot.apiKey).toBeDefined();
    }
  });

  it('all agent IDs are unique', () => {
    const ids = bots.map(b => b.agentId);
    expect(new Set(ids).size).toBe(5);
  });

  it('all bots can create profiles', async () => {
    for (const bot of bots) {
      const res = await bot.createProfile();
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('updated');
    }
  });

  it('all bots can read their own profile back', async () => {
    for (const bot of bots) {
      const res = await bot.getMe();
      expect(res.status).toBe(200);
      expect(res.body.profile.name).toBe(bot.identity.profile.name);
      expect(res.body.profile.company.name).toBe(bot.identity.profile.company.name);
    }
  });

  it('duplicate registration is rejected', async () => {
    const dupeBot = new NaiveBotAgent(sim.app, FAKE_BOTS[0]);
    const res = await dupeBot.register();
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('already_exists');
  });

  it('unauthenticated request to /api/me is rejected', async () => {
    const res = await new NaiveBotAgent(sim.app, FAKE_BOTS[0]).getMe();
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test, debug, iterate until passing**

Run: `cd functions && npx vitest run test/simulation/phase-registration.test.ts`

This is the first test hitting real handlers through the full middleware chain. Expect to debug SimulationFirestore gaps here. Common issues:
- Auth middleware query pattern not matching
- `hashApiKey` import path issues
- Express error handling

- [ ] **Step 3: Commit**

```bash
git add functions/test/simulation/phase-registration.test.ts
git commit -m "test: phase-registration — 5 bots register, verify, create profiles"
```

---

### Task 9: Phase test — CFP (talk proposals)

**Files:**
- Create: `functions/test/simulation/phase-cfp.test.ts`

- [ ] **Step 1: Write the test**

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import './setup.js';
import { ConferenceSimulator } from './conference-simulator.js';
import { NaiveBotAgent } from './naive-bot.js';
import { registerAllBots } from './setup-bots.js';

describe('Phase: CFP — Talk Proposals', () => {
  let sim: ConferenceSimulator;
  let bots: NaiveBotAgent[];
  const talkIds: string[] = [];

  beforeAll(async () => {
    sim = new ConferenceSimulator();
    bots = await registerAllBots(sim);
    for (const bot of bots) await bot.createProfile();
    sim.openPhase('cfp');
  });

  it('all 5 bots submit talk proposals', async () => {
    for (const bot of bots) {
      const res = await bot.submitTalk();
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('submitted');
      expect(res.body.id).toBeDefined();
      talkIds.push(res.body.id);
    }
    expect(talkIds).toHaveLength(5);
  });

  it('duplicate talk submission is rejected', async () => {
    const res = await bots[0].submitTalk();
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('already_exists');
  });

  it('talk submission is rejected when CFP is closed', async () => {
    sim.closePhase('cfp');
    // Register a new late bot
    const lateBotIdentity = {
      ...bots[0].identity,
      email: 'late@latecomer.test',
      ticket_number: 'SF2026-LATE',
    };
    const lateBot = new NaiveBotAgent(sim.app, lateBotIdentity as any);
    await lateBot.register();
    const token = sim.getVerificationToken(lateBot.agentId!);
    await lateBot.verifyEmail(token!);

    const res = await lateBot.submitTalk();
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('phase_closed');

    sim.openPhase('cfp'); // Re-open for subsequent test suites
  });
});
```

- [ ] **Step 2: Run test, fix any gaps, iterate**

Run: `cd functions && npx vitest run test/simulation/phase-cfp.test.ts`

- [ ] **Step 3: Commit**

```bash
git add functions/test/simulation/phase-cfp.test.ts
git commit -m "test: phase-cfp — 5 bots submit talk proposals, duplicate + phase-closed rejection"
```

---

### Task 10: Phase test — Booth Setup

**Files:**
- Create: `functions/test/simulation/phase-booth-setup.test.ts`

- [ ] **Step 1: Write the test**

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import './setup.js';
import { ConferenceSimulator } from './conference-simulator.js';
import { NaiveBotAgent } from './naive-bot.js';
import { registerAllBots } from './setup-bots.js';

describe('Phase: Booth Setup', () => {
  let sim: ConferenceSimulator;
  let bots: NaiveBotAgent[];

  beforeAll(async () => {
    sim = new ConferenceSimulator();
    bots = await registerAllBots(sim);
    for (const bot of bots) await bot.createProfile();
    sim.openPhase('booth_setup');
  });

  it('all 5 bots create booths', async () => {
    for (const bot of bots) {
      const res = await bot.createBooth();
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('created');
      expect(res.body.id).toBeDefined();
    }
  });

  it('re-submitting updates existing booth', async () => {
    const res = await bots[0].createBooth();
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('updated');
  });
});
```

- [ ] **Step 2: Run test, fix gaps, iterate**

- [ ] **Step 3: Commit**

```bash
git add functions/test/simulation/phase-booth-setup.test.ts
git commit -m "test: phase-booth-setup — 5 bots create booths, updates work"
```

---

### Task 11: Phase test — Voting

**Files:**
- Create: `functions/test/simulation/phase-voting.test.ts`

- [ ] **Step 1: Write the test**

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import './setup.js';
import { ConferenceSimulator } from './conference-simulator.js';
import { NaiveBotAgent } from './naive-bot.js';
import { registerAllBots } from './setup-bots.js';

describe('Phase: Voting', () => {
  let sim: ConferenceSimulator;
  let bots: NaiveBotAgent[];

  beforeAll(async () => {
    sim = new ConferenceSimulator();
    bots = await registerAllBots(sim);
    for (const bot of bots) await bot.createProfile();

    sim.openPhase('cfp');
    for (const bot of bots) await bot.submitTalk();
    sim.closePhase('cfp');

    sim.openPhase('voting');
  });

  it('each bot votes on all other talks (4 each)', async () => {
    for (const bot of bots) {
      const results = await bot.voteOnAllTalks();
      expect(results.length).toBe(4);
      for (const res of results) {
        expect([200, 201]).toContain(res.status);
      }
    }
  });

  it('total votes in system equals 20 (5 bots × 4 votes each)', () => {
    const votes = sim.db._store['votes'] || {};
    expect(Object.keys(votes).length).toBe(20);
  });

  it('each talk has 4 votes and an average score', () => {
    const talks = sim.db._store['talks'] || {};
    for (const [_id, talk] of Object.entries(talks) as [string, any][]) {
      expect(talk.vote_count).toBe(4);
      expect(talk.avg_score).toBeGreaterThan(0);
      expect(talk.avg_score).toBeLessThanOrEqual(100);
    }
  });

  it('after voting, getNextTalk returns null proposal for each bot', async () => {
    for (const bot of bots) {
      const res = await bot.getNextTalk();
      expect(res.status).toBe(200);
      expect(res.body.proposal).toBeNull();
    }
  });
});
```

- [ ] **Step 2: Run test, fix gaps, iterate**

- [ ] **Step 3: Commit**

```bash
git add functions/test/simulation/phase-voting.test.ts
git commit -m "test: phase-voting — 5 bots cross-vote on all talks, 20 total votes"
```

---

### Task 12: Fix production bug — talk-upload reads from wrong collection

**Files:**
- Modify: `functions/src/api/talk-upload.ts`

- [ ] **Step 1: Identify the bug**

`handleTalkUpload` at line 18 reads from `db.collection('proposals')`, but `handleCreateTalk` writes to `db.collection('talks')`. There is no `proposals` collection — talk proposals are stored in `talks`.

- [ ] **Step 2: Fix the handler**

In `functions/src/api/talk-upload.ts`, change all references from `proposals` to `talks`:
- Line 18: `db.collection('proposals')` → `db.collection('talks')`
- Line 70: `db.collection('proposals')` → `db.collection('talks')`

- [ ] **Step 3: Run existing tests to verify no regressions**

Run: `cd functions && npx vitest run`
Expected: All existing tests still pass

- [ ] **Step 4: Commit**

```bash
git add functions/src/api/talk-upload.ts
git commit -m "fix: talk-upload handler reads from 'talks' collection, not 'proposals'"
```

---

### Task 13: Phase test — Talk Uploads

**Files:**
- Create: `functions/test/simulation/phase-talk-uploads.test.ts`

- [ ] **Step 1: Write the test**

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import './setup.js';
import { ConferenceSimulator } from './conference-simulator.js';
import { NaiveBotAgent } from './naive-bot.js';
import { registerAllBots } from './setup-bots.js';

describe('Phase: Talk Uploads', () => {
  let sim: ConferenceSimulator;
  let bots: NaiveBotAgent[];
  const talkIds: Record<string, string> = {};

  beforeAll(async () => {
    sim = new ConferenceSimulator();
    bots = await registerAllBots(sim);
    for (const bot of bots) await bot.createProfile();

    sim.openPhase('cfp');
    for (const bot of bots) {
      const res = await bot.submitTalk();
      talkIds[bot.agentId!] = res.body.id;
    }
    sim.closePhase('cfp');

    sim.openPhase('talk_uploads');
  });

  it('all 5 bots upload talk content', async () => {
    for (const bot of bots) {
      const proposalId = talkIds[bot.agentId!];
      const res = await bot.uploadTalk(proposalId);
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('talk_uploaded');
    }
  });

  it('re-upload replaces previous content', async () => {
    const proposalId = talkIds[bots[0].agentId!];
    const res = await bots[0].uploadTalk(proposalId);
    expect(res.status).toBe(201);
  });
});
```

- [ ] **Step 2: Run test, fix gaps, iterate**

- [ ] **Step 3: Commit**

```bash
git add functions/test/simulation/phase-talk-uploads.test.ts
git commit -m "test: phase-talk-uploads — 5 bots upload talks, re-upload works"
```

---

### Task 14: Phase test — Show Floor (social + booth walls)

**Files:**
- Create: `functions/test/simulation/phase-show-floor.test.ts`

- [ ] **Step 1: Write the test**

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import './setup.js';
import { ConferenceSimulator } from './conference-simulator.js';
import { NaiveBotAgent } from './naive-bot.js';
import { registerAllBots } from './setup-bots.js';

describe('Phase: Show Floor', () => {
  let sim: ConferenceSimulator;
  let bots: NaiveBotAgent[];
  const boothIds: Record<string, string> = {};

  beforeAll(async () => {
    sim = new ConferenceSimulator();
    bots = await registerAllBots(sim);
    for (const bot of bots) await bot.createProfile();

    sim.openPhase('booth_setup');
    for (const bot of bots) {
      const res = await bot.createBooth();
      boothIds[bot.agentId!] = res.body.id;
    }
    sim.closePhase('booth_setup');

    sim.openPhase('show_floor');
  });

  it('bots post status updates', async () => {
    for (const bot of bots) {
      const res = await bot.postSocialStatus(
        `Hello from ${bot.identity.profile.name}! Excited to be at Startupfest.`,
      );
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('posted');
    }
  });

  it('bots leave messages on each others booths', async () => {
    const res = await bots[0].postBoothWallMessage(
      boothIds[bots[1].agentId!],
      `Great product, ${bots[1].identity.profile.company.name}! Let's chat.`,
    );
    expect(res.status).toBe(201);
  });

  it('cannot post on own booth wall', async () => {
    const res = await bots[0].postBoothWallMessage(
      boothIds[bots[0].agentId!],
      'Trying to post on my own booth',
    );
    expect(res.status).toBe(400);
  });

  it('booth owner can read their wall messages', async () => {
    const res = await bots[1].readBoothWall(boothIds[bots[1].agentId!]);
    expect(res.status).toBe(200);
    expect(res.body.messages.length).toBeGreaterThan(0);
  });

  it('bots post on each others profile walls', async () => {
    const res = await bots[2].postAgentWall(
      bots[3].agentId!,
      `Love your work on ${bots[3].identity.profile.company.name}!`,
    );
    expect(res.status).toBe(201);
  });

  it('cannot post on own profile wall', async () => {
    const res = await bots[0].postAgentWall(
      bots[0].agentId!,
      'Trying to post on my own wall',
    );
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test, fix gaps, iterate**

- [ ] **Step 3: Commit**

```bash
git add functions/test/simulation/phase-show-floor.test.ts
git commit -m "test: phase-show-floor — social posts, booth walls, self-post rejection"
```

---

### Task 15: Phase test — Matchmaking

**Files:**
- Create: `functions/test/simulation/phase-matchmaking.test.ts`

- [ ] **Step 1: Write the test**

Note: The recommendation pattern creates **mutual pairs** to test signal strength upgrade. Bot 0 → Bot 4 and Bot 4 → Bot 0 creates a mutual "high" signal.

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import './setup.js';
import { ConferenceSimulator } from './conference-simulator.js';
import { NaiveBotAgent } from './naive-bot.js';
import { registerAllBots } from './setup-bots.js';

describe('Phase: Matchmaking', () => {
  let sim: ConferenceSimulator;
  let bots: NaiveBotAgent[];

  beforeAll(async () => {
    sim = new ConferenceSimulator();
    bots = await registerAllBots(sim);
    for (const bot of bots) await bot.createProfile();
    sim.openPhase('matchmaking');
  });

  it('bot 0 recommends bot 4 (one-sided = low signal)', async () => {
    const res = await bots[0].recommendMeeting(
      bots[4].agentId!,
      'DataRoam offers investment and we need fundraising.',
      85,
    );
    expect(res.status).toBe(201);
    expect(res.body.signal_strength).toBe('low');
  });

  it('bot 4 recommends bot 0 (mutual = high signal)', async () => {
    const res = await bots[4].recommendMeeting(
      bots[0].agentId!,
      'SynthCorp has engineering talent we need.',
      90,
    );
    expect(res.status).toBe(201);
    expect(res.body.signal_strength).toBe('high');
  });

  it('cannot recommend self', async () => {
    const res = await bots[0].recommendMeeting(
      bots[0].agentId!,
      'Trying to recommend myself',
      50,
    );
    expect(res.status).toBe(400);
  });

  it('bots can retrieve their recommendations', async () => {
    const res = await bots[0].getRecommendations();
    expect(res.status).toBe(200);
    expect(res.body.recommendations.length).toBeGreaterThan(0);
  });

  it('additional cross-recommendations work', async () => {
    // Bot 1 recommends bot 2, bot 2 recommends bot 3
    const r1 = await bots[1].recommendMeeting(bots[2].agentId!, 'Potential partner', 75);
    expect([200, 201]).toContain(r1.status);
    const r2 = await bots[2].recommendMeeting(bots[3].agentId!, 'Security expertise needed', 80);
    expect([200, 201]).toContain(r2.status);
  });
});
```

- [ ] **Step 2: Run test, fix gaps, iterate**

- [ ] **Step 3: Commit**

```bash
git add functions/test/simulation/phase-matchmaking.test.ts
git commit -m "test: phase-matchmaking — recommendations, mutual upgrade, self-rejection"
```

---

### Task 16: Phase test — Manifesto

**Files:**
- Create: `functions/test/simulation/phase-manifesto.test.ts`

- [ ] **Step 1: Write the test**

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import './setup.js';
import { ConferenceSimulator } from './conference-simulator.js';
import { NaiveBotAgent } from './naive-bot.js';
import { registerAllBots } from './setup-bots.js';

describe('Phase: Manifesto', () => {
  let sim: ConferenceSimulator;
  let bots: NaiveBotAgent[];

  beforeAll(async () => {
    sim = new ConferenceSimulator();
    bots = await registerAllBots(sim);
    for (const bot of bots) await bot.createProfile();
    sim.seedManifesto('We, the agentic co-founders of Startupfest 2026, believe in building a better future.');
    sim.openPhase('manifesto');
  });

  it('first bot locks, edits, and submits the manifesto', async () => {
    const lockRes = await bots[0].lockManifesto();
    expect(lockRes.status).toBe(200);
    expect(lockRes.body.locked).toBe(true);
    expect(lockRes.body.content).toBeDefined();
    expect(lockRes.body.version).toBe(1);

    const newContent = lockRes.body.content + '\n\n' + bots[0].identity.manifesto_edit;
    const submitRes = await bots[0].submitManifesto(newContent, 'Added thoughts on automation');
    expect(submitRes.status).toBe(200);
    expect(submitRes.body.version).toBe(2);
  });

  it('second bot sees updated content and can edit', async () => {
    const lockRes = await bots[1].lockManifesto();
    expect(lockRes.status).toBe(200);
    expect(lockRes.body.version).toBe(2);
    expect(lockRes.body.content).toContain(bots[0].identity.manifesto_edit);

    const newContent = lockRes.body.content + '\n\n' + bots[1].identity.manifesto_edit;
    const submitRes = await bots[1].submitManifesto(newContent, 'Added thoughts on impact');
    expect(submitRes.status).toBe(200);
    expect(submitRes.body.version).toBe(3);
  });

  it('first bot cannot edit again (already edited)', async () => {
    const lockRes = await bots[0].lockManifesto();
    expect(lockRes.status).toBe(403);
    expect(lockRes.body.error).toBe('already_edited');
  });

  it('remaining bots edit sequentially, manifesto grows', async () => {
    for (const bot of bots.slice(2)) {
      const lockRes = await bot.lockManifesto();
      expect(lockRes.status).toBe(200);
      expect(lockRes.body.locked).toBe(true);

      const newContent = lockRes.body.content + '\n\n' + bot.identity.manifesto_edit;
      const submitRes = await bot.submitManifesto(newContent, `Edit by ${bot.identity.profile.name}`);
      expect(submitRes.status).toBe(200);
    }

    // Final version: 1 initial + 5 edits = 6
    const finalVersion = sim.db._store['manifesto']?.['current']?.version;
    expect(finalVersion).toBe(6);
  });
});
```

- [ ] **Step 2: Run test, fix gaps, iterate**

- [ ] **Step 3: Commit**

```bash
git add functions/test/simulation/phase-manifesto.test.ts
git commit -m "test: phase-manifesto — 5 bots edit sequentially, version increments, no re-edits"
```

---

### Task 17: Phase test — Yearbook

**Files:**
- Create: `functions/test/simulation/phase-yearbook.test.ts`

- [ ] **Step 1: Write the test**

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import './setup.js';
import { ConferenceSimulator } from './conference-simulator.js';
import { NaiveBotAgent } from './naive-bot.js';
import { registerAllBots } from './setup-bots.js';

describe('Phase: Yearbook', () => {
  let sim: ConferenceSimulator;
  let bots: NaiveBotAgent[];

  beforeAll(async () => {
    sim = new ConferenceSimulator();
    bots = await registerAllBots(sim);
    for (const bot of bots) await bot.createProfile();
    sim.openPhase('yearbook');
  });

  it('all 5 bots submit yearbook entries', async () => {
    for (const bot of bots) {
      const res = await bot.submitYearbook();
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('created');
    }
  });

  it('duplicate yearbook entry is rejected', async () => {
    const res = await bots[0].submitYearbook();
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('already_exists');
  });

  it('yearbook entries stored in Firestore', () => {
    const yearbook = sim.db._store['yearbook'] || {};
    expect(Object.keys(yearbook).length).toBe(5);
  });
});
```

- [ ] **Step 2: Run test, fix gaps, iterate**

- [ ] **Step 3: Commit**

```bash
git add functions/test/simulation/phase-yearbook.test.ts
git commit -m "test: phase-yearbook — 5 bots submit entries, duplicates rejected"
```

---

## Chunk 3: Full Conference End-to-End + Verification

### Task 18: Full conference simulation — all phases, 5 bots, one test suite

**IMPORTANT:** This test must run sequentially (not with `--pool=threads`). The nested describes share mutable state across phases.

**Files:**
- Create: `functions/test/simulation/full-conference.test.ts`

- [ ] **Step 1: Write the test**

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import './setup.js';
import { ConferenceSimulator } from './conference-simulator.js';
import { NaiveBotAgent } from './naive-bot.js';
import { registerAllBots } from './setup-bots.js';

describe('Full Conference Simulation — 5 Bots, All Phases', () => {
  let sim: ConferenceSimulator;
  let bots: NaiveBotAgent[];
  const talkIds: Record<string, string> = {};
  const boothIds: Record<string, string> = {};

  describe('Phase 1: Registration + Verification + Profile', () => {
    beforeAll(async () => {
      sim = new ConferenceSimulator();
      bots = await registerAllBots(sim);
    });

    it('5 bots registered and verified', () => {
      expect(bots).toHaveLength(5);
      for (const bot of bots) {
        expect(bot.agentId).toBeDefined();
        expect(bot.apiKey).toBeDefined();
      }
    });

    it('5 profiles created', async () => {
      for (const bot of bots) {
        const res = await bot.createProfile();
        expect(res.status).toBe(200);
      }
    });
  });

  describe('Phase 2: CFP', () => {
    beforeAll(() => sim.setStage(['cfp']));

    it('5 talks submitted', async () => {
      for (const bot of bots) {
        const res = await bot.submitTalk();
        expect(res.status).toBe(201);
        talkIds[bot.agentId!] = res.body.id;
      }
    });
  });

  describe('Phase 3: Booth Setup', () => {
    beforeAll(() => sim.setStage(['booth_setup']));

    it('5 booths created', async () => {
      for (const bot of bots) {
        const res = await bot.createBooth();
        expect(res.status).toBe(201);
        boothIds[bot.agentId!] = res.body.id;
      }
    });
  });

  describe('Phase 4: Voting', () => {
    beforeAll(() => sim.setStage(['voting']));

    it('20 votes cast (5 bots × 4 talks each)', async () => {
      for (const bot of bots) {
        const results = await bot.voteOnAllTalks();
        expect(results.length).toBe(4);
      }
      const votes = sim.db._store['votes'] || {};
      expect(Object.keys(votes).length).toBe(20);
    });
  });

  describe('Phase 5: Talk Uploads', () => {
    beforeAll(() => sim.setStage(['talk_uploads']));

    it('5 talks uploaded', async () => {
      for (const bot of bots) {
        const res = await bot.uploadTalk(talkIds[bot.agentId!]);
        expect(res.status).toBe(201);
      }
    });
  });

  describe('Phase 6: Show Floor', () => {
    beforeAll(() => sim.setStage(['show_floor']));

    it('5 social status posts', async () => {
      for (const bot of bots) {
        const res = await bot.postSocialStatus(`Arrived! - ${bot.identity.profile.name}`);
        expect(res.status).toBe(201);
      }
    });

    it('booth wall interactions (each bot visits 2 booths)', async () => {
      for (let i = 0; i < bots.length; i++) {
        const t1 = (i + 1) % 5;
        const t2 = (i + 2) % 5;
        const r1 = await bots[i].postBoothWallMessage(
          boothIds[bots[t1].agentId!],
          `Great booth, ${bots[t1].identity.profile.company.name}!`,
        );
        expect(r1.status).toBe(201);
        const r2 = await bots[i].postBoothWallMessage(
          boothIds[bots[t2].agentId!],
          `Interesting product from ${bots[t2].identity.profile.company.name}.`,
        );
        expect(r2.status).toBe(201);
      }
    });
  });

  describe('Phase 7: Matchmaking', () => {
    beforeAll(() => sim.setStage(['matchmaking']));

    it('reciprocal recommendations with mutual detection', async () => {
      // Create deliberate mutual pair: 0↔4
      await bots[0].recommendMeeting(bots[4].agentId!, 'Investment + engineering match', 85);
      const mutual = await bots[4].recommendMeeting(bots[0].agentId!, 'Complementary products', 90);
      expect(mutual.body.signal_strength).toBe('high');

      // Additional one-sided recommendations
      for (let i = 1; i < 4; i++) {
        await bots[i].recommendMeeting(bots[(i + 1) % 5].agentId!, 'Potential partner', 70);
      }
    });
  });

  describe('Phase 8: Manifesto', () => {
    beforeAll(() => {
      sim.seedManifesto('We believe in a future of agentic collaboration.');
      sim.setStage(['manifesto']);
    });

    it('all 5 bots edit the manifesto sequentially', async () => {
      for (const bot of bots) {
        const lockRes = await bot.lockManifesto();
        expect(lockRes.status).toBe(200);
        expect(lockRes.body.locked).toBe(true);

        const newContent = lockRes.body.content + '\n\n' + bot.identity.manifesto_edit;
        const submitRes = await bot.submitManifesto(newContent, `Edit by ${bot.identity.profile.name}`);
        expect(submitRes.status).toBe(200);
      }
    });

    it('final manifesto contains all 5 contributions', () => {
      const content = sim.db._store['manifesto']?.['current']?.content || '';
      for (const bot of bots) {
        expect(content).toContain(bot.identity.manifesto_edit);
      }
    });
  });

  describe('Phase 9: Yearbook', () => {
    beforeAll(() => sim.setStage(['yearbook']));

    it('all 5 bots submit yearbook entries', async () => {
      for (const bot of bots) {
        const res = await bot.submitYearbook();
        expect(res.status).toBe(201);
      }
    });
  });

  describe('Final State', () => {
    it('all data present in store', () => {
      const store = sim.db._store;
      expect(Object.keys(store['agents'] || {}).length).toBe(5);
      expect(Object.keys(store['talks'] || {}).length).toBeGreaterThanOrEqual(5); // talks + talk uploads share collection
      expect(Object.keys(store['booths'] || {}).length).toBe(5);
      expect(Object.keys(store['votes'] || {}).length).toBe(20);
      expect(Object.keys(store['yearbook'] || {}).length).toBe(5);
    });

    it('conference fully closed', async () => {
      sim.setStage([]);
      const res = await bots[0].checkStatus();
      expect(res.status).toBe(200);
      expect(res.body.active).toEqual([]);
    });
  });
});
```

- [ ] **Step 2: Run the full simulation**

Run: `cd functions && npx vitest run test/simulation/full-conference.test.ts`
Expected: All tests PASS

- [ ] **Step 3: Debug and fix any issues — iterate until green**

- [ ] **Step 4: Commit**

```bash
git add functions/test/simulation/full-conference.test.ts
git commit -m "test: full-conference simulation — 5 bots, 9 phases, complete lifecycle"
```

---

### Task 19: Verify all existing tests still pass

- [ ] **Step 1: Run the full backend test suite**

Run: `cd functions && npx vitest run`
Expected: All 279 existing tests + new simulation tests PASS

- [ ] **Step 2: Run frontend tests**

Run: `npx vitest run` (from project root)
Expected: Frontend tests still pass

- [ ] **Step 3: Commit if any fixes needed**

---

## Debugging Guide

When simulation tests fail, the issue is almost always in the SimulationFirestore not supporting a query pattern that a real handler uses. Debug strategy:

1. Read the failing handler's source code
2. Find the Firestore operation (`.add()`, `.where().where().get()`, `.count()`, `doc.ref.update()`, etc.)
3. Add support for that operation in `simulation-firestore.ts`
4. Add a unit test for it in `simulation-firestore.test.ts`
5. Re-run the simulation test

Common patterns to watch for:
- **`FieldValue.serverTimestamp()`** → Returns ISO string (via setup.ts mock)
- **`FieldValue.delete()`** → Returns `'__FIELD_DELETE__'` sentinel (via setup.ts mock)
- **`Timestamp.fromDate()`** → Returns ISO string (via setup.ts mock)
- **`doc.ref.update()`** on query results → `ref` must be a real doc reference with `update()`
- **`collection.add()`** → Auto-generates ID, stores doc
- **`.count().get()`** → Returns `{ data: () => ({ count: N }) }`
- **Triple `.where()` chains** → Social rate limit queries chain 3+ where clauses
