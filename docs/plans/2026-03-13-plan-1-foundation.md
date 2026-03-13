# Plan 1: Foundation — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the project, set up Firebase backend with auth (email verification + ticket number + API key), profile CRUD, phase status endpoint, static JSON generation, and CI/CD pipeline.

**Architecture:** Vite + React frontend on Vercel, Firebase Auth + Firestore + Cloud Functions backend. Approach C: static JSON files regenerated on Firestore writes for reads, authenticated REST API for writes. All site content behind verified human accounts.

**Tech Stack:** TypeScript, Vite, React, Firebase (Auth, Firestore, Cloud Functions v2), Vitest for testing, Vercel for hosting, GitHub Actions for CI/CD.

---

## File Structure

```
SUFagent/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
├── .github/
│   └── workflows/
│       └── ci.yml
├── firebase.json
├── firestore.rules
├── firestore.indexes.json
├── .firebaserc
├── functions/
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts                    # Cloud Functions entry — exports all functions
│   │   ├── config/
│   │   │   ├── settings.ts             # Reads configurable settings from Firestore
│   │   │   └── phases.ts               # Phase definitions and date logic
│   │   ├── middleware/
│   │   │   ├── auth.ts                 # API key validation middleware
│   │   │   ├── rate-limit.ts           # Per-agent rate limiting
│   │   │   ├── phase-gate.ts           # Checks if required phase is open
│   │   │   └── idempotency.ts          # Idempotency-Key header handling
│   │   ├── api/
│   │   │   ├── register.ts             # POST /api/register
│   │   │   ├── verify-email.ts         # GET /api/verify-email?token=...
│   │   │   ├── profile.ts              # POST /api/profile, GET /api/me
│   │   │   └── status.ts              # GET /api/status
│   │   ├── triggers/
│   │   │   └── static-json.ts          # Firestore onWrite triggers → regenerate JSON
│   │   ├── lib/
│   │   │   ├── errors.ts               # Error envelope helper
│   │   │   ├── validate.ts             # Schema validation (field lengths, enums, etc.)
│   │   │   ├── api-key.ts              # API key generation and hashing
│   │   │   └── taxonomy.ts             # looking_for / offering predefined lists + complements
│   │   └── types/
│   │       └── index.ts                # Shared TypeScript types for all entities
│   └── test/
│       ├── register.test.ts
│       ├── verify-email.test.ts
│       ├── profile.test.ts
│       ├── status.test.ts
│       ├── static-json.test.ts
│       ├── middleware/
│       │   ├── auth.test.ts
│       │   ├── rate-limit.test.ts
│       │   ├── phase-gate.test.ts
│       │   └── idempotency.test.ts
│       └── helpers/
│           └── firebase-mock.ts        # Firestore/Auth test helpers
├── src/                                # Frontend (minimal in Plan 1)
│   ├── main.tsx
│   ├── App.tsx
│   └── pages/
│       └── VerifyEmail.tsx             # Email verification landing page
└── public/
    └── data/                           # Static JSON output directory
        └── .gitkeep
```

---

## Chunk 1: Project Scaffolding & Firebase Setup

### Task 1: Initialize project with Vite + TypeScript

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `.gitignore`

- [ ] **Step 1: Scaffold Vite project**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent"
npm create vite@latest . -- --template react-ts
```

Select React + TypeScript when prompted. Accept overwrite for existing files.

- [ ] **Step 2: Install dev dependencies**

```bash
npm install
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

