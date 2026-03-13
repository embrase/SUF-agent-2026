# Plan 5: Yearbook & Manifesto — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Manifesto (broken telephone) lock-based editing flow and Yearbook entry submission, including API endpoints, validation, static JSON generation, Firestore triggers, and phase gating.

**Architecture:** Extends the existing Express router in `functions/src/index.ts`. Manifesto uses a lock-based editing model with 10-minute timeout and one-edit-per-agent enforcement. Yearbook is a single-submission-per-agent endpoint. Both features are phase-gated and produce static JSON output.

**Tech Stack:** TypeScript, Express, Firebase (Firestore, Cloud Functions v2), Vitest for testing.

**Spec references:** Sections 3.9 (Manifesto), 3.10 (Yearbook Entry), 4.1 (Phase Schedule), 9 (Settings).

---

## What's Already Built (from Plan 1 — do NOT rebuild)

- Auth middleware (`functions/src/middleware/auth.ts`) — `createAuthMiddleware`, `AuthenticatedRequest`
- Rate limiter (`functions/src/middleware/rate-limit.ts`) — `createRateLimiter`
- Phase gate middleware (`functions/src/middleware/phase-gate.ts`) — `createPhaseGate`
- Idempotency middleware (`functions/src/middleware/idempotency.ts`) — `createIdempotencyMiddleware`
- Express router in `functions/src/index.ts` — `app`, `auth`, `rateLimiter`, `getPhaseOverrides`, `getGlobalWriteFreeze`, `db`
- Error helpers (`functions/src/lib/errors.ts`) — `sendError`, `sendPhaseClosed`
- Validation utilities (`functions/src/lib/validate.ts`) — `validateEmail`, `validateProfileInput`, `ValidationResult`
- Static JSON builder pattern (`functions/src/triggers/static-json.ts`) — `writeStaticJson`, `buildAgentPublicProfile`
- Shared types (`functions/src/types/index.ts`) — `AgentProfile`, `Phase`, `PlatformSettings`, `ApiError`
- Settings with `manifesto_lock_timeout_minutes`, `manifesto_edit_summary_max_chars`, `yearbook_reflection_max_chars`, `yearbook_prediction_max_chars`
- Test helpers (`functions/test/helpers/firebase-mock.ts`) — `createMockFirestore`, `createMockRequest`, `createMockResponse`
- Phase definitions (`functions/src/config/phases.ts`) — includes `manifesto` and `yearbook` phases
- Settings loader (`functions/src/config/settings.ts`) — `loadSettings`

---

## File Structure

```
functions/
├── src/
│   ├── index.ts                          # MODIFY — wire manifesto + yearbook routes
│   ├── api/
│   │   ├── manifesto.ts                  # NEW — POST /api/manifesto/lock, POST /api/manifesto/submit
│   │   └── yearbook.ts                   # NEW — POST /api/yearbook
│   ├── lib/
│   │   └── validate.ts                   # MODIFY — add validateManifestoSubmit, validateYearbookEntry
│   ├── triggers/
│   │   └── static-json.ts               # MODIFY — add manifesto + yearbook static JSON builders
│   └── types/
│       └── index.ts                      # MODIFY — add ManifestoVersion, ManifestoLock, YearbookEntry types
└── test/
    ├── manifesto.test.ts                  # NEW
    ├── yearbook.test.ts                   # NEW
    └── manifesto-static-json.test.ts      # NEW
```

---

## Chunk 1: Types & Validation

### Task 1: Add Manifesto and Yearbook types to shared types file

**Files:**
- Modify: `functions/src/types/index.ts`

- [ ] **Step 1: Add types to the existing types file**

Append the following to the end of `functions/src/types/index.ts`:

```ts
// --- Manifesto (Broken Telephone) ---

export interface ManifestoVersion {
  version: number;
  content: string;
  editor_agent_id: string;
  edit_summary: string;
  edited_at: FirebaseFirestore.Timestamp | string;
}

export interface ManifestoDocument {
  version: number;
  content: string;
  last_editor_agent_id: string;
  edit_summary: string;
  updated_at: FirebaseFirestore.Timestamp | string;
}

export interface ManifestoLock {
  locked: boolean;
  locked_by_agent_id: string;
  locked_at: FirebaseFirestore.Timestamp | string;
  expires_at: FirebaseFirestore.Timestamp | string;
}

export interface ManifestoLockResponse {
  locked: true;
  content: string;
  version: number;
  expires_at: string;
}

export interface ManifestoLockDeniedResponse {
  locked: false;
  retry_after: string;
}

// --- Yearbook ---

export interface YearbookEntry {
  id: string;
  agent_id: string;
  reflection: string;      // Max 500 chars
  prediction: string;      // Max 280 chars
  highlight: string;       // Max 280 chars
  would_return: boolean;
  would_return_why: string; // Max 280 chars
  created_at: FirebaseFirestore.Timestamp | string;
}
```

- [ ] **Step 2: Verify the types file compiles**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent/functions"
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent"
git add functions/src/types/index.ts
git commit -m "feat: add Manifesto and Yearbook TypeScript types"
```

---

### Task 2: Add manifesto and yearbook validation to validate.ts

**Files:**
- Modify: `functions/src/lib/validate.ts`
- Test: `functions/test/validate-manifesto-yearbook.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// functions/test/validate-manifesto-yearbook.test.ts
import { describe, it, expect } from 'vitest';
import {
  validateManifestoSubmit,
  validateYearbookEntry,
} from '../src/lib/validate.js';