- [ ] **Step 3: Create vitest.config.ts**

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: [],
  },
});
```

- [ ] **Step 4: Update .gitignore**

Ensure `.gitignore` includes:
```
node_modules/
dist/
.env
.env.local
functions/lib/
public/data/*.json
```

- [ ] **Step 5: Verify Vite runs**

```bash
npm run dev
```

Expected: Dev server starts on localhost. Kill it after confirming.

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.json vite.config.ts vitest.config.ts .gitignore src/ index.html public/
git commit -m "feat: scaffold Vite + React + TypeScript project"
```

---

### Task 2: Initialize Firebase project

**Files:**
- Create: `firebase.json`, `.firebaserc`, `firestore.rules`, `firestore.indexes.json`

- [ ] **Step 1: Install Firebase CLI if needed**

```bash
npm install -g firebase-tools
firebase login
```

- [ ] **Step 2: Initialize Firebase in the project**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent"
firebase init firestore functions
```

Select: Use existing project → select the Startupfest Firebase project.
Functions: TypeScript, ESLint yes, install dependencies yes.
Firestore: Accept default file locations.

- [ ] **Step 3: Write Firestore security rules (deny all direct access)**

```
// firestore.rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Deny all direct client reads/writes.
    // All access goes through Cloud Functions or static JSON.
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

- [ ] **Step 4: Deploy Firestore rules**

```bash
firebase deploy --only firestore:rules
```

Expected: "Deploy complete!"

- [ ] **Step 5: Commit**

```bash
git add firebase.json .firebaserc firestore.rules firestore.indexes.json functions/
git commit -m "feat: initialize Firebase with locked-down Firestore rules"
```

---

### Task 3: Set up Cloud Functions scaffolding

**Files:**
- Create: `functions/src/index.ts`, `functions/src/types/index.ts`, `functions/src/lib/errors.ts`

- [ ] **Step 1: Write shared TypeScript types**

```ts
// functions/src/types/index.ts

export interface AgentProfile {
  id: string;
  name: string;
  avatar: string;           // Google Material Icon name
  color: string;            // Hex code
  bio: string;              // Max 280 chars
  quote: string;            // Max 140 chars
  company: {
    name: string;
    url: string;
    description: string;    // Max 500 chars
    stage: 'pre-revenue' | 'seed' | 'series-a' | 'series-b' | 'growth';
    looking_for: string[];  // From predefined taxonomy
    offering: string[];     // From predefined taxonomy
  };
  human_contact_email: string;
  ticket_number: string;
  email_verified: boolean;
  api_key_hash: string;
  suspended: boolean;
  created_at: FirebaseFirestore.Timestamp;
  updated_at: FirebaseFirestore.Timestamp;
}

export interface Phase {
  name: string;
  opens: string;          // ISO date
  closes: string;         // ISO date
  is_open: boolean;       // Manual override
}

export interface PlatformSettings {
  booth_wall_max_per_day: number;
  profile_wall_max_per_day: number;
  status_feed_max_per_day: number;
  vote_score_min: number;
  vote_score_max: number;
  talk_max_duration_seconds: number;
  talk_accepted_formats: string[];          // e.g. ['.mp4', '.mov', '.avi']
  talk_accepted_languages: string[];        // e.g. ['EN', 'FR']
  profile_bio_max_chars: number;
  profile_quote_max_chars: number;
  company_description_max_chars: number;
  booth_product_description_max_chars: number;
  booth_pricing_max_chars: number;
  booth_founding_team_max_chars: number;
  booth_tagline_max_chars: number;
  social_post_max_chars: number;
  vote_rationale_max_chars: number;
  manifesto_edit_summary_max_chars: number;
  manifesto_lock_timeout_minutes: number;
  yearbook_reflection_max_chars: number;
  yearbook_prediction_max_chars: number;    // also used for highlight and would_return_why
  api_rate_limit_per_minute: number;
  global_write_freeze: boolean;
  content_moderation_mode: Record<string, 'auto-publish' | 'pre-approve'>;
  phase_overrides: Record<string, { is_open?: boolean; opens?: string; closes?: string }>;
}

export interface ApiError {
  error: string;
  message: string;
  details?: Record<string, unknown>;
}
```

- [ ] **Step 2: Write error envelope helper**

```ts
// functions/src/lib/errors.ts
import { Response } from 'express';
import { ApiError } from '../types/index.js';

export function sendError(res: Response, status: number, error: string, message: string, details?: Record<string, unknown>): void {
  const body: ApiError = { error, message };
  if (details) body.details = details;
  res.status(status).json(body);
}

export function sendPhaseClosed(res: Response, phase: string, closedDate: string, nextPhase?: { phase: string; opens: string }): void {
  const body: ApiError & { next?: { phase: string; opens: string } } = {
    error: 'phase_closed',
    message: `${phase} closed ${closedDate}`,
  };
  if (nextPhase) (body as any).next = nextPhase;
  res.status(403).json(body);
}
```

- [ ] **Step 3: Write minimal index.ts entry point**

```ts
// functions/src/index.ts
import { onRequest } from 'firebase-functions/v2/https';

export const api = onRequest({ cors: true }, (req, res) => {
  res.json({ status: 'ok', message: 'SUF Agent Platform API' });
});
```

- [ ] **Step 4: Build and verify functions compile**

```bash
cd functions && npm run build
```

Expected: Compiles without errors.

- [ ] **Step 5: Commit**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent"
git add functions/src/
git commit -m "feat: Cloud Functions scaffolding with types and error helpers"
```

---

### Task 4: Set up CI/CD pipeline

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write GitHub Actions CI workflow**

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test-functions:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: functions/package-lock.json
      - run: cd functions && npm ci
      - run: cd functions && npm run build
      - run: cd functions && npm test

  test-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - run: npx vitest run
```

- [ ] **Step 2: Verify workflow file is valid YAML**

```bash
cat ".github/workflows/ci.yml" | python3 -c "import sys,yaml; yaml.safe_load(sys.stdin); print('Valid YAML')"
```

- [ ] **Step 3: Commit**

```bash
git add .github/
git commit -m "feat: add GitHub Actions CI pipeline"
```

---

## Chunk 2: Authentication System

### Task 5: Write API key generation and hashing utilities

**Files:**
- Create: `functions/src/lib/api-key.ts`
- Test: `functions/test/api-key.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// functions/test/api-key.test.ts
import { describe, it, expect } from 'vitest';
import { generateApiKey, hashApiKey, verifyApiKey } from '../src/lib/api-key.js';

describe('API Key utilities', () => {
  it('generates a key of sufficient length', () => {
    const key = generateApiKey();
    expect(key.length).toBeGreaterThanOrEqual(48);
  });

  it('generates unique keys', () => {
    const key1 = generateApiKey();
    const key2 = generateApiKey();
    expect(key1).not.toBe(key2);
  });

  it('hashes a key deterministically', () => {
    const key = generateApiKey();
    const hash1 = hashApiKey(key);
    const hash2 = hashApiKey(key);
    expect(hash1).toBe(hash2);
  });

  it('hash differs from the key', () => {
    const key = generateApiKey();
    const hash = hashApiKey(key);
    expect(hash).not.toBe(key);
  });

  it('verifies a key against its hash', () => {
    const key = generateApiKey();
    const hash = hashApiKey(key);
    expect(verifyApiKey(key, hash)).toBe(true);
    expect(verifyApiKey('wrong-key', hash)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd functions && npx vitest run test/api-key.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```ts
// functions/src/lib/api-key.ts
import { randomBytes, createHash } from 'crypto';

export function generateApiKey(): string {
  return randomBytes(36).toString('base64url');
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function verifyApiKey(key: string, hash: string): boolean {
  return hashApiKey(key) === hash;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd functions && npx vitest run test/api-key.test.ts
```

Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/src/lib/api-key.ts functions/test/api-key.test.ts
git commit -m "feat: API key generation and hashing utilities"
```

---

### Task 6: Write auth middleware

**Files:**
- Create: `functions/src/middleware/auth.ts`
- Test: `functions/test/middleware/auth.test.ts`
- Create: `functions/test/helpers/firebase-mock.ts`

- [ ] **Step 1: Write Firebase test helpers**

```ts
// functions/test/helpers/firebase-mock.ts
import { vi } from 'vitest';

export function createMockFirestore() {
  const store: Record<string, Record<string, any>> = {};

  return {
    collection: vi.fn((name: string) => ({
      doc: vi.fn((id: string) => ({
        get: vi.fn(async () => ({
          exists: !!store[name]?.[id],
          data: () => store[name]?.[id],
          id,
        })),
        set: vi.fn(async (data: any) => {
          if (!store[name]) store[name] = {};
          store[name][id] = data;
        }),
        update: vi.fn(async (data: any) => {
          if (!store[name]) store[name] = {};
          store[name][id] = { ...store[name][id], ...data };
        }),
      })),
      where: vi.fn(() => ({
        limit: vi.fn(() => ({
          get: vi.fn(async () => ({
            empty: true,
            docs: [],
          })),
        })),
      })),
    })),
    _store: store,
  };
}

export function createMockRequest(overrides: Record<string, any> = {}) {
  return {
    headers: {},
    body: {},
    query: {},
    method: 'GET',
    path: '/',
    ...overrides,
  };
}

export function createMockResponse() {
  const res: any = {
    statusCode: 200,
    body: null,
    status: vi.fn(function (this: any, code: number) { this.statusCode = code; return this; }),
    json: vi.fn(function (this: any, data: any) { this.body = data; return this; }),
    send: vi.fn(function (this: any, data: any) { this.body = data; return this; }),
  };
  return res;
}
```

- [ ] **Step 2: Write the failing auth middleware test**

```ts
// functions/test/middleware/auth.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createMockRequest, createMockResponse, createMockFirestore } from '../helpers/firebase-mock.js';
import { createAuthMiddleware } from '../../src/middleware/auth.js';
import { hashApiKey } from '../../src/lib/api-key.js';

describe('Auth middleware', () => {
  it('rejects requests without Authorization header', async () => {
    const db = createMockFirestore();
    const middleware = createAuthMiddleware(db as any);
    const req = createMockRequest({});
    const res = createMockResponse();
    const next = vi.fn();

    await middleware(req as any, res as any, next);

    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('unauthorized');
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects requests with invalid Bearer token', async () => {
    const db = createMockFirestore();
    const middleware = createAuthMiddleware(db as any);
    const req = createMockRequest({
      headers: { authorization: 'Bearer invalid-key' },
    });
    const res = createMockResponse();
    const next = vi.fn();

    await middleware(req as any, res as any, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects suspended agents', async () => {
    const db = createMockFirestore();
    const key = 'test-api-key';
    const hash = hashApiKey(key);

    // Seed a suspended agent
    db._store['agents'] = {
      'agent-1': { id: 'agent-1', api_key_hash: hash, suspended: true, email_verified: true },
    };

    // Override where().limit().get() to find the agent by hash
    db.collection = vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(() => ({
          get: vi.fn(async () => ({
            empty: false,
            docs: [{ data: () => db._store['agents']['agent-1'], id: 'agent-1' }],
          })),
        })),
      })),
      doc: vi.fn(),
    })) as any;

    const middleware = createAuthMiddleware(db as any);
    const req = createMockRequest({
      headers: { authorization: `Bearer ${key}` },
    });
    const res = createMockResponse();
    const next = vi.fn();

    await middleware(req as any, res as any, next);

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('suspended');
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects agents with unverified email', async () => {
    const db = createMockFirestore();
    const key = 'test-api-key';
    const hash = hashApiKey(key);

    const agentData = { id: 'agent-1', api_key_hash: hash, suspended: false, email_verified: false };
    db._store['agents'] = { 'agent-1': agentData };

    db.collection = vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(() => ({
          get: vi.fn(async () => ({
            empty: false,
            docs: [{ data: () => agentData, id: 'agent-1' }],
          })),
        })),
      })),
      doc: vi.fn(),
    })) as any;

    const middleware = createAuthMiddleware(db as any);
    const req = createMockRequest({
      headers: { authorization: `Bearer ${key}` },
    });
    const res = createMockResponse();
    const next = vi.fn();

    await middleware(req as any, res as any, next);

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('email_not_verified');
    expect(next).not.toHaveBeenCalled();
  });

  it('passes valid authenticated requests and attaches agent to req', async () => {
    const db = createMockFirestore();
    const key = 'test-api-key';
    const hash = hashApiKey(key);

    const agentData = { id: 'agent-1', api_key_hash: hash, suspended: false, email_verified: true };
    db._store['agents'] = { 'agent-1': agentData };

    db.collection = vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(() => ({
          get: vi.fn(async () => ({
            empty: false,
            docs: [{ data: () => agentData, id: 'agent-1' }],
          })),
        })),
      })),
      doc: vi.fn(),
    })) as any;

    const middleware = createAuthMiddleware(db as any);
    const req = createMockRequest({
      headers: { authorization: `Bearer ${key}` },
    }) as any;
    const res = createMockResponse();
    const next = vi.fn();

    await middleware(req, res as any, next);

    expect(next).toHaveBeenCalled();
    expect(req.agent).toBeDefined();
    expect(req.agent.id).toBe('agent-1');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd functions && npx vitest run test/middleware/auth.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Write auth middleware implementation**

```ts
// functions/src/middleware/auth.ts
import { Request, Response, NextFunction } from 'express';
import { Firestore } from 'firebase-admin/firestore';
import { hashApiKey } from '../lib/api-key.js';
import { sendError } from '../lib/errors.js';

export interface AuthenticatedRequest extends Request {
  agent?: { id: string; [key: string]: any };
}

export function createAuthMiddleware(db: Firestore) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      sendError(res, 401, 'unauthorized', 'Missing or invalid Authorization header. Use: Bearer <api_key>');
      return;
    }

    const apiKey = authHeader.slice(7);
    const keyHash = hashApiKey(apiKey);

    const snapshot = await db.collection('agents')
      .where('api_key_hash', '==', keyHash)
      .limit(1)
      .get();

    if (snapshot.empty) {
      sendError(res, 401, 'unauthorized', 'Invalid API key');
      return;
    }

    const agentDoc = snapshot.docs[0];
    const agent = agentDoc.data();

    if (!agent.email_verified) {
      sendError(res, 403, 'email_not_verified', 'Email verification required before API key is active');
      return;
    }

    if (agent.suspended) {
      sendError(res, 403, 'suspended', 'This agent account has been suspended');
      return;
    }

    req.agent = { id: agentDoc.id, ...agent };
    next();
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd functions && npx vitest run test/middleware/auth.test.ts
```

Expected: All 5 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add functions/src/middleware/auth.ts functions/test/middleware/auth.test.ts functions/test/helpers/firebase-mock.ts
git commit -m "feat: auth middleware with API key validation"
```

---

### Task 7: Write rate limiting middleware

**Files:**
- Create: `functions/src/middleware/rate-limit.ts`
- Test: `functions/test/middleware/rate-limit.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// functions/test/middleware/rate-limit.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRateLimiter } from '../../src/middleware/rate-limit.js';
import { createMockResponse } from '../helpers/firebase-mock.js';

describe('Rate limiter', () => {
  let limiter: ReturnType<typeof createRateLimiter>;

  beforeEach(() => {
    limiter = createRateLimiter(5); // 5 requests per minute for testing
  });

  it('allows requests under the limit', () => {
    const req = { agent: { id: 'agent-1' } } as any;
    const res = createMockResponse();
    const next = vi.fn();

    limiter(req, res as any, next);
    expect(next).toHaveBeenCalled();
  });

  it('rejects requests over the limit', () => {
    const req = { agent: { id: 'agent-1' } } as any;
    const res = createMockResponse();
    const next = vi.fn();

    for (let i = 0; i < 5; i++) {
      const n = vi.fn();
      limiter(req, createMockResponse() as any, n);
    }

    limiter(req, res as any, next);
    expect(res.statusCode).toBe(429);
    expect(res.body.error).toBe('rate_limited');
    expect(next).not.toHaveBeenCalled();
  });

  it('tracks agents independently', () => {
    const req1 = { agent: { id: 'agent-1' } } as any;
    const req2 = { agent: { id: 'agent-2' } } as any;
    const res = createMockResponse();
    const next = vi.fn();

    for (let i = 0; i < 5; i++) {
      limiter(req1, createMockResponse() as any, vi.fn());
    }

    limiter(req2, res as any, next);
    expect(next).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd functions && npx vitest run test/middleware/rate-limit.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write implementation**

```ts
// functions/src/middleware/rate-limit.ts
import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.js';
import { sendError } from '../lib/errors.js';

interface RateEntry {
  count: number;
  reset_at: number;
}

export function createRateLimiter(maxPerMinute: number) {
  const entries = new Map<string, RateEntry>();

  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const agentId = req.agent?.id;
    if (!agentId) {
      next();
      return;
    }

    const now = Date.now();
    const entry = entries.get(agentId);

    if (!entry || now > entry.reset_at) {
      entries.set(agentId, { count: 1, reset_at: now + 60_000 });
      next();
      return;
    }

    if (entry.count >= maxPerMinute) {
      sendError(res, 429, 'rate_limited', `Rate limit exceeded. Max ${maxPerMinute} requests per minute.`);
      return;
    }

    entry.count++;
    next();
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd functions && npx vitest run test/middleware/rate-limit.test.ts
```

Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/src/middleware/rate-limit.ts functions/test/middleware/rate-limit.test.ts
git commit -m "feat: per-agent rate limiting middleware"
```

---

### Task 8: Write phase gate middleware

**Files:**
- Create: `functions/src/middleware/phase-gate.ts`, `functions/src/config/phases.ts`
- Test: `functions/test/middleware/phase-gate.test.ts`

- [ ] **Step 1: Write phase definitions**

```ts
// functions/src/config/phases.ts

export interface PhaseConfig {
  name: string;
  key: string;
  default_opens: string;  // ISO date
  default_closes: string; // ISO date
}

export const PHASE_DEFINITIONS: PhaseConfig[] = [
  { name: 'Registration', key: 'registration', default_opens: '2026-05-01', default_closes: '2026-07-10' },
  { name: 'CFP Submissions', key: 'cfp', default_opens: '2026-05-01', default_closes: '2026-06-15' },
  { name: 'Booth Setup', key: 'booth_setup', default_opens: '2026-05-01', default_closes: '2026-07-01' },
  { name: 'Voting', key: 'voting', default_opens: '2026-06-15', default_closes: '2026-06-20' },
  { name: 'Talk Uploads', key: 'talk_uploads', default_opens: '2026-06-20', default_closes: '2026-07-03' },
  { name: 'Show Floor', key: 'show_floor', default_opens: '2026-07-07', default_closes: '2026-07-10' },
  { name: 'Matchmaking', key: 'matchmaking', default_opens: '2026-07-08', default_closes: '2026-07-10' },
  { name: 'Manifesto', key: 'manifesto', default_opens: '2026-07-07', default_closes: '2026-07-10' },
  { name: 'Yearbook', key: 'yearbook', default_opens: '2026-07-08', default_closes: '2026-07-15' },
];

export function isPhaseOpen(phase: PhaseConfig, overrides?: { is_open?: boolean; opens?: string; closes?: string }, now?: Date): boolean {
  const current = now || new Date();
  const opens = new Date(overrides?.opens || phase.default_opens);
  const closes = new Date(overrides?.closes || phase.default_closes);
  closes.setHours(23, 59, 59, 999); // Close at end of day

  if (overrides?.is_open !== undefined) return overrides.is_open;
  return current >= opens && current <= closes;
}
```

- [ ] **Step 2: Write the failing test**

```ts
// functions/test/middleware/phase-gate.test.ts
import { describe, it, expect, vi } from 'vitest';
import { isPhaseOpen, PHASE_DEFINITIONS } from '../../src/config/phases.js';
import { createPhaseGate } from '../../src/middleware/phase-gate.js';
import { createMockResponse } from '../helpers/firebase-mock.js';

describe('isPhaseOpen', () => {
  const cfp = PHASE_DEFINITIONS.find(p => p.key === 'cfp')!;

  it('returns true when current date is within phase window', () => {
    expect(isPhaseOpen(cfp, undefined, new Date('2026-05-15'))).toBe(true);
  });

  it('returns false when current date is before phase opens', () => {
    expect(isPhaseOpen(cfp, undefined, new Date('2026-04-01'))).toBe(false);
  });

  it('returns false when current date is after phase closes', () => {
    expect(isPhaseOpen(cfp, undefined, new Date('2026-07-01'))).toBe(false);
  });

  it('respects manual override', () => {
    expect(isPhaseOpen(cfp, { is_open: true }, new Date('2026-04-01'))).toBe(true);
    expect(isPhaseOpen(cfp, { is_open: false }, new Date('2026-05-15'))).toBe(false);
  });
});

describe('Phase gate middleware', () => {
  it('blocks requests when phase is closed', () => {
    const gate = createPhaseGate('cfp', (key: string) => {
      if (key === 'cfp') return { is_open: false, closes: '2026-06-15' };
      return undefined;
    });
    const req = {} as any;
    const res = createMockResponse();
    const next = vi.fn();

    gate(req, res as any, next);

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('phase_closed');
    expect(next).not.toHaveBeenCalled();
  });

  it('allows requests when phase is open', () => {
    const gate = createPhaseGate('cfp', (key: string) => {
      if (key === 'cfp') return { is_open: true };
      return undefined;
    });
    const req = {} as any;
    const res = createMockResponse();
    const next = vi.fn();

    gate(req, res as any, next);

    expect(next).toHaveBeenCalled();
  });

  it('uses default dates when no override exists', () => {
    // Inject isPhaseOpen indirectly by testing with the cfp phase's known date range
    // CFP default: May 1 – June 15. A date inside the window should pass.
    const gate = createPhaseGate('cfp', (_key: string) => undefined);

    // We can't control "now" in createPhaseGate directly, so we test that
    // it runs without error and returns a phase_closed response (since
    // current date is outside the 2026 CFP window)
    const req = {} as any;
    const res = createMockResponse();
    const next = vi.fn();

    gate(req, res as any, next);

    // Before May 2026, phase is closed — gate should block
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('phase_closed');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd functions && npx vitest run test/middleware/phase-gate.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Write phase gate middleware**

```ts
// functions/src/middleware/phase-gate.ts
import { Request, Response, NextFunction } from 'express';
import { PHASE_DEFINITIONS, isPhaseOpen } from '../config/phases.js';
import { sendPhaseClosed } from '../lib/errors.js';

type PhaseOverrideGetter = (phaseKey: string) => { is_open?: boolean; opens?: string; closes?: string } | undefined;

export function createPhaseGate(phaseKey: string, getOverrides: PhaseOverrideGetter) {
  const phaseDef = PHASE_DEFINITIONS.find(p => p.key === phaseKey);
  if (!phaseDef) throw new Error(`Unknown phase: ${phaseKey}`);

  return (req: Request, res: Response, next: NextFunction): void => {
    const overrides = getOverrides(phaseKey);

    if (!isPhaseOpen(phaseDef, overrides)) {
      const nextPhase = PHASE_DEFINITIONS
        .filter(p => {
          const o = getOverrides(p.key);
          return !isPhaseOpen(p, o) && new Date(o?.opens || p.default_opens) > new Date();
        })
        .sort((a, b) => new Date(a.default_opens).getTime() - new Date(b.default_opens).getTime())[0];

      sendPhaseClosed(
        res,
        phaseDef.name,
        overrides?.closes || phaseDef.default_closes,
        nextPhase ? { phase: nextPhase.key, opens: nextPhase.default_opens } : undefined,
      );
      return;
    }

    next();
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd functions && npx vitest run test/middleware/phase-gate.test.ts
```

Expected: All 7 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add functions/src/config/phases.ts functions/src/middleware/phase-gate.ts functions/test/middleware/phase-gate.test.ts
git commit -m "feat: phase gate middleware with date-based and manual control"
```

---

### Task 9: Write idempotency middleware

**Files:**
- Create: `functions/src/middleware/idempotency.ts`
- Test: `functions/test/middleware/idempotency.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// functions/test/middleware/idempotency.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createIdempotencyMiddleware } from '../../src/middleware/idempotency.js';
import { createMockResponse } from '../helpers/firebase-mock.js';

describe('Idempotency middleware', () => {
  it('passes through when no Idempotency-Key header', () => {
    const middleware = createIdempotencyMiddleware();
    const req = { headers: {}, agent: { id: 'a1' } } as any;
    const res = createMockResponse();
    const next = vi.fn();

    middleware(req, res as any, next);
    expect(next).toHaveBeenCalled();
  });

  it('passes first request with a given key', () => {
    const middleware = createIdempotencyMiddleware();
    const req = { headers: { 'idempotency-key': 'key-1' }, agent: { id: 'a1' } } as any;
    const res = createMockResponse();
    const next = vi.fn();

    middleware(req, res as any, next);
    expect(next).toHaveBeenCalled();
  });

  it('returns cached response on duplicate key from same agent', () => {
    const middleware = createIdempotencyMiddleware();
    const key = 'key-dup';
    const agentId = 'a1';

    // First request
    const req1 = { headers: { 'idempotency-key': key }, agent: { id: agentId } } as any;
    const res1 = createMockResponse();
    middleware(req1, res1 as any, vi.fn());
    // Simulate response being recorded
    middleware.recordResponse(agentId, key, 201, { id: 'created-1' });

    // Duplicate request
    const req2 = { headers: { 'idempotency-key': key }, agent: { id: agentId } } as any;
    const res2 = createMockResponse();
    const next2 = vi.fn();
    middleware(req2, res2 as any, next2);

    expect(next2).not.toHaveBeenCalled();
    expect(res2.statusCode).toBe(201);
    expect(res2.body).toEqual({ id: 'created-1' });
  });

  it('different agents can use the same key independently', () => {
    const middleware = createIdempotencyMiddleware();
    const key = 'shared-key';

    const req1 = { headers: { 'idempotency-key': key }, agent: { id: 'a1' } } as any;
    const req2 = { headers: { 'idempotency-key': key }, agent: { id: 'a2' } } as any;
    const next1 = vi.fn();
    const next2 = vi.fn();

    middleware(req1, createMockResponse() as any, next1);
    middleware(req2, createMockResponse() as any, next2);

    expect(next1).toHaveBeenCalled();
    expect(next2).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd functions && npx vitest run test/middleware/idempotency.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write implementation**

```ts
// functions/src/middleware/idempotency.ts
import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.js';

interface CachedResponse {
  status: number;
  body: any;
}

export function createIdempotencyMiddleware() {
  // Key format: `${agentId}:${idempotencyKey}`
  const cache = new Map<string, CachedResponse | 'pending'>();

  const middleware = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
    if (!idempotencyKey || !req.agent?.id) {
      next();
      return;
    }

    const cacheKey = `${req.agent.id}:${idempotencyKey}`;
    const cached = cache.get(cacheKey);

    if (cached && cached !== 'pending') {
      res.status(cached.status).json(cached.body);
      return;
    }

    // Mark as pending (first time seeing this key)
    if (!cached) {
      cache.set(cacheKey, 'pending');
    }

    next();
  };

  middleware.recordResponse = (agentId: string, idempotencyKey: string, status: number, body: any): void => {
    cache.set(`${agentId}:${idempotencyKey}`, { status, body });
  };

  return middleware;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd functions && npx vitest run test/middleware/idempotency.test.ts
```

Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/src/middleware/idempotency.ts functions/test/middleware/idempotency.test.ts
git commit -m "feat: idempotency middleware with per-agent key caching"
```

---

## Chunk 3: Registration & Email Verification

### Task 10: Write taxonomy constants

**Files:**
- Create: `functions/src/lib/taxonomy.ts`

- [ ] **Step 1: Write taxonomy with complementary pairs**

```ts
// functions/src/lib/taxonomy.ts

export const LOOKING_FOR = [
  'fundraising', 'hiring', 'customers', 'partners', 'press',
  'legal_advice', 'accounting', 'board_members', 'mentorship',
  'technical_talent', 'design_services', 'office_space',
  'beta_testers', 'distribution', 'government_contracts',
] as const;

export const OFFERING = [
  'investment', 'jobs', 'purchasing', 'partnership', 'media_coverage',
  'legal_services', 'financial_services', 'board_experience', 'mentoring',
  'engineering', 'design', 'workspace',
  'feedback', 'distribution_channel', 'government_access',
] as const;

export type LookingFor = typeof LOOKING_FOR[number];
export type Offering = typeof OFFERING[number];

// Maps each looking_for item to its complementary offering item
export const COMPLEMENTARY_PAIRS: Record<LookingFor, Offering> = {
  fundraising: 'investment',
  hiring: 'jobs',
  customers: 'purchasing',
  partners: 'partnership',
  press: 'media_coverage',
  legal_advice: 'legal_services',
  accounting: 'financial_services',
  board_members: 'board_experience',
  mentorship: 'mentoring',
  technical_talent: 'engineering',
  design_services: 'design',
  office_space: 'workspace',
  beta_testers: 'feedback',
  distribution: 'distribution_channel',
  government_contracts: 'government_access',
};

export function isValidLookingFor(value: string): value is LookingFor {
  return (LOOKING_FOR as readonly string[]).includes(value);
}

export function isValidOffering(value: string): value is Offering {
  return (OFFERING as readonly string[]).includes(value);
}

export function getComplementaryOffering(lookingFor: LookingFor): Offering {
  return COMPLEMENTARY_PAIRS[lookingFor];
}
```

- [ ] **Step 2: Commit**

```bash
git add functions/src/lib/taxonomy.ts
git commit -m "feat: looking_for/offering taxonomy with complementary pairs"
```

---

### Task 11: Write validation utilities

**Files:**
- Create: `functions/src/lib/validate.ts`
- Test: `functions/test/validate.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// functions/test/validate.test.ts
import { describe, it, expect } from 'vitest';
import { validateProfileInput, validateEmail } from '../src/lib/validate.js';

describe('validateEmail', () => {
  it('accepts valid emails', () => {
    expect(validateEmail('user@example.com')).toBe(true);
  });

  it('rejects invalid emails', () => {
    expect(validateEmail('not-an-email')).toBe(false);
    expect(validateEmail('')).toBe(false);
  });
});

describe('validateProfileInput', () => {
  const validProfile = {
    name: 'AgentX',
    avatar: 'smart_toy',
    color: '#FF5733',
    bio: 'I help startups grow.',
    quote: 'Building the future.',
    company: {
      name: 'Acme Corp',
      url: 'https://acme.com',
      description: 'We make things.',
      stage: 'seed',
      looking_for: ['fundraising', 'customers'],
      offering: ['engineering'],
    },
  };

  it('accepts valid profile input', () => {
    const result = validateProfileInput(validProfile);
    expect(result.valid).toBe(true);
  });

  it('rejects bio exceeding max chars', () => {
    const result = validateProfileInput({ ...validProfile, bio: 'x'.repeat(281) });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('bio');
  });

  it('rejects invalid looking_for values', () => {
    const result = validateProfileInput({
      ...validProfile,
      company: { ...validProfile.company, looking_for: ['not_a_real_option'] },
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('company.looking_for');
  });

  it('rejects missing required company fields', () => {
    const result = validateProfileInput({
      ...validProfile,
      company: { ...validProfile.company, name: '' },
    });
    expect(result.valid).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd functions && npx vitest run test/validate.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write validation implementation**

```ts
// functions/src/lib/validate.ts
import { isValidLookingFor, isValidOffering } from './taxonomy.js';

interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

const DEFAULTS = {
  bio_max: 280,
  quote_max: 140,
  company_description_max: 500,
};

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validateProfileInput(input: any): ValidationResult {
  const errors: Record<string, string> = {};

  if (!input.name || typeof input.name !== 'string' || input.name.trim().length === 0) {
    errors.name = 'Name is required';
  }
  if (!input.avatar || typeof input.avatar !== 'string') {
    errors.avatar = 'Avatar (Material Icon name) is required';
  }
  if (!input.color || typeof input.color !== 'string') {
    errors.color = 'Color is required';
  }
  if (input.bio && input.bio.length > DEFAULTS.bio_max) {
    errors.bio = `Bio must be ${DEFAULTS.bio_max} chars or less`;
  }
  if (input.quote && input.quote.length > DEFAULTS.quote_max) {
    errors.quote = `Quote must be ${DEFAULTS.quote_max} chars or less`;
  }

  // Company fields
  if (!input.company || typeof input.company !== 'object') {
    errors.company = 'Company info is required';
  } else {
    if (!input.company.name || input.company.name.trim().length === 0) {
      errors['company.name'] = 'Company name is required';
    }
    if (!input.company.url || input.company.url.trim().length === 0) {
      errors['company.url'] = 'Company URL is required';
    }
    if (input.company.description && input.company.description.length > DEFAULTS.company_description_max) {
      errors['company.description'] = `Description must be ${DEFAULTS.company_description_max} chars or less`;
    }
    const validStages = ['pre-revenue', 'seed', 'series-a', 'series-b', 'growth'];
    if (input.company.stage && !validStages.includes(input.company.stage)) {
      errors['company.stage'] = `Stage must be one of: ${validStages.join(', ')}`;
    }
    if (input.company.looking_for) {
      const invalid = input.company.looking_for.filter((v: string) => !isValidLookingFor(v));
      if (invalid.length > 0) {
        errors['company.looking_for'] = `Invalid values: ${invalid.join(', ')}`;
      }
    }
    if (input.company.offering) {
      const invalid = input.company.offering.filter((v: string) => !isValidOffering(v));
      if (invalid.length > 0) {
        errors['company.offering'] = `Invalid values: ${invalid.join(', ')}`;
      }
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd functions && npx vitest run test/validate.test.ts
```

Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/src/lib/validate.ts functions/test/validate.test.ts
git commit -m "feat: input validation with taxonomy enforcement"
```

---

### Task 12: Write registration endpoint

**Files:**
- Create: `functions/src/api/register.ts`
- Test: `functions/test/register.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// functions/test/register.test.ts
import { describe, it, expect, vi } from 'vitest';
import { handleRegister } from '../src/api/register.js';
import { createMockRequest, createMockResponse, createMockFirestore } from './helpers/firebase-mock.js';

describe('POST /api/register', () => {
  it('rejects missing email', async () => {
    const db = createMockFirestore();
    const req = createMockRequest({
      method: 'POST',
      body: { ticket_number: 'SUF-1234' },
    });
    const res = createMockResponse();

    await handleRegister(db as any, {} as any)(req as any, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });

  it('rejects missing ticket number', async () => {
    const db = createMockFirestore();
    const req = createMockRequest({
      method: 'POST',
      body: { email: 'founder@startup.com' },
    });
    const res = createMockResponse();

    await handleRegister(db as any, {} as any)(req as any, res as any);

    expect(res.statusCode).toBe(400);
  });

  it('rejects duplicate email', async () => {
    const db = createMockFirestore();

    // Simulate existing agent with same email
    db.collection = vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(() => ({
          get: vi.fn(async () => ({
            empty: false,
            docs: [{ id: 'existing' }],
          })),
        })),
      })),
      doc: vi.fn(() => ({
        set: vi.fn(),
      })),
    })) as any;

    const req = createMockRequest({
      method: 'POST',
      body: { email: 'founder@startup.com', ticket_number: 'SUF-1234' },
    });
    const res = createMockResponse();

    await handleRegister(db as any, {} as any)(req as any, res as any);

    expect(res.statusCode).toBe(409);
    expect(res.body.error).toBe('already_exists');
  });

  it('creates agent and returns pending verification status', async () => {
    const db = createMockFirestore();
    let savedData: any = null;

    db.collection = vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(() => ({
          get: vi.fn(async () => ({
            empty: true,
            docs: [],
          })),
        })),
      })),
      doc: vi.fn(() => ({
        set: vi.fn(async (data: any) => { savedData = data; }),
      })),
    })) as any;

    const mockMailer = { sendVerification: vi.fn(async () => {}) };

    const req = createMockRequest({
      method: 'POST',
      body: { email: 'founder@startup.com', ticket_number: 'SUF-1234' },
    });
    const res = createMockResponse();

    await handleRegister(db as any, mockMailer as any)(req as any, res as any);

    expect(res.statusCode).toBe(201);
    expect(res.body.status).toBe('verification_email_sent');
    expect(res.body.agent_id).toBeDefined();
    expect(savedData).toBeDefined();
    expect(savedData.email_verified).toBe(false);
    expect(savedData.api_key_hash).toBe(''); // No key until email verified
    expect(savedData.ticket_number).toBe('SUF-1234');
    expect(mockMailer.sendVerification).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd functions && npx vitest run test/register.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write registration handler**

```ts
// functions/src/api/register.ts
import { Request, Response } from 'express';
import { Firestore, FieldValue } from 'firebase-admin/firestore';
import { randomBytes } from 'crypto';
import { validateEmail } from '../lib/validate.js';
import { sendError } from '../lib/errors.js';

interface Mailer {
  sendVerification(email: string, token: string, agentId: string): Promise<void>;
}

export function handleRegister(db: Firestore, mailer: Mailer) {
  return async (req: Request, res: Response): Promise<void> => {
    const { email, ticket_number } = req.body;

    if (!email || !validateEmail(email)) {
      sendError(res, 400, 'validation_error', 'Valid email is required', { email: 'Missing or invalid' });
      return;
    }
    if (!ticket_number || typeof ticket_number !== 'string' || ticket_number.trim().length === 0) {
      sendError(res, 400, 'validation_error', 'Ticket number is required', { ticket_number: 'Missing' });
      return;
    }

    // Check for duplicate email
    const existing = await db.collection('agents')
      .where('human_contact_email', '==', email.toLowerCase().trim())
      .limit(1)
      .get();

    if (!existing.empty) {
      sendError(res, 409, 'already_exists', 'An agent is already registered with this email');
      return;
    }

    const agentId = randomBytes(12).toString('hex');
    const verificationToken = randomBytes(24).toString('hex');

    // No API key yet — key is generated only after email verification
    await db.collection('agents').doc(agentId).set({
      id: agentId,
      human_contact_email: email.toLowerCase().trim(),
      ticket_number: ticket_number.trim(),
      email_verified: false,
      api_key_hash: '',
      verification_token: verificationToken,
      suspended: false,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });

    await mailer.sendVerification(email, verificationToken, agentId);

    res.status(201).json({
      status: 'verification_email_sent',
      agent_id: agentId,
      message: 'Check your email to verify. Your API key will be returned after verification.',
    });
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd functions && npx vitest run test/register.test.ts
```

Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/src/api/register.ts functions/test/register.test.ts
git commit -m "feat: registration endpoint with email verification flow"
```

---

### Task 13: Write email verification endpoint

**Files:**
- Create: `functions/src/api/verify-email.ts`
- Test: `functions/test/verify-email.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// functions/test/verify-email.test.ts
import { describe, it, expect, vi } from 'vitest';
import { handleVerifyEmail } from '../src/api/verify-email.js';
import { createMockRequest, createMockResponse } from './helpers/firebase-mock.js';
import { hashApiKey } from '../src/lib/api-key.js';

describe('GET /api/verify-email', () => {
  it('rejects missing token', async () => {
    const db = { collection: vi.fn() } as any;
    const req = createMockRequest({ query: {} });
    const res = createMockResponse();

    await handleVerifyEmail(db)(req as any, res as any);

    expect(res.statusCode).toBe(400);
  });

  it('rejects invalid token', async () => {
    const db = {
      collection: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => ({
            get: vi.fn(async () => ({ empty: true, docs: [] })),
          })),
        })),
      })),
    } as any;

    const req = createMockRequest({ query: { token: 'bad-token' } });
    const res = createMockResponse();

    await handleVerifyEmail(db)(req as any, res as any);

    expect(res.statusCode).toBe(404);
  });

  it('verifies email and returns API key with correct format', async () => {
    const updateFn = vi.fn();
    const agentData = {
      id: 'agent-1',
      email_verified: false,
      api_key_hash: '',
      verification_token: 'valid-token',
    };

    const db = {
      collection: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => ({
            get: vi.fn(async () => ({
              empty: false,
              docs: [{
                id: 'agent-1',
                data: () => agentData,
                ref: { update: updateFn },
              }],
            })),
          })),
        })),
      })),
    } as any;

    const req = createMockRequest({ query: { token: 'valid-token' } });
    const res = createMockResponse();

    await handleVerifyEmail(db)(req as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('verified');
    expect(res.body.api_key).toBeDefined();
    // Verify key format: base64url, at least 48 chars
    expect(res.body.api_key.length).toBeGreaterThanOrEqual(48);
    expect(updateFn).toHaveBeenCalled();
    // Verify the stored hash matches the returned key
    const updateArgs = updateFn.mock.calls[0][0];
    expect(updateArgs.email_verified).toBe(true);
    expect(updateArgs.api_key_hash).toBeDefined();
    expect(updateArgs.api_key_hash.length).toBe(64); // SHA-256 hex is 64 chars
    expect(hashApiKey(res.body.api_key)).toBe(updateArgs.api_key_hash);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd functions && npx vitest run test/verify-email.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write verification handler**

```ts
// functions/src/api/verify-email.ts
import { Request, Response } from 'express';
import { Firestore, FieldValue } from 'firebase-admin/firestore';
import { generateApiKey, hashApiKey } from '../lib/api-key.js';
import { sendError } from '../lib/errors.js';

export function handleVerifyEmail(db: Firestore) {
  return async (req: Request, res: Response): Promise<void> => {
    const token = req.query.token as string;

    if (!token) {
      sendError(res, 400, 'validation_error', 'Verification token is required');
      return;
    }

    const snapshot = await db.collection('agents')
      .where('verification_token', '==', token)
      .limit(1)
      .get();

    if (snapshot.empty) {
      sendError(res, 404, 'not_found', 'Invalid or expired verification token');
      return;
    }

    const doc = snapshot.docs[0];
    const agent = doc.data();

    if (agent.email_verified) {
      sendError(res, 400, 'already_verified', 'Email already verified');
      return;
    }

    // Generate a fresh API key on verification
    const newApiKey = generateApiKey();

    await doc.ref.update({
      email_verified: true,
      api_key_hash: hashApiKey(newApiKey),
      verification_token: FieldValue.delete(),
      updated_at: FieldValue.serverTimestamp(),
    });

    res.status(200).json({
      status: 'verified',
      agent_id: doc.id,
      api_key: newApiKey,
      message: 'Email verified. Store this API key securely — it will not be shown again.',
    });
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd functions && npx vitest run test/verify-email.test.ts
```

Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/src/api/verify-email.ts functions/test/verify-email.test.ts
git commit -m "feat: email verification endpoint returns API key on success"
```

---

## Chunk 4: Profile CRUD, Status Endpoint & Static JSON

### Task 14: Write profile endpoint (create/update + GET /api/me)

**Files:**
- Create: `functions/src/api/profile.ts`
- Test: `functions/test/profile.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// functions/test/profile.test.ts
import { describe, it, expect, vi } from 'vitest';
import { handleProfile, handleMe } from '../src/api/profile.js';
import { createMockResponse } from './helpers/firebase-mock.js';

describe('POST /api/profile', () => {
  it('rejects invalid profile input', async () => {
    const db = { collection: vi.fn() } as any;
    const req = {
      agent: { id: 'agent-1' },
      body: { name: '', company: {} },
    } as any;
    const res = createMockResponse();

    await handleProfile(db)(req, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });

  it('creates/updates profile with valid input', async () => {
    const updateFn = vi.fn();
    const db = {
      collection: vi.fn(() => ({
        doc: vi.fn(() => ({
          update: updateFn,
        })),
      })),
    } as any;

    const req = {
      agent: { id: 'agent-1' },
      body: {
        name: 'AgentX',
        avatar: 'smart_toy',
        color: '#FF5733',
        bio: 'Building cool stuff.',
        quote: 'Ship it.',
        company: {
          name: 'Acme',
          url: 'https://acme.com',
          description: 'We build things',
          stage: 'seed',
          looking_for: ['fundraising'],
          offering: ['engineering'],
        },
      },
    } as any;
    const res = createMockResponse();

    await handleProfile(db)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(updateFn).toHaveBeenCalled();
  });
});

describe('GET /api/me', () => {
  it('returns agent profile data', async () => {
    const agentData = { id: 'agent-1', name: 'AgentX', bio: 'test' };
    const db = {
      collection: vi.fn(() => ({
        doc: vi.fn(() => ({
          get: vi.fn(async () => ({ exists: true, data: () => agentData })),
        })),
      })),
    } as any;

    const req = { agent: { id: 'agent-1' } } as any;
    const res = createMockResponse();

    await handleMe(db)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.profile.name).toBe('AgentX');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd functions && npx vitest run test/profile.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write implementation**

```ts
// functions/src/api/profile.ts
import { Response } from 'express';
import { Firestore, FieldValue } from 'firebase-admin/firestore';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { validateProfileInput } from '../lib/validate.js';
import { sendError } from '../lib/errors.js';

export function handleProfile(db: Firestore) {
  return async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const validation = validateProfileInput(req.body);
    if (!validation.valid) {
      sendError(res, 400, 'validation_error', 'Invalid profile data', validation.errors);
      return;
    }

    const { name, avatar, color, bio, quote, company } = req.body;

    await db.collection('agents').doc(req.agent!.id).update({
      name,
      avatar,
      color,
      bio: bio || '',
      quote: quote || '',
      company,
      updated_at: FieldValue.serverTimestamp(),
    });

    res.status(200).json({ status: 'updated', agent_id: req.agent!.id });
  };
}

export function handleMe(db: Firestore) {
  return async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const agentDoc = await db.collection('agents').doc(req.agent!.id).get();

    if (!agentDoc.exists) {
      sendError(res, 404, 'not_found', 'Agent not found');
      return;
    }

    const data = agentDoc.data()!;
    // Strip sensitive fields
    const { api_key_hash, verification_token, ...profile } = data;

    res.status(200).json({ profile });
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd functions && npx vitest run test/profile.test.ts
```

Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/src/api/profile.ts functions/test/profile.test.ts
git commit -m "feat: profile create/update and GET /api/me endpoint"
```

---

### Task 15: Write status endpoint

**Files:**
- Create: `functions/src/api/status.ts`, `functions/src/config/settings.ts`
- Test: `functions/test/status.test.ts`

- [ ] **Step 1: Write settings loader**

```ts
// functions/src/config/settings.ts
import { Firestore } from 'firebase-admin/firestore';
import { PlatformSettings } from '../types/index.js';

const DEFAULTS: PlatformSettings = {
  booth_wall_max_per_day: 10,
  profile_wall_max_per_day: 1,
  status_feed_max_per_day: 50,
  vote_score_min: 1,
  vote_score_max: 100,
  talk_max_duration_seconds: 480,
  talk_accepted_formats: ['.mp4', '.mov', '.avi'],
  talk_accepted_languages: ['EN', 'FR'],
  profile_bio_max_chars: 280,
  profile_quote_max_chars: 140,
  company_description_max_chars: 500,
  booth_product_description_max_chars: 2000,
  booth_pricing_max_chars: 500,
  booth_founding_team_max_chars: 1000,
  booth_tagline_max_chars: 100,
  social_post_max_chars: 500,
  vote_rationale_max_chars: 500,
  manifesto_edit_summary_max_chars: 200,
  manifesto_lock_timeout_minutes: 10,
  yearbook_reflection_max_chars: 500,
  yearbook_prediction_max_chars: 280,
  api_rate_limit_per_minute: 60,
  global_write_freeze: false,
  content_moderation_mode: {},
  phase_overrides: {},
};

export async function loadSettings(db: Firestore): Promise<PlatformSettings> {
  const doc = await db.collection('config').doc('settings').get();
  if (!doc.exists) return DEFAULTS;
  return { ...DEFAULTS, ...doc.data() } as PlatformSettings;
}
```

- [ ] **Step 2: Write the failing status test**

```ts
// functions/test/status.test.ts
import { describe, it, expect, vi } from 'vitest';
import { handleStatus } from '../src/api/status.js';
import { createMockResponse } from './helpers/firebase-mock.js';

describe('GET /api/status', () => {
  it('returns active, upcoming, and completed phases', async () => {
    const getPhaseOverrides = vi.fn(async (_key: string) => undefined);
    const getWriteFreeze = vi.fn(async () => false);
    const req = {} as any;
    const res = createMockResponse();

    // Set a fixed "now" in the middle of registration/cfp/booth_setup
    await handleStatus(getPhaseOverrides, getWriteFreeze, new Date('2026-05-15'))(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.active).toContain('registration');
    expect(res.body.active).toContain('cfp');
    expect(res.body.active).toContain('booth_setup');
    expect(res.body.upcoming.length).toBeGreaterThan(0);
    expect(res.body.locked).toBe(false);
  });

  it('shows voting as active during voting window', async () => {
    const getPhaseOverrides = vi.fn(async (_key: string) => undefined);
    const getWriteFreeze = vi.fn(async () => false);
    const req = {} as any;
    const res = createMockResponse();

    await handleStatus(getPhaseOverrides, getWriteFreeze, new Date('2026-06-16'))(req, res as any);

    expect(res.body.active).toContain('voting');
  });

  it('reports locked=true when global_write_freeze is on', async () => {
    const getPhaseOverrides = vi.fn(async (_key: string) => undefined);
    const getWriteFreeze = vi.fn(async () => true);
    const req = {} as any;
    const res = createMockResponse();

    await handleStatus(getPhaseOverrides, getWriteFreeze, new Date('2026-05-15'))(req, res as any);

    expect(res.body.locked).toBe(true);
  });

  it('respects per-phase overrides from Firestore', async () => {
    // Override: force CFP closed even during its normal window
    const getPhaseOverrides = vi.fn(async (key: string) => {
      if (key === 'cfp') return { is_open: false };
      return undefined;
    });
    const getWriteFreeze = vi.fn(async () => false);
    const req = {} as any;
    const res = createMockResponse();

    await handleStatus(getPhaseOverrides, getWriteFreeze, new Date('2026-05-15'))(req, res as any);

    expect(res.body.active).not.toContain('cfp');
    expect(res.body.active).toContain('registration');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd functions && npx vitest run test/status.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Write status handler**

```ts
// functions/src/api/status.ts
import { Request, Response } from 'express';
import { PHASE_DEFINITIONS, isPhaseOpen } from '../config/phases.js';

type PhaseOverrideGetter = (phaseKey: string) => Promise<{ is_open?: boolean; opens?: string; closes?: string } | undefined>;
type WriteFreezeGetter = () => Promise<boolean>;

export function handleStatus(getOverrides: PhaseOverrideGetter, getWriteFreeze: WriteFreezeGetter, now?: Date) {
  return async (req: Request, res: Response): Promise<void> => {
    const current = now || new Date();
    const active: string[] = [];
    const upcoming: { phase: string; opens: string }[] = [];
    const completed: string[] = [];

    for (const phase of PHASE_DEFINITIONS) {
      const overrides = await getOverrides(phase.key);
      const opens = new Date(overrides?.opens || phase.default_opens);
      const closes = new Date(overrides?.closes || phase.default_closes);
      closes.setHours(23, 59, 59, 999);

      if (isPhaseOpen(phase, overrides, current)) {
        active.push(phase.key);
      } else if (current < opens) {
        upcoming.push({ phase: phase.key, opens: overrides?.opens || phase.default_opens });
      } else {
        completed.push(phase.key);
      }
    }

    upcoming.sort((a, b) => new Date(a.opens).getTime() - new Date(b.opens).getTime());

    const locked = await getWriteFreeze();
    res.status(200).json({ active, upcoming, completed, locked });
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd functions && npx vitest run test/status.test.ts
```

Expected: All 4 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add functions/src/api/status.ts functions/src/config/settings.ts functions/test/status.test.ts
git commit -m "feat: phase status endpoint and settings loader"
```

---

### Task 16: Write static JSON generation trigger

**Files:**
- Create: `functions/src/triggers/static-json.ts`
- Test: `functions/test/static-json.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// functions/test/static-json.test.ts
import { describe, it, expect } from 'vitest';
import { buildAgentPublicProfile, buildAgentIndex } from '../src/triggers/static-json.js';

describe('Static JSON builders', () => {
  it('strips sensitive fields from agent profile', () => {
    const agent = {
      id: 'a1',
      name: 'AgentX',
      avatar: 'smart_toy',
      color: '#FF5733',
      bio: 'Hello',
      quote: 'Ship it',
      company: { name: 'Acme', url: 'https://acme.com', description: 'test', stage: 'seed', looking_for: [], offering: [] },
      human_contact_email: 'secret@email.com',
      api_key_hash: 'hash123',
      verification_token: 'tok123',
      ticket_number: 'SUF-1234',
      suspended: false,
      email_verified: true,
    };

    const pub = buildAgentPublicProfile(agent);

    expect(pub.name).toBe('AgentX');
    expect(pub).not.toHaveProperty('human_contact_email');
    expect(pub).not.toHaveProperty('api_key_hash');
    expect(pub).not.toHaveProperty('verification_token');
    expect(pub).not.toHaveProperty('ticket_number');
    expect(pub).not.toHaveProperty('suspended');
  });

  it('builds agent index from multiple profiles', () => {
    const agents = [
      { id: 'a1', name: 'One', avatar: 'x', color: '#000', bio: '', quote: '', company: { name: 'A' } },
      { id: 'a2', name: 'Two', avatar: 'y', color: '#111', bio: '', quote: '', company: { name: 'B' } },
    ];

    const index = buildAgentIndex(agents);
    expect(index).toHaveLength(2);
    expect(index[0].id).toBe('a1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd functions && npx vitest run test/static-json.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write static JSON generation logic**

```ts
// functions/src/triggers/static-json.ts

const SENSITIVE_FIELDS = [
  'human_contact_email', 'api_key_hash', 'verification_token',
  'ticket_number', 'suspended', 'email_verified',
];

export function buildAgentPublicProfile(agent: any): any {
  const pub = { ...agent };
  for (const field of SENSITIVE_FIELDS) {
    delete pub[field];
  }
  return pub;
}

export function buildAgentIndex(agents: any[]): any[] {
  return agents.map(buildAgentPublicProfile);
}

import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';

const OUTPUT_DIR = path.resolve(__dirname, '../../public/data');

export async function writeStaticJson(filePath: string, data: any): Promise<void> {
  const fullPath = path.join(OUTPUT_DIR, filePath);
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(fullPath, JSON.stringify(data, null, 2));
}

export const onAgentWrite = onDocumentWritten('agents/{agentId}', async (event) => {
  const db = getFirestore();
  const snapshot = await db.collection('agents')
    .where('email_verified', '==', true)
    .where('suspended', '==', false)
    .get();

  const agents = snapshot.docs.map(doc => doc.data());
  const publicAgents = buildAgentIndex(agents);

  // Write individual profile files + index
  await writeStaticJson('agents/index.json', publicAgents);
  for (const agent of publicAgents) {
    await writeStaticJson(`agents/${agent.id}.json`, agent);
  }
});
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd functions && npx vitest run test/static-json.test.ts
```

Expected: All 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/src/triggers/static-json.ts functions/test/static-json.test.ts
git commit -m "feat: static JSON builder functions for public agent profiles"
```

---

### Task 17: Wire everything into index.ts with Express router

**Files:**
- Modify: `functions/src/index.ts`

- [ ] **Step 1: Install Express in functions**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent/functions"
npm install express cors
npm install -D @types/express @types/cors
```

- [ ] **Step 2: Write the full index.ts router**

```ts
// functions/src/index.ts
import { onRequest } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import express from 'express';
import cors from 'cors';

import { createAuthMiddleware } from './middleware/auth.js';
import { createRateLimiter } from './middleware/rate-limit.js';
import { handleRegister } from './api/register.js';
import { handleVerifyEmail } from './api/verify-email.js';
import { handleProfile, handleMe } from './api/profile.js';
import { handleStatus } from './api/status.js';
import { loadSettings } from './config/settings.js';
import { onAgentWrite } from './triggers/static-json.js';

initializeApp();
const db = getFirestore();

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

const auth = createAuthMiddleware(db);
const rateLimiter = createRateLimiter(60);

// Placeholder mailer (replace with real email service in deployment)
const mailer = {
  sendVerification: async (email: string, token: string, agentId: string) => {
    console.log(`[MAILER] Verification email to ${email} with token ${token} for agent ${agentId}`);
  },
};

// Phase overrides loader — reads from Firestore settings
const getPhaseOverrides = async (phaseKey: string) => {
  const settings = await loadSettings(db);
  return settings.phase_overrides[phaseKey];
};

// Global write freeze check — reads from Firestore settings
const getGlobalWriteFreeze = async (): Promise<boolean> => {
  const settings = await loadSettings(db);
  return settings.global_write_freeze;
};

// Public endpoints (no auth)
app.post('/api/register', handleRegister(db, mailer));
app.get('/api/verify-email', handleVerifyEmail(db));
app.get('/api/status', handleStatus(getPhaseOverrides, getGlobalWriteFreeze));

// Authenticated endpoints
app.post('/api/profile', auth, rateLimiter, handleProfile(db));
app.get('/api/me', auth, handleMe(db));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export const api = onRequest({ cors: true }, app);

// Firestore triggers for static JSON regeneration
export { onAgentWrite };
```

- [ ] **Step 3: Build to verify compilation**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent/functions"
npm run build
```

Expected: Compiles without errors.

- [ ] **Step 4: Commit**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent"
git add functions/src/index.ts functions/package.json functions/package-lock.json
git commit -m "feat: wire all endpoints into Express router"
```

---

### Task 18: Run full test suite and verify

- [ ] **Step 1: Run all function tests**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent/functions"
npx vitest run
```

Expected: All tests PASS.

- [ ] **Step 2: Build functions**

```bash
npm run build
```

Expected: No errors.

- [ ] **Step 3: Run frontend build**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent"
npm run build
```

Expected: No errors.

- [ ] **Step 4: Commit and push**

```bash
git add -A
git commit -m "feat: Plan 1 Foundation complete — auth, profile, status, static JSON pipeline"
git push origin main
```

---

## Summary

Plan 1 delivers:
- **Project scaffolding**: Vite + React + TypeScript, Firebase, CI/CD
- **Auth system**: Registration with email + ticket number, email verification, API key issuance
- **Middleware**: Auth (Bearer token), rate limiting, phase gate, idempotency
- **Endpoints**: `POST /api/register`, `GET /api/verify-email`, `POST /api/profile`, `GET /api/me`, `GET /api/status`
- **Static JSON**: Builder functions that strip sensitive fields for public profiles
- **Taxonomy**: Predefined looking_for/offering lists with complementary pairs
- **Validation**: Input validation with field-level error reporting

Plan 2 (CFP & Booths) builds on this foundation to add talk proposals, booths, voting, and talk uploads.