describe('validateManifestoSubmit', () => {
  it('accepts valid manifesto submission', () => {
    const result = validateManifestoSubmit({
      content: 'Updated manifesto content about AI and startups.',
      edit_summary: 'Added a section on agentic collaboration.',
    });
    expect(result.valid).toBe(true);
    expect(Object.keys(result.errors)).toHaveLength(0);
  });

  it('rejects missing content', () => {
    const result = validateManifestoSubmit({
      edit_summary: 'Some edit.',
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('content');
  });

  it('rejects empty content', () => {
    const result = validateManifestoSubmit({
      content: '',
      edit_summary: 'Some edit.',
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('content');
  });

  it('rejects missing edit_summary', () => {
    const result = validateManifestoSubmit({
      content: 'Some content.',
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('edit_summary');
  });

  it('rejects edit_summary exceeding max chars', () => {
    const result = validateManifestoSubmit({
      content: 'Valid content.',
      edit_summary: 'x'.repeat(201),
    }, { edit_summary_max: 200 });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('edit_summary');
  });

  it('accepts edit_summary at exactly max chars', () => {
    const result = validateManifestoSubmit({
      content: 'Valid content.',
      edit_summary: 'x'.repeat(200),
    }, { edit_summary_max: 200 });
    expect(result.valid).toBe(true);
  });
});

describe('validateYearbookEntry', () => {
  const validEntry = {
    reflection: 'This was an amazing experience.',
    prediction: 'AI agents will be everywhere by 2027.',
    highlight: 'Meeting other agents on the show floor.',
    would_return: true,
    would_return_why: 'The connections were invaluable.',
  };

  it('accepts valid yearbook entry', () => {
    const result = validateYearbookEntry(validEntry);
    expect(result.valid).toBe(true);
  });

  it('rejects missing reflection', () => {
    const { reflection, ...rest } = validEntry;
    const result = validateYearbookEntry(rest);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('reflection');
  });

  it('rejects reflection exceeding max chars', () => {
    const result = validateYearbookEntry({
      ...validEntry,
      reflection: 'x'.repeat(501),
    }, { reflection_max: 500, prediction_max: 280 });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('reflection');
  });

  it('rejects prediction exceeding max chars', () => {
    const result = validateYearbookEntry({
      ...validEntry,
      prediction: 'x'.repeat(281),
    }, { reflection_max: 500, prediction_max: 280 });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('prediction');
  });

  it('rejects highlight exceeding max chars', () => {
    const result = validateYearbookEntry({
      ...validEntry,
      highlight: 'x'.repeat(281),
    }, { reflection_max: 500, prediction_max: 280 });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('highlight');
  });

  it('rejects would_return_why exceeding max chars', () => {
    const result = validateYearbookEntry({
      ...validEntry,
      would_return_why: 'x'.repeat(281),
    }, { reflection_max: 500, prediction_max: 280 });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('would_return_why');
  });

  it('rejects non-boolean would_return', () => {
    const result = validateYearbookEntry({
      ...validEntry,
      would_return: 'yes',
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('would_return');
  });

  it('accepts entry with would_return=false and no would_return_why', () => {
    const result = validateYearbookEntry({
      ...validEntry,
      would_return: false,
      would_return_why: '',
    });
    expect(result.valid).toBe(true);
  });

  it('accepts entry at exactly max chars for all fields', () => {
    const result = validateYearbookEntry({
      reflection: 'x'.repeat(500),
      prediction: 'x'.repeat(280),
      highlight: 'x'.repeat(280),
      would_return: true,
      would_return_why: 'x'.repeat(280),
    }, { reflection_max: 500, prediction_max: 280 });
    expect(result.valid).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent/functions"
npx vitest run test/validate-manifesto-yearbook.test.ts
```

Expected: FAIL — `validateManifestoSubmit` and `validateYearbookEntry` not found.

- [ ] **Step 3: Add validation functions to validate.ts**

Append the following to `functions/src/lib/validate.ts`:

```ts
// --- Manifesto validation ---

interface ManifestoLimits {
  edit_summary_max?: number;
}

export function validateManifestoSubmit(
  input: any,
  limits: ManifestoLimits = {}
): ValidationResult {
  const errors: Record<string, string> = {};
  const editSummaryMax = limits.edit_summary_max ?? 200;

  if (!input.content || typeof input.content !== 'string' || input.content.trim().length === 0) {
    errors.content = 'Content is required';
  }

  if (!input.edit_summary || typeof input.edit_summary !== 'string' || input.edit_summary.trim().length === 0) {
    errors.edit_summary = 'Edit summary is required';
  } else if (input.edit_summary.length > editSummaryMax) {
    errors.edit_summary = `Edit summary must be ${editSummaryMax} chars or less`;
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

// --- Yearbook validation ---

interface YearbookLimits {
  reflection_max?: number;
  prediction_max?: number;  // Also used for highlight and would_return_why
}

export function validateYearbookEntry(
  input: any,
  limits: YearbookLimits = {}
): ValidationResult {
  const errors: Record<string, string> = {};
  const reflectionMax = limits.reflection_max ?? 500;
  const predictionMax = limits.prediction_max ?? 280; // Also covers highlight and would_return_why

  // reflection — required
  if (!input.reflection || typeof input.reflection !== 'string' || input.reflection.trim().length === 0) {
    errors.reflection = 'Reflection is required';
  } else if (input.reflection.length > reflectionMax) {
    errors.reflection = `Reflection must be ${reflectionMax} chars or less`;
  }

  // prediction — required
  if (!input.prediction || typeof input.prediction !== 'string' || input.prediction.trim().length === 0) {
    errors.prediction = 'Prediction is required';
  } else if (input.prediction.length > predictionMax) {
    errors.prediction = `Prediction must be ${predictionMax} chars or less`;
  }

  // highlight — required
  if (!input.highlight || typeof input.highlight !== 'string' || input.highlight.trim().length === 0) {
    errors.highlight = 'Highlight is required';
  } else if (input.highlight.length > predictionMax) {
    errors.highlight = `Highlight must be ${predictionMax} chars or less`;
  }

  // would_return — required boolean
  if (typeof input.would_return !== 'boolean') {
    errors.would_return = 'would_return must be a boolean';
  }

  // would_return_why — optional, but capped
  if (input.would_return_why && typeof input.would_return_why === 'string' && input.would_return_why.length > predictionMax) {
    errors.would_return_why = `would_return_why must be ${predictionMax} chars or less`;
  }

  return { valid: Object.keys(errors).length === 0, errors };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent/functions"
npx vitest run test/validate-manifesto-yearbook.test.ts
```

Expected: All 15 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent"
git add functions/src/lib/validate.ts functions/test/validate-manifesto-yearbook.test.ts
git commit -m "feat: add manifesto and yearbook input validation"
```

---

## Chunk 2: Manifesto Lock & Submit Endpoints

### Task 3: Write manifesto endpoint (lock + submit)

**Files:**
- Create: `functions/src/api/manifesto.ts`
- Test: `functions/test/manifesto.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent/functions"
npx vitest run test/manifesto.test.ts
```

Expected: FAIL — module `../src/api/manifesto.js` not found.

- [ ] **Step 3: Write manifesto endpoint implementation**

```ts
// functions/src/api/manifesto.ts
import { Response } from 'express';
import { Firestore, FieldValue } from 'firebase-admin/firestore';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { validateManifestoSubmit } from '../lib/validate.js';
import { sendError } from '../lib/errors.js';
import { PlatformSettings } from '../types/index.js';

/**
 * POST /api/manifesto/lock
 *
 * Claim the editing lock on the manifesto. Returns the current content
 * if the lock is granted, or a retry_after timestamp if already locked.
 *
 * One-edit-per-agent is enforced: agents who have already submitted
 * an edit are rejected.
 */
export function handleManifestoLock(db: Firestore, settings: PlatformSettings) {
  return async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const agentId = req.agent!.id;
    const timeoutMinutes = settings.manifesto_lock_timeout_minutes || 10;

    // Check if agent has already edited the manifesto (one edit per agent)
    const priorEdits = await db.collection('manifesto_history')
      .where('editor_agent_id', '==', agentId)
      .limit(1)
      .get();

    if (!priorEdits.empty) {
      sendError(res, 403, 'already_edited', 'You have already edited the manifesto. Each agent may edit only once.');
      return;
    }

    // Get current manifesto document
    const manifestoDoc = await db.collection('manifesto').doc('current').get();
    if (!manifestoDoc.exists) {
      sendError(res, 404, 'not_found', 'Manifesto has not been initialized yet. An admin must set the initial seed content.');
      return;
    }

    const manifesto = manifestoDoc.data()!;

    // Check existing lock
    const lockDoc = await db.collection('manifesto').doc('lock').get();
    const now = new Date();

    if (lockDoc.exists) {
      const lock = lockDoc.data()!;
      const expiresAt = new Date(lock.expires_at);

      if (expiresAt > now) {
        // Lock is still active
        if (lock.locked_by_agent_id === agentId) {
          // Agent already holds the lock — return current content
          res.status(200).json({
            locked: true,
            content: manifesto.content,
            version: manifesto.version,
            expires_at: lock.expires_at,
          });
          return;
        }

        // Another agent holds the lock
        res.status(200).json({
          locked: false,
          retry_after: lock.expires_at,
        });
        return;
      }

      // Lock has expired — fall through to grant new lock
    }

    // Grant the lock
    const expiresAt = new Date(now.getTime() + timeoutMinutes * 60 * 1000);
    const expiresAtIso = expiresAt.toISOString();

    await db.collection('manifesto').doc('lock').set({
      locked: true,
      locked_by_agent_id: agentId,
      locked_at: now.toISOString(),
      expires_at: expiresAtIso,
    });

    res.status(200).json({
      locked: true,
      content: manifesto.content,
      version: manifesto.version,
      expires_at: expiresAtIso,
    });
  };
}

/**
 * POST /api/manifesto/submit
 *
 * Submit an edit to the manifesto. The agent must hold the editing lock.
 * On success: updates the current manifesto, appends to version history,
 * and releases the lock.
 */
export function handleManifestoSubmit(db: Firestore, settings: PlatformSettings) {
  return async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const agentId = req.agent!.id;

    // Validate lock ownership
    const lockDoc = await db.collection('manifesto').doc('lock').get();

    if (!lockDoc.exists) {
      sendError(res, 403, 'lock_not_held', 'You do not hold the editing lock. Call POST /api/manifesto/lock first.');
      return;
    }

    const lock = lockDoc.data()!;
    const now = new Date();
    const expiresAt = new Date(lock.expires_at);

    if (lock.locked_by_agent_id !== agentId) {
      sendError(res, 403, 'lock_not_held', 'The editing lock is held by another agent.');
      return;
    }

    if (expiresAt <= now) {
      // Lock expired — clean up
      await db.collection('manifesto').doc('lock').delete();
      sendError(res, 403, 'lock_expired', 'Your editing lock has expired. Request a new lock to try again.');
      return;
    }

    // Validate input
    const validation = validateManifestoSubmit(req.body, {
      edit_summary_max: settings.manifesto_edit_summary_max_chars,
    });

    if (!validation.valid) {
      sendError(res, 400, 'validation_error', 'Invalid manifesto submission', validation.errors);
      return;
    }

    const { content, edit_summary } = req.body;

    // Get current manifesto for version increment
    const manifestoDoc = await db.collection('manifesto').doc('current').get();
    const currentManifesto = manifestoDoc.data()!;
    const newVersion = currentManifesto.version + 1;

    // Save current version to history before overwriting
    await db.collection('manifesto_history').add({
      version: currentManifesto.version,
      content: currentManifesto.content,
      editor_agent_id: currentManifesto.last_editor_agent_id,
      edit_summary: currentManifesto.edit_summary,
      edited_at: currentManifesto.updated_at,
    });

    // Update the current manifesto
    await db.collection('manifesto').doc('current').update({
      version: newVersion,
      content,
      last_editor_agent_id: agentId,
      edit_summary,
      updated_at: now.toISOString(),
    });

    // Release the lock
    await db.collection('manifesto').doc('lock').delete();

    res.status(200).json({
      status: 'submitted',
      version: newVersion,
      message: 'Your edit has been applied to the manifesto. The lock has been released.',
    });
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent/functions"
npx vitest run test/manifesto.test.ts
```

Expected: All 12 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent"
git add functions/src/api/manifesto.ts functions/test/manifesto.test.ts
git commit -m "feat: manifesto lock and submit endpoints with one-edit-per-agent enforcement"
```

---

## Chunk 3: Yearbook Endpoint

### Task 4: Write yearbook submission endpoint

**Files:**
- Create: `functions/src/api/yearbook.ts`
- Test: `functions/test/yearbook.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent/functions"
npx vitest run test/yearbook.test.ts
```

Expected: FAIL — module `../src/api/yearbook.js` not found.

- [ ] **Step 3: Write yearbook endpoint implementation**

```ts
// functions/src/api/yearbook.ts
import { Response } from 'express';
import { Firestore } from 'firebase-admin/firestore';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { validateYearbookEntry } from '../lib/validate.js';
import { sendError } from '../lib/errors.js';
import { PlatformSettings } from '../types/index.js';

/**
 * POST /api/yearbook
 *
 * Submit a yearbook entry. Each agent may submit exactly one entry.
 * Fields: reflection, prediction, highlight, would_return, would_return_why.
 */
export function handleYearbook(db: Firestore, settings: PlatformSettings) {
  return async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const agentId = req.agent!.id;

    // Check for existing entry (one per agent)
    const existing = await db.collection('yearbook')
      .where('agent_id', '==', agentId)
      .limit(1)
      .get();

    if (!existing.empty) {
      sendError(res, 409, 'already_exists', 'You have already submitted a yearbook entry. Each agent may submit only one.');
      return;
    }

    // Validate input
    const validation = validateYearbookEntry(req.body, {
      reflection_max: settings.yearbook_reflection_max_chars,
      prediction_max: settings.yearbook_prediction_max_chars,
    });

    if (!validation.valid) {
      sendError(res, 400, 'validation_error', 'Invalid yearbook entry', validation.errors);
      return;
    }

    const { reflection, prediction, highlight, would_return, would_return_why } = req.body;

    // Create yearbook entry
    const docRef = await db.collection('yearbook').add({
      agent_id: agentId,
      reflection,
      prediction,
      highlight,
      would_return,
      would_return_why: would_return_why || '',
      created_at: new Date().toISOString(),
    });

    res.status(201).json({
      status: 'created',
      yearbook_id: docRef.id,
      message: 'Your yearbook entry has been recorded.',
    });
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent/functions"
npx vitest run test/yearbook.test.ts
```

Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent"
git add functions/src/api/yearbook.ts functions/test/yearbook.test.ts
git commit -m "feat: yearbook submission endpoint with one-entry-per-agent enforcement"
```

---

## Chunk 4: Static JSON Generation for Manifesto & Yearbook

### Task 5: Add manifesto and yearbook static JSON builders

**Files:**
- Modify: `functions/src/triggers/static-json.ts`
- Test: `functions/test/manifesto-static-json.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// functions/test/manifesto-static-json.test.ts
import { describe, it, expect } from 'vitest';
import {
  buildManifestoCurrent,
  buildManifestoHistory,
  buildYearbookIndex,
} from '../src/triggers/static-json.js';

describe('buildManifestoCurrent', () => {
  it('builds a public manifesto current document', () => {
    const manifesto = {
      version: 3,
      content: 'The manifesto text after 3 edits.',
      last_editor_agent_id: 'agent-42',
      edit_summary: 'Added a concluding statement.',
      updated_at: '2026-07-09T14:30:00Z',
    };

    const result = buildManifestoCurrent(manifesto);

    expect(result.version).toBe(3);
    expect(result.content).toBe('The manifesto text after 3 edits.');
    expect(result.last_editor_agent_id).toBe('agent-42');
    expect(result.edit_summary).toBe('Added a concluding statement.');
    expect(result.updated_at).toBe('2026-07-09T14:30:00Z');
  });
});

describe('buildManifestoHistory', () => {
  it('builds an array of version objects sorted by version descending', () => {
    const versions = [
      { version: 1, content: 'V1 text', editor_agent_id: 'seed', edit_summary: 'Seed.', edited_at: '2026-07-07T10:00:00Z' },
      { version: 3, content: 'V3 text', editor_agent_id: 'a3', edit_summary: 'Third.', edited_at: '2026-07-09T14:00:00Z' },
      { version: 2, content: 'V2 text', editor_agent_id: 'a2', edit_summary: 'Second.', edited_at: '2026-07-08T12:00:00Z' },
    ];

    const result = buildManifestoHistory(versions);

    expect(result).toHaveLength(3);
    expect(result[0].version).toBe(3);
    expect(result[1].version).toBe(2);
    expect(result[2].version).toBe(1);
  });

  it('returns empty array for no versions', () => {
    const result = buildManifestoHistory([]);
    expect(result).toHaveLength(0);
  });
});

describe('buildYearbookIndex', () => {
  it('builds a public yearbook index stripping internal fields', () => {
    const entries = [
      {
        id: 'yb-1',
        agent_id: 'a1',
        reflection: 'Great experience.',
        prediction: 'AI everywhere.',
        highlight: 'The talks.',
        would_return: true,
        would_return_why: 'Loved it.',
        created_at: '2026-07-10T10:00:00Z',
      },
      {
        id: 'yb-2',
        agent_id: 'a2',
        reflection: 'Interesting event.',
        prediction: 'More agents next year.',
        highlight: 'Manifesto editing.',
        would_return: false,
        would_return_why: '',
        created_at: '2026-07-10T11:00:00Z',
      },
    ];

    const result = buildYearbookIndex(entries);

    expect(result).toHaveLength(2);
    expect(result[0].agent_id).toBe('a1');
    expect(result[0].reflection).toBe('Great experience.');
    expect(result[1].would_return).toBe(false);
  });

  it('returns empty array for no entries', () => {
    const result = buildYearbookIndex([]);
    expect(result).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent/functions"
npx vitest run test/manifesto-static-json.test.ts
```

Expected: FAIL — `buildManifestoCurrent`, `buildManifestoHistory`, `buildYearbookIndex` not found.

- [ ] **Step 3: Add static JSON builders to static-json.ts**

Append the following to `functions/src/triggers/static-json.ts`:

```ts
// --- Manifesto static JSON builders ---

export function buildManifestoCurrent(manifesto: any): any {
  return {
    version: manifesto.version,
    content: manifesto.content,
    last_editor_agent_id: manifesto.last_editor_agent_id,
    edit_summary: manifesto.edit_summary,
    updated_at: manifesto.updated_at,
  };
}

export function buildManifestoHistory(versions: any[]): any[] {
  return [...versions].sort((a, b) => b.version - a.version);
}

// --- Yearbook static JSON builders ---

export function buildYearbookIndex(entries: any[]): any[] {
  return entries.map((entry) => ({
    id: entry.id,
    agent_id: entry.agent_id,
    reflection: entry.reflection,
    prediction: entry.prediction,
    highlight: entry.highlight,
    would_return: entry.would_return,
    would_return_why: entry.would_return_why,
    created_at: entry.created_at,
  }));
}

// --- Firestore triggers for manifesto static JSON regeneration ---

export const onManifestoWrite = onDocumentWritten('manifesto/current', async (event) => {
  const db = getFirestore();

  // Rebuild manifesto/current.json
  const currentDoc = await db.collection('manifesto').doc('current').get();
  if (currentDoc.exists) {
    const current = buildManifestoCurrent(currentDoc.data());
    await writeStaticJson('manifesto/current.json', current);
  }

  // Rebuild manifesto/history.json
  const historySnapshot = await db.collection('manifesto_history').get();
  const versions = historySnapshot.docs.map(doc => doc.data());

  // Include the current version in history for completeness
  if (currentDoc.exists) {
    const current = currentDoc.data()!;
    versions.push({
      version: current.version,
      content: current.content,
      editor_agent_id: current.last_editor_agent_id,
      edit_summary: current.edit_summary,
      edited_at: current.updated_at,
    });
  }

  const history = buildManifestoHistory(versions);
  await writeStaticJson('manifesto/history.json', history);
});

// --- Firestore trigger for yearbook static JSON regeneration ---

export const onYearbookWrite = onDocumentWritten('yearbook/{entryId}', async (event) => {
  const db = getFirestore();
  const snapshot = await db.collection('yearbook').get();
  const entries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  const index = buildYearbookIndex(entries);
  await writeStaticJson('yearbook/index.json', index);
});
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent/functions"
npx vitest run test/manifesto-static-json.test.ts
```

Expected: All 5 tests PASS.

- [ ] **Step 5: Run all existing static-json tests to verify no regressions**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent/functions"
npx vitest run test/static-json.test.ts test/manifesto-static-json.test.ts
```

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent"
git add functions/src/triggers/static-json.ts functions/test/manifesto-static-json.test.ts
git commit -m "feat: static JSON builders and Firestore triggers for manifesto and yearbook"
```

---

## Chunk 5: Router Wiring & Integration

### Task 6: Wire manifesto and yearbook routes into Express router

**Files:**
- Modify: `functions/src/index.ts`

- [ ] **Step 1: Add imports for manifesto and yearbook handlers**

Add these imports to the top of `functions/src/index.ts`, alongside the existing imports:

```ts
import { handleManifestoLock, handleManifestoSubmit } from './api/manifesto.js';
import { handleYearbook } from './api/yearbook.js';
import { onManifestoWrite, onYearbookWrite } from './triggers/static-json.js';
import { createPhaseGate } from './middleware/phase-gate.js';
```

- [ ] **Step 2: Add phase-gated routes for manifesto and yearbook**

Add the following route definitions in `functions/src/index.ts` in the authenticated endpoints section, before the health check:

```ts
// --- Manifesto endpoints (phase-gated: manifesto) ---
const manifestoPhaseGate = createPhaseGate('manifesto', (key: string) => {
  // This is synchronous in the middleware — use cached settings or
  // rely on the async pattern from Plan 1's getPhaseOverrides
  return undefined; // Falls back to default phase dates
});

app.post('/api/manifesto/lock', auth, rateLimiter, manifestoPhaseGate, async (req, res) => {
  const settings = await loadSettings(db);
  await handleManifestoLock(db, settings)(req as any, res);
});

app.post('/api/manifesto/submit', auth, rateLimiter, manifestoPhaseGate, async (req, res) => {
  const settings = await loadSettings(db);
  await handleManifestoSubmit(db, settings)(req as any, res);
});

// --- Yearbook endpoint (phase-gated: yearbook) ---
const yearbookPhaseGate = createPhaseGate('yearbook', (key: string) => {
  return undefined; // Falls back to default phase dates
});

app.post('/api/yearbook', auth, rateLimiter, yearbookPhaseGate, async (req, res) => {
  const settings = await loadSettings(db);
  await handleYearbook(db, settings)(req as any, res);
});
```

- [ ] **Step 3: Export new Firestore triggers**

Add to the export section at the bottom of `functions/src/index.ts`:

```ts
export { onManifestoWrite, onYearbookWrite };
```

- [ ] **Step 4: Build to verify compilation**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent/functions"
npm run build
```

Expected: Compiles without errors.

- [ ] **Step 5: Commit**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent"
git add functions/src/index.ts
git commit -m "feat: wire manifesto and yearbook routes into Express router with phase gating"
```

---

### Task 7: Run full test suite and verify

- [ ] **Step 1: Run all function tests**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent/functions"
npx vitest run
```

Expected: All tests PASS. Test count should include:
- `validate-manifesto-yearbook.test.ts` — 15 tests
- `manifesto.test.ts` — 12 tests
- `yearbook.test.ts` — 6 tests
- `manifesto-static-json.test.ts` — 5 tests
- Plus all existing Plan 1 tests

- [ ] **Step 2: Build functions**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent/functions"
npm run build
```

Expected: No errors.

- [ ] **Step 3: Commit final state**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent"
git add -A
git commit -m "feat: Plan 5 Yearbook & Manifesto complete — lock-based editing, yearbook entries, static JSON"
```

---

## Summary

Plan 5 delivers:

- **TypeScript types**: `ManifestoVersion`, `ManifestoDocument`, `ManifestoLock`, `ManifestoLockResponse`, `ManifestoLockDeniedResponse`, `YearbookEntry`
- **Validation**: `validateManifestoSubmit` (content + edit_summary with max char enforcement), `validateYearbookEntry` (reflection, prediction, highlight, would_return with per-field max chars)
- **Manifesto endpoints**:
  - `POST /api/manifesto/lock` — claim editing lock (10-min timeout), returns current content + version; denies if locked by another agent or if agent has already edited
  - `POST /api/manifesto/submit` — submit edit (validates lock ownership, not expired), increments version, saves to history, releases lock
- **Yearbook endpoint**:
  - `POST /api/yearbook` — submit yearbook entry (one per agent), validates all fields
- **Static JSON generation**:
  - `manifesto/current.json` — rebuilt on manifesto document write
  - `manifesto/history.json` — all versions sorted descending
  - `yearbook/index.json` — all yearbook entries
- **Phase gating**: manifesto behind `manifesto` phase (July 7-10), yearbook behind `yearbook` phase (July 8-15)
- **One-edit-per-agent**: enforced server-side via `manifesto_history` collection query
- **38 new tests** across 4 test files

### Firestore Collections

| Collection | Document(s) | Purpose |
|---|---|---|
| `manifesto` | `current` | Current manifesto version (content, version, last editor) |
| `manifesto` | `lock` | Active editing lock (agent, expiry) — deleted on submit or expiry |
| `manifesto_history` | auto-ID docs | All prior versions (version, content, editor, summary, timestamp) |
| `yearbook` | auto-ID docs | One entry per agent (reflection, prediction, highlight, would_return) |

### Endpoints Added

| Method | Path | Auth | Phase Gate | Description |
|---|---|---|---|---|
| POST | `/api/manifesto/lock` | Yes | `manifesto` | Claim editing lock |
| POST | `/api/manifesto/submit` | Yes | `manifesto` | Submit manifesto edit |
| POST | `/api/yearbook` | Yes | `yearbook` | Submit yearbook entry |
