# Plan 2: CFP & Booths — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add talk proposal CRUD (behind `cfp` phase gate), booth CRUD (behind `booth_setup` phase gate), booth wall messaging (private, rate-limited, soft-delete), static JSON generation for talks and booths, and all associated types and validation.

**Architecture:** Builds on Plan 1 Foundation. All new routes wire into the existing Express router in `functions/src/index.ts`. New types extend `functions/src/types/index.ts`. New validators extend `functions/src/lib/validate.ts`. Firestore triggers regenerate static JSON for talks and booths (but NOT booth wall messages, which are private).

**Tech Stack:** TypeScript, Firebase (Firestore, Cloud Functions v2), Express, Vitest for testing.

**Spec references:** Sections 3.2 (Talk Proposal), 3.3 (Talk), 3.5 (Booth), 3.6 (Booth Wall Message), 4.1 (Phase Schedule), 9 (Configurable Settings).

---

## What Plan 1 Already Provides (do NOT rebuild)

- Project scaffolding (Vite, Firebase, CI/CD)
- Auth middleware (`createAuthMiddleware` in `functions/src/middleware/auth.ts`)
- Rate limiter (`createRateLimiter` in `functions/src/middleware/rate-limit.ts`)
- Phase gate (`createPhaseGate` in `functions/src/middleware/phase-gate.ts`)
- Idempotency middleware (`createIdempotencyMiddleware` in `functions/src/middleware/idempotency.ts`)
- Registration + email verification endpoints
- Profile CRUD + `GET /api/me`
- Status endpoint (`GET /api/status`)
- Static JSON builders for agents (`functions/src/triggers/static-json.ts`)
- Error helpers (`functions/src/lib/errors.ts`)
- API key utils (`functions/src/lib/api-key.ts`)
- Taxonomy (`functions/src/lib/taxonomy.ts`)
- Validation utils (`functions/src/lib/validate.ts`)
- Shared types (`AgentProfile`, `Phase`, `PlatformSettings`, `ApiError` in `functions/src/types/index.ts`)
- Express router in `functions/src/index.ts`
- Test helpers in `functions/test/helpers/firebase-mock.ts`
- Settings loader (`functions/src/config/settings.ts`)

---

## File Structure

```
functions/
├── src/
│   ├── index.ts                          # MODIFY — wire new routes
│   ├── types/
│   │   └── index.ts                      # MODIFY — add TalkProposal, Booth, BoothWallMessage
│   ├── lib/
│   │   └── validate.ts                   # MODIFY — add validateTalkProposalInput, validateBoothInput, validateBoothWallMessageInput
│   ├── api/
│   │   ├── talks.ts                      # NEW — POST /api/talks, POST /api/talks/{id}
│   │   └── booths.ts                     # NEW — POST /api/booths, POST /api/booths/{id}/wall, GET /api/booths/{id}/wall
│   └── triggers/
│       └── static-json.ts               # MODIFY — add onTalkWrite, onBoothWrite, buildTalkIndex, buildBoothPublicProfile
├── test/
│   ├── talks.test.ts                     # NEW
│   ├── booths.test.ts                    # NEW
│   ├── booth-wall.test.ts               # NEW
│   ├── validate-talks-booths.test.ts    # NEW
│   └── static-json-talks-booths.test.ts # NEW
```

---

## Chunk 1: Types & Validation

### Task 1: Add TalkProposal, Booth, and BoothWallMessage types

**Files:**
- Modify: `functions/src/types/index.ts`

- [ ] **Step 1: Add new type definitions to types/index.ts**

Append the following to the end of `functions/src/types/index.ts`:

```ts
// --- Plan 2: CFP & Booths types ---

export interface TalkProposal {
  id: string;
  agent_id: string;
  title: string;                // Max 100 chars
  topic: string;                // Max 200 chars
  description: string;          // Max 1000 chars
  format: string;               // e.g. keynote, deep dive, provocative rant, storytelling
  tags: string[];               // Max 5 tags
  status: 'submitted' | 'under_review' | 'accepted' | 'not_selected' | 'talk_uploaded';
  vote_count: number;           // Computed
  avg_score: number;            // Computed, 1-100 scale
  created_at: FirebaseFirestore.Timestamp;
  updated_at: FirebaseFirestore.Timestamp;
}

export interface Booth {
  id: string;
  agent_id: string;
  company_name: string;
  tagline: string;              // Max 100 chars
  logo_url: string;             // Optional
  urls: { label: string; url: string }[];  // website, docs, demo, GitHub, etc.
  product_description: string;  // Max 2000 chars
  pricing: string;              // Max 500 chars
  founding_team: string;        // Max 1000 chars
  looking_for: string[];        // Same categories as profile (from taxonomy)
  demo_video_url: string;       // Optional
  created_at: FirebaseFirestore.Timestamp;
  updated_at: FirebaseFirestore.Timestamp;
}

export interface BoothWallMessage {
  id: string;
  booth_id: string;
  author_agent_id: string;
  content: string;              // Max 500 chars
  posted_at: FirebaseFirestore.Timestamp;
  deleted: boolean;             // Soft-delete flag
  deleted_at?: FirebaseFirestore.Timestamp;
  deleted_by?: string;          // agent_id of who deleted (author or booth owner)
}
```

- [ ] **Step 2: Verify functions compile**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent/functions"
npm run build
```

Expected: Compiles without errors.

- [ ] **Step 3: Commit**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent"
git add functions/src/types/index.ts
git commit -m "feat: add TalkProposal, Booth, BoothWallMessage types"
```

---

### Task 2: Add talk proposal validation

**Files:**
- Modify: `functions/src/lib/validate.ts`
- Create: `functions/test/validate-talks-booths.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// functions/test/validate-talks-booths.test.ts
import { describe, it, expect } from 'vitest';
import {
  validateTalkProposalInput,
  validateBoothInput,
  validateBoothWallMessageInput,
} from '../src/lib/validate.js';

describe('validateTalkProposalInput', () => {
  const validTalk = {
    title: 'Why AI Agents Will Change Startups',
    topic: 'The agentic revolution in startup ecosystems',
    description: 'A deep dive into how AI co-founders are reshaping early-stage companies.',
    format: 'keynote',
    tags: ['ai', 'startups', 'agents'],
  };

  it('accepts valid talk proposal input', () => {
    const result = validateTalkProposalInput(validTalk);
    expect(result.valid).toBe(true);
    expect(Object.keys(result.errors)).toHaveLength(0);
  });

  it('rejects missing title', () => {
    const result = validateTalkProposalInput({ ...validTalk, title: '' });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('title');
  });

  it('rejects title exceeding 100 chars', () => {
    const result = validateTalkProposalInput({ ...validTalk, title: 'x'.repeat(101) });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('title');
  });

  it('rejects topic exceeding 200 chars', () => {
    const result = validateTalkProposalInput({ ...validTalk, topic: 'x'.repeat(201) });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('topic');
  });

  it('rejects description exceeding 1000 chars', () => {
    const result = validateTalkProposalInput({ ...validTalk, description: 'x'.repeat(1001) });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('description');
  });

  it('rejects missing format', () => {
    const result = validateTalkProposalInput({ ...validTalk, format: '' });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('format');
  });

  it('rejects more than 5 tags', () => {
    const result = validateTalkProposalInput({ ...validTalk, tags: ['a', 'b', 'c', 'd', 'e', 'f'] });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('tags');
  });

  it('allows empty tags array', () => {
    const result = validateTalkProposalInput({ ...validTalk, tags: [] });
    expect(result.valid).toBe(true);
  });

  it('allows missing optional fields (topic, description, tags)', () => {
    const result = validateTalkProposalInput({ title: 'My Talk', format: 'keynote' });
    expect(result.valid).toBe(true);
  });
});

describe('validateBoothInput', () => {
  const validBooth = {
    company_name: 'Acme Corp',
    tagline: 'Building the future',
    product_description: 'We build AI-powered tools for startups.',
    pricing: 'Free tier + $99/mo pro',
    founding_team: 'Jane (CEO), John (CTO)',
    looking_for: ['customers', 'partners'],
    urls: [
      { label: 'Website', url: 'https://acme.com' },
      { label: 'GitHub', url: 'https://github.com/acme' },
    ],
  };

  it('accepts valid booth input', () => {
    const result = validateBoothInput(validBooth);
    expect(result.valid).toBe(true);
    expect(Object.keys(result.errors)).toHaveLength(0);
  });

  it('rejects missing company_name', () => {
    const result = validateBoothInput({ ...validBooth, company_name: '' });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('company_name');
  });

  it('rejects tagline exceeding 100 chars', () => {
    const result = validateBoothInput({ ...validBooth, tagline: 'x'.repeat(101) });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('tagline');
  });

  it('rejects product_description exceeding 2000 chars', () => {
    const result = validateBoothInput({ ...validBooth, product_description: 'x'.repeat(2001) });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('product_description');
  });

  it('rejects pricing exceeding 500 chars', () => {
    const result = validateBoothInput({ ...validBooth, pricing: 'x'.repeat(501) });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('pricing');
  });

  it('rejects founding_team exceeding 1000 chars', () => {
    const result = validateBoothInput({ ...validBooth, founding_team: 'x'.repeat(1001) });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('founding_team');
  });

  it('rejects invalid looking_for values', () => {
    const result = validateBoothInput({ ...validBooth, looking_for: ['not_valid'] });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('looking_for');
  });

  it('rejects urls entries missing label or url', () => {
    const result = validateBoothInput({ ...validBooth, urls: [{ label: '', url: 'https://x.com' }] });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('urls');
  });

  it('rejects urls entries with invalid url format', () => {
    const result = validateBoothInput({ ...validBooth, urls: [{ label: 'Site', url: 'not-a-url' }] });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('urls');
  });

  it('allows optional fields to be omitted', () => {
    const result = validateBoothInput({
      company_name: 'Acme',
      product_description: 'We build things.',
    });
    expect(result.valid).toBe(true);
  });
});

describe('validateBoothWallMessageInput', () => {
  it('accepts valid message', () => {
    const result = validateBoothWallMessageInput({ content: 'Great booth! Love the product.' });
    expect(result.valid).toBe(true);
  });

  it('rejects empty content', () => {
    const result = validateBoothWallMessageInput({ content: '' });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('content');
  });

  it('rejects missing content', () => {
    const result = validateBoothWallMessageInput({});
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('content');
  });

  it('rejects content exceeding 500 chars', () => {
    const result = validateBoothWallMessageInput({ content: 'x'.repeat(501) });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('content');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent/functions"
npx vitest run test/validate-talks-booths.test.ts
```

Expected: FAIL -- `validateTalkProposalInput`, `validateBoothInput`, `validateBoothWallMessageInput` not found.

- [ ] **Step 3: Add validation functions to validate.ts**

Append the following to the end of `functions/src/lib/validate.ts`:

```ts
// --- Plan 2: Talk Proposal validation ---

export function validateTalkProposalInput(input: any): ValidationResult {
  const errors: Record<string, string> = {};

  if (!input.title || typeof input.title !== 'string' || input.title.trim().length === 0) {
    errors.title = 'Title is required';
  } else if (input.title.length > 100) {
    errors.title = 'Title must be 100 chars or less';
  }

  if (input.topic !== undefined && input.topic !== null) {
    if (typeof input.topic !== 'string') {
      errors.topic = 'Topic must be a string';
    } else if (input.topic.length > 200) {
      errors.topic = 'Topic must be 200 chars or less';
    }
  }

  if (input.description !== undefined && input.description !== null) {
    if (typeof input.description !== 'string') {
      errors.description = 'Description must be a string';
    } else if (input.description.length > 1000) {
      errors.description = 'Description must be 1000 chars or less';
    }
  }

  if (!input.format || typeof input.format !== 'string' || input.format.trim().length === 0) {
    errors.format = 'Format is required (e.g. keynote, deep dive, provocative rant, storytelling)';
  }

  if (input.tags !== undefined && input.tags !== null) {
    if (!Array.isArray(input.tags)) {
      errors.tags = 'Tags must be an array';
    } else if (input.tags.length > 5) {
      errors.tags = 'Maximum 5 tags allowed';
    } else {
      const invalidTags = input.tags.filter((t: any) => typeof t !== 'string' || t.trim().length === 0);
      if (invalidTags.length > 0) {
        errors.tags = 'All tags must be non-empty strings';
      }
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

// --- Plan 2: Booth validation ---

export function validateBoothInput(input: any): ValidationResult {
  const errors: Record<string, string> = {};

  if (!input.company_name || typeof input.company_name !== 'string' || input.company_name.trim().length === 0) {
    errors.company_name = 'Company name is required';
  }

  if (input.tagline !== undefined && input.tagline !== null) {
    if (typeof input.tagline !== 'string') {
      errors.tagline = 'Tagline must be a string';
    } else if (input.tagline.length > 100) {
      errors.tagline = 'Tagline must be 100 chars or less';
    }
  }

  if (input.product_description !== undefined && input.product_description !== null) {
    if (typeof input.product_description !== 'string') {
      errors.product_description = 'Product description must be a string';
    } else if (input.product_description.length > 2000) {
      errors.product_description = 'Product description must be 2000 chars or less';
    }
  }

  if (input.pricing !== undefined && input.pricing !== null) {
    if (typeof input.pricing !== 'string') {
      errors.pricing = 'Pricing must be a string';
    } else if (input.pricing.length > 500) {
      errors.pricing = 'Pricing must be 500 chars or less';
    }
  }

  if (input.founding_team !== undefined && input.founding_team !== null) {
    if (typeof input.founding_team !== 'string') {
      errors.founding_team = 'Founding team must be a string';
    } else if (input.founding_team.length > 1000) {
      errors.founding_team = 'Founding team must be 1000 chars or less';
    }
  }

  if (input.looking_for !== undefined && input.looking_for !== null) {
    if (!Array.isArray(input.looking_for)) {
      errors.looking_for = 'looking_for must be an array';
    } else {
      const invalid = input.looking_for.filter((v: string) => !isValidLookingFor(v));
      if (invalid.length > 0) {
        errors.looking_for = `Invalid looking_for values: ${invalid.join(', ')}`;
      }
    }
  }

  if (input.urls !== undefined && input.urls !== null) {
    if (!Array.isArray(input.urls)) {
      errors.urls = 'URLs must be an array of {label, url} objects';
    } else {
      for (let i = 0; i < input.urls.length; i++) {
        const entry = input.urls[i];
        if (!entry.label || typeof entry.label !== 'string' || entry.label.trim().length === 0) {
          errors.urls = `URL entry at index ${i} is missing a label`;
          break;
        }
        if (!entry.url || typeof entry.url !== 'string' || !isValidUrl(entry.url)) {
          errors.urls = `URL entry at index ${i} has an invalid URL`;
          break;
        }
      }
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

// --- Plan 2: Booth wall message validation ---

export function validateBoothWallMessageInput(input: any): ValidationResult {
  const errors: Record<string, string> = {};

  if (!input.content || typeof input.content !== 'string' || input.content.trim().length === 0) {
    errors.content = 'Message content is required';
  } else if (input.content.length > 500) {
    errors.content = 'Message content must be 500 chars or less';
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

// --- URL validation helper ---

function isValidUrl(str: string): boolean {
  try {
    const url = new URL(str);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent/functions"
npx vitest run test/validate-talks-booths.test.ts
```

Expected: All 21 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent"
git add functions/src/lib/validate.ts functions/test/validate-talks-booths.test.ts
git commit -m "feat: validation for talk proposals, booths, and booth wall messages"
```

---

## Chunk 2: Talk Proposal Endpoints

### Task 3: Write talk proposal endpoint (create)

**Files:**
- Create: `functions/src/api/talks.ts`
- Create: `functions/test/talks.test.ts`

- [ ] **Step 1: Write the failing test for POST /api/talks (create)**

```ts
// functions/test/talks.test.ts
import { describe, it, expect, vi } from 'vitest';
import { handleCreateTalk, handleUpdateTalk } from '../src/api/talks.js';
import { createMockResponse } from './helpers/firebase-mock.js';

describe('POST /api/talks (create)', () => {
  it('rejects invalid talk proposal input', async () => {
    const db = { collection: vi.fn() } as any;
    const req = {
      agent: { id: 'agent-1' },
      body: { title: '', format: '' },
    } as any;
    const res = createMockResponse();

    await handleCreateTalk(db)(req, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('validation_error');
    expect(res.body.details).toHaveProperty('title');
    expect(res.body.details).toHaveProperty('format');
  });

  it('rejects agent that already has a talk proposal', async () => {
    const db = {
      collection: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => ({
            get: vi.fn(async () => ({
              empty: false,
              docs: [{ id: 'existing-talk', data: () => ({ id: 'existing-talk' }) }],
            })),
          })),
        })),
        doc: vi.fn(),
      })),
    } as any;

    const req = {
      agent: { id: 'agent-1' },
      body: {
        title: 'My Talk',
        format: 'keynote',
        topic: 'AI',
        description: 'About AI',
        tags: ['ai'],
      },
    } as any;
    const res = createMockResponse();

    await handleCreateTalk(db)(req, res as any);

    expect(res.statusCode).toBe(409);
    expect(res.body.error).toBe('already_exists');
  });

  it('creates a talk proposal with valid input', async () => {
    let savedId = '';
    let savedData: any = null;

    const mockDoc = vi.fn((id: string) => ({
      set: vi.fn(async (data: any) => {
        savedId = id;
        savedData = data;
      }),
      get: vi.fn(async () => ({ exists: false })),
    }));

    const db = {
      collection: vi.fn((name: string) => {
        if (name === 'talks') {
          return {
            where: vi.fn(() => ({
              limit: vi.fn(() => ({
                get: vi.fn(async () => ({
                  empty: true,
                  docs: [],
                })),
              })),
            })),
            doc: mockDoc,
          };
        }
        return { doc: vi.fn() };
      }),
    } as any;

    const req = {
      agent: { id: 'agent-1' },
      body: {
        title: 'Why AI Agents Will Change Startups',
        topic: 'The agentic revolution',
        description: 'A deep dive into AI co-founders.',
        format: 'keynote',
        tags: ['ai', 'startups'],
      },
    } as any;
    const res = createMockResponse();

    await handleCreateTalk(db)(req, res as any);

    expect(res.statusCode).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.status).toBe('submitted');
    expect(savedData).toBeDefined();
    expect(savedData.agent_id).toBe('agent-1');
    expect(savedData.title).toBe('Why AI Agents Will Change Startups');
    expect(savedData.status).toBe('submitted');
    expect(savedData.vote_count).toBe(0);
    expect(savedData.avg_score).toBe(0);
  });
});

describe('POST /api/talks/:id (update)', () => {
  it('rejects update to a talk the agent does not own', async () => {
    const db = {
      collection: vi.fn(() => ({
        doc: vi.fn(() => ({
          get: vi.fn(async () => ({
            exists: true,
            data: () => ({ agent_id: 'other-agent', status: 'submitted' }),
          })),
        })),
      })),
    } as any;

    const req = {
      agent: { id: 'agent-1' },
      params: { id: 'talk-123' },
      body: { title: 'Updated Title' },
    } as any;
    const res = createMockResponse();

    await handleUpdateTalk(db)(req, res as any);

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('unauthorized');
  });

  it('rejects update to a talk that does not exist', async () => {
    const db = {
      collection: vi.fn(() => ({
        doc: vi.fn(() => ({
          get: vi.fn(async () => ({
            exists: false,
          })),
        })),
      })),
    } as any;

    const req = {
      agent: { id: 'agent-1' },
      params: { id: 'nonexistent' },
      body: { title: 'Updated Title' },
    } as any;
    const res = createMockResponse();

    await handleUpdateTalk(db)(req, res as any);

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('not_found');
  });

  it('updates an existing talk proposal owned by the agent', async () => {
    const updateFn = vi.fn();
    const db = {
      collection: vi.fn(() => ({
        doc: vi.fn(() => ({
          get: vi.fn(async () => ({
            exists: true,
            data: () => ({
              agent_id: 'agent-1',
              title: 'Original Title',
              topic: 'Original Topic',
              description: 'Original description',
              format: 'keynote',
              tags: ['ai'],
              status: 'submitted',
            }),
          })),
          update: updateFn,
        })),
      })),
    } as any;

    const req = {
      agent: { id: 'agent-1' },
      params: { id: 'talk-123' },
      body: {
        title: 'Updated Title',
        format: 'deep dive',
      },
    } as any;
    const res = createMockResponse();

    await handleUpdateTalk(db)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('updated');
    expect(updateFn).toHaveBeenCalled();
    const updatedFields = updateFn.mock.calls[0][0];
    expect(updatedFields.title).toBe('Updated Title');
    expect(updatedFields.format).toBe('deep dive');
  });

  it('rejects update with invalid fields', async () => {
    const db = {
      collection: vi.fn(() => ({
        doc: vi.fn(() => ({
          get: vi.fn(async () => ({
            exists: true,
            data: () => ({
              agent_id: 'agent-1',
              title: 'Original Title',
              format: 'keynote',
              status: 'submitted',
            }),
          })),
        })),
      })),
    } as any;

    const req = {
      agent: { id: 'agent-1' },
      params: { id: 'talk-123' },
      body: {
        title: 'x'.repeat(101),  // Too long
        format: 'keynote',
      },
    } as any;
    const res = createMockResponse();

    await handleUpdateTalk(db)(req, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent/functions"
npx vitest run test/talks.test.ts
```

Expected: FAIL -- module `../src/api/talks.js` not found.

- [ ] **Step 3: Write the talks handler implementation**

```ts
// functions/src/api/talks.ts
import { Response } from 'express';
import { Firestore, FieldValue } from 'firebase-admin/firestore';
import { randomBytes } from 'crypto';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { validateTalkProposalInput } from '../lib/validate.js';
import { sendError } from '../lib/errors.js';

export function handleCreateTalk(db: Firestore) {
  return async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const agentId = req.agent!.id;
    const { title, topic, description, format, tags } = req.body;

    // Validate input
    const validation = validateTalkProposalInput({ title, topic, description, format, tags });
    if (!validation.valid) {
      sendError(res, 400, 'validation_error', 'Invalid talk proposal data', validation.errors);
      return;
    }

    // Check if agent already has a talk proposal
    const existing = await db.collection('talks')
      .where('agent_id', '==', agentId)
      .limit(1)
      .get();

    if (!existing.empty) {
      sendError(res, 409, 'already_exists', 'You already have a talk proposal. Use POST /api/talks/{id} to update it.', {
        existing_talk_id: existing.docs[0].id,
      });
      return;
    }

    const talkId = randomBytes(12).toString('hex');

    const talkData = {
      id: talkId,
      agent_id: agentId,
      title: title.trim(),
      topic: (topic || '').trim(),
      description: (description || '').trim(),
      format: format.trim(),
      tags: tags || [],
      status: 'submitted' as const,
      vote_count: 0,
      avg_score: 0,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    };

    await db.collection('talks').doc(talkId).set(talkData);

    res.status(201).json({
      id: talkId,
      status: 'submitted',
      message: 'Talk proposal submitted successfully.',
    });
  };
}

export function handleUpdateTalk(db: Firestore) {
  return async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const agentId = req.agent!.id;
    const talkId = req.params.id;

    // Fetch existing talk
    const talkDoc = await db.collection('talks').doc(talkId).get();

    if (!talkDoc.exists) {
      sendError(res, 404, 'not_found', 'Talk proposal not found');
      return;
    }

    const existingTalk = talkDoc.data()!;

    if (existingTalk.agent_id !== agentId) {
      sendError(res, 403, 'unauthorized', 'You can only update your own talk proposals');
      return;
    }

    // Merge provided fields with existing data for validation
    const merged = {
      title: req.body.title ?? existingTalk.title,
      topic: req.body.topic ?? existingTalk.topic,
      description: req.body.description ?? existingTalk.description,
      format: req.body.format ?? existingTalk.format,
      tags: req.body.tags ?? existingTalk.tags,
    };

    const validation = validateTalkProposalInput(merged);
    if (!validation.valid) {
      sendError(res, 400, 'validation_error', 'Invalid talk proposal data', validation.errors);
      return;
    }

    // Build update object with only provided fields
    const updateData: Record<string, any> = {
      updated_at: FieldValue.serverTimestamp(),
    };

    if (req.body.title !== undefined) updateData.title = req.body.title.trim();
    if (req.body.topic !== undefined) updateData.topic = req.body.topic.trim();
    if (req.body.description !== undefined) updateData.description = req.body.description.trim();
    if (req.body.format !== undefined) updateData.format = req.body.format.trim();
    if (req.body.tags !== undefined) updateData.tags = req.body.tags;

    await db.collection('talks').doc(talkId).update(updateData);

    res.status(200).json({
      id: talkId,
      status: 'updated',
      message: 'Talk proposal updated successfully.',
    });
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent/functions"
npx vitest run test/talks.test.ts
```

Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent"
git add functions/src/api/talks.ts functions/test/talks.test.ts
git commit -m "feat: talk proposal create and update endpoints"
```

---

## Chunk 3: Booth CRUD Endpoint

### Task 4: Write booth create/update endpoint

**Files:**
- Create: `functions/src/api/booths.ts`
- Create: `functions/test/booths.test.ts`

- [ ] **Step 1: Write the failing test for POST /api/booths (create/update)**

```ts
// functions/test/booths.test.ts
import { describe, it, expect, vi } from 'vitest';
import { handleCreateOrUpdateBooth } from '../src/api/booths.js';
import { createMockResponse } from './helpers/firebase-mock.js';

describe('POST /api/booths (create)', () => {
  it('rejects invalid booth input', async () => {
    const db = { collection: vi.fn() } as any;
    const req = {
      agent: { id: 'agent-1' },
      body: { company_name: '' },
    } as any;
    const res = createMockResponse();

    await handleCreateOrUpdateBooth(db)(req, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('validation_error');
    expect(res.body.details).toHaveProperty('company_name');
  });

  it('creates a new booth when agent has none', async () => {
    let savedId = '';
    let savedData: any = null;

    const mockDoc = vi.fn((id: string) => ({
      set: vi.fn(async (data: any) => {
        savedId = id;
        savedData = data;
      }),
    }));

    const db = {
      collection: vi.fn((name: string) => {
        if (name === 'booths') {
          return {
            where: vi.fn(() => ({
              limit: vi.fn(() => ({
                get: vi.fn(async () => ({
                  empty: true,
                  docs: [],
                })),
              })),
            })),
            doc: mockDoc,
          };
        }
        return { doc: vi.fn() };
      }),
    } as any;

    const req = {
      agent: { id: 'agent-1' },
      body: {
        company_name: 'Acme Corp',
        tagline: 'Building the future',
        product_description: 'AI tools for startups.',
        pricing: 'Free + $99/mo',
        founding_team: 'Jane (CEO)',
        looking_for: ['customers'],
        urls: [{ label: 'Website', url: 'https://acme.com' }],
      },
    } as any;
    const res = createMockResponse();

    await handleCreateOrUpdateBooth(db)(req, res as any);

    expect(res.statusCode).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(savedData).toBeDefined();
    expect(savedData.agent_id).toBe('agent-1');
    expect(savedData.company_name).toBe('Acme Corp');
  });

  it('updates existing booth when agent already has one', async () => {
    const updateFn = vi.fn();
    const existingBoothData = {
      id: 'booth-existing',
      agent_id: 'agent-1',
      company_name: 'Old Name',
      tagline: 'Old tagline',
      product_description: 'Old description',
    };

    const db = {
      collection: vi.fn((name: string) => {
        if (name === 'booths') {
          return {
            where: vi.fn(() => ({
              limit: vi.fn(() => ({
                get: vi.fn(async () => ({
                  empty: false,
                  docs: [{
                    id: 'booth-existing',
                    data: () => existingBoothData,
                    ref: { update: updateFn },
                  }],
                })),
              })),
            })),
            doc: vi.fn(),
          };
        }
        return { doc: vi.fn() };
      }),
    } as any;

    const req = {
      agent: { id: 'agent-1' },
      body: {
        company_name: 'Acme Corp Updated',
        tagline: 'New tagline',
        product_description: 'Updated description.',
      },
    } as any;
    const res = createMockResponse();

    await handleCreateOrUpdateBooth(db)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.id).toBe('booth-existing');
    expect(res.body.status).toBe('updated');
    expect(updateFn).toHaveBeenCalled();
    const updatedFields = updateFn.mock.calls[0][0];
    expect(updatedFields.company_name).toBe('Acme Corp Updated');
    expect(updatedFields.tagline).toBe('New tagline');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent/functions"
npx vitest run test/booths.test.ts
```

Expected: FAIL -- module `../src/api/booths.js` not found.

- [ ] **Step 3: Write the booths handler implementation**

```ts
// functions/src/api/booths.ts
import { Response } from 'express';
import { Firestore, FieldValue } from 'firebase-admin/firestore';
import { randomBytes } from 'crypto';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { validateBoothInput, validateBoothWallMessageInput } from '../lib/validate.js';
import { sendError } from '../lib/errors.js';

export function handleCreateOrUpdateBooth(db: Firestore) {
  return async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const agentId = req.agent!.id;

    // Validate input
    const validation = validateBoothInput(req.body);
    if (!validation.valid) {
      sendError(res, 400, 'validation_error', 'Invalid booth data', validation.errors);
      return;
    }

    const {
      company_name, tagline, logo_url, urls,
      product_description, pricing, founding_team,
      looking_for, demo_video_url,
    } = req.body;

    // Check if agent already has a booth
    const existing = await db.collection('booths')
      .where('agent_id', '==', agentId)
      .limit(1)
      .get();

    if (!existing.empty) {
      // Update existing booth
      const existingDoc = existing.docs[0];
      const updateData: Record<string, any> = {
        updated_at: FieldValue.serverTimestamp(),
      };

      if (company_name !== undefined) updateData.company_name = company_name.trim();
      if (tagline !== undefined) updateData.tagline = (tagline || '').trim();
      if (logo_url !== undefined) updateData.logo_url = logo_url || '';
      if (urls !== undefined) updateData.urls = urls || [];
      if (product_description !== undefined) updateData.product_description = (product_description || '').trim();
      if (pricing !== undefined) updateData.pricing = (pricing || '').trim();
      if (founding_team !== undefined) updateData.founding_team = (founding_team || '').trim();
      if (looking_for !== undefined) updateData.looking_for = looking_for || [];
      if (demo_video_url !== undefined) updateData.demo_video_url = demo_video_url || '';

      await existingDoc.ref.update(updateData);

      res.status(200).json({
        id: existingDoc.id,
        status: 'updated',
        message: 'Booth updated successfully.',
      });
      return;
    }

    // Create new booth
    const boothId = randomBytes(12).toString('hex');

    const boothData = {
      id: boothId,
      agent_id: agentId,
      company_name: company_name.trim(),
      tagline: (tagline || '').trim(),
      logo_url: logo_url || '',
      urls: urls || [],
      product_description: (product_description || '').trim(),
      pricing: (pricing || '').trim(),
      founding_team: (founding_team || '').trim(),
      looking_for: looking_for || [],
      demo_video_url: demo_video_url || '',
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    };

    await db.collection('booths').doc(boothId).set(boothData);

    res.status(201).json({
      id: boothId,
      status: 'created',
      message: 'Booth created successfully.',
    });
  };
}

export function handlePostBoothWallMessage(db: Firestore, getBoothWallMaxPerDay: () => Promise<number>) {
  return async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const agentId = req.agent!.id;
    const boothId = req.params.id;

    // Validate message content
    const validation = validateBoothWallMessageInput(req.body);
    if (!validation.valid) {
      sendError(res, 400, 'validation_error', 'Invalid message', validation.errors);
      return;
    }

    // Verify booth exists
    const boothDoc = await db.collection('booths').doc(boothId).get();
    if (!boothDoc.exists) {
      sendError(res, 404, 'not_found', 'Booth not found');
      return;
    }

    const booth = boothDoc.data()!;

    // Prevent booth owner from posting on their own wall
    if (booth.agent_id === agentId) {
      sendError(res, 400, 'validation_error', 'You cannot post on your own booth wall');
      return;
    }

    // Rate limit: max N messages per visitor per booth per day
    const maxPerDay = await getBoothWallMaxPerDay();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayMessages = await db.collection('booth_wall_messages')
      .where('booth_id', '==', boothId)
      .where('author_agent_id', '==', agentId)
      .where('posted_at', '>=', todayStart)
      .get();

    if (todayMessages.size >= maxPerDay) {
      sendError(res, 429, 'rate_limited',
        `You can only leave ${maxPerDay} messages per booth per day. Try again tomorrow.`);
      return;
    }

    const messageId = randomBytes(12).toString('hex');

    const messageData = {
      id: messageId,
      booth_id: boothId,
      author_agent_id: agentId,
      content: req.body.content.trim(),
      posted_at: FieldValue.serverTimestamp(),
      deleted: false,
    };

    await db.collection('booth_wall_messages').doc(messageId).set(messageData);

    res.status(201).json({
      id: messageId,
      status: 'posted',
      message: 'Message posted to booth wall.',
    });
  };
}

export function handleGetBoothWall(db: Firestore) {
  return async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const agentId = req.agent!.id;
    const boothId = req.params.id;

    // Verify booth exists
    const boothDoc = await db.collection('booths').doc(boothId).get();
    if (!boothDoc.exists) {
      sendError(res, 404, 'not_found', 'Booth not found');
      return;
    }

    const booth = boothDoc.data()!;

    // Only the booth owner can read wall messages
    if (booth.agent_id !== agentId) {
      sendError(res, 403, 'unauthorized', 'Only the booth owner can read wall messages');
      return;
    }

    // Fetch non-deleted messages, ordered by posted_at descending
    const messagesSnapshot = await db.collection('booth_wall_messages')
      .where('booth_id', '==', boothId)
      .where('deleted', '==', false)
      .orderBy('posted_at', 'desc')
      .get();

    const messages = messagesSnapshot.docs.map((doc: any) => {
      const data = doc.data();
      return {
        id: data.id,
        booth_id: data.booth_id,
        author_agent_id: data.author_agent_id,
        content: data.content,
        posted_at: data.posted_at,
      };
    });

    res.status(200).json({ booth_id: boothId, messages });
  };
}

export function handleDeleteBoothWallMessage(db: Firestore) {
  return async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const agentId = req.agent!.id;
    const boothId = req.params.id;
    const messageId = req.params.messageId;

    // Fetch the message
    const messageDoc = await db.collection('booth_wall_messages').doc(messageId).get();
    if (!messageDoc.exists) {
      sendError(res, 404, 'not_found', 'Message not found');
      return;
    }

    const message = messageDoc.data()!;

    // Verify the message belongs to the specified booth
    if (message.booth_id !== boothId) {
      sendError(res, 404, 'not_found', 'Message not found on this booth wall');
      return;
    }

    // Check authorization: author can delete own message, booth owner can delete any
    const boothDoc = await db.collection('booths').doc(boothId).get();
    if (!boothDoc.exists) {
      sendError(res, 404, 'not_found', 'Booth not found');
      return;
    }

    const booth = boothDoc.data()!;
    const isAuthor = message.author_agent_id === agentId;
    const isBoothOwner = booth.agent_id === agentId;

    if (!isAuthor && !isBoothOwner) {
      sendError(res, 403, 'unauthorized', 'Only the message author or booth owner can delete messages');
      return;
    }

    // Soft-delete: mark as deleted but retain for moderation
    await db.collection('booth_wall_messages').doc(messageId).update({
      deleted: true,
      deleted_at: FieldValue.serverTimestamp(),
      deleted_by: agentId,
    });

    res.status(200).json({
      id: messageId,
      status: 'deleted',
      message: 'Message deleted.',
    });
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent/functions"
npx vitest run test/booths.test.ts
```

Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent"
git add functions/src/api/booths.ts functions/test/booths.test.ts
git commit -m "feat: booth create/update endpoint and booth wall handlers"
```

---

## Chunk 4: Booth Wall Endpoints

### Task 5: Write booth wall message tests

**Files:**
- Create: `functions/test/booth-wall.test.ts`

- [ ] **Step 1: Write the failing test for POST /api/booths/:id/wall**

```ts
// functions/test/booth-wall.test.ts
import { describe, it, expect, vi } from 'vitest';
import { handlePostBoothWallMessage, handleGetBoothWall, handleDeleteBoothWallMessage } from '../src/api/booths.js';
import { createMockResponse } from './helpers/firebase-mock.js';

describe('POST /api/booths/:id/wall (post message)', () => {
  it('rejects empty message content', async () => {
    const db = {
      collection: vi.fn(() => ({
        doc: vi.fn(() => ({
          get: vi.fn(async () => ({ exists: true, data: () => ({ agent_id: 'owner-agent' }) })),
        })),
      })),
    } as any;

    const req = {
      agent: { id: 'visitor-agent' },
      params: { id: 'booth-1' },
      body: { content: '' },
    } as any;
    const res = createMockResponse();

    await handlePostBoothWallMessage(db, async () => 10)(req, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });

  it('rejects message to a nonexistent booth', async () => {
    const db = {
      collection: vi.fn(() => ({
        doc: vi.fn(() => ({
          get: vi.fn(async () => ({ exists: false })),
        })),
      })),
    } as any;

    const req = {
      agent: { id: 'visitor-agent' },
      params: { id: 'nonexistent-booth' },
      body: { content: 'Hello!' },
    } as any;
    const res = createMockResponse();

    await handlePostBoothWallMessage(db, async () => 10)(req, res as any);

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('not_found');
  });

  it('prevents booth owner from posting on own wall', async () => {
    const db = {
      collection: vi.fn(() => ({
        doc: vi.fn(() => ({
          get: vi.fn(async () => ({
            exists: true,
            data: () => ({ agent_id: 'agent-1' }),
          })),
        })),
      })),
    } as any;

    const req = {
      agent: { id: 'agent-1' },
      params: { id: 'booth-1' },
      body: { content: 'My own wall' },
    } as any;
    const res = createMockResponse();

    await handlePostBoothWallMessage(db, async () => 10)(req, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });

  it('enforces daily rate limit per visitor per booth', async () => {
    let collectionName = '';
    const db = {
      collection: vi.fn((name: string) => {
        collectionName = name;
        if (name === 'booths') {
          return {
            doc: vi.fn(() => ({
              get: vi.fn(async () => ({
                exists: true,
                data: () => ({ agent_id: 'owner-agent' }),
              })),
            })),
          };
        }
        // booth_wall_messages collection
        return {
          where: vi.fn(() => ({
            where: vi.fn(() => ({
              where: vi.fn(() => ({
                get: vi.fn(async () => ({
                  size: 10,  // Already at limit
                })),
              })),
            })),
          })),
          doc: vi.fn(() => ({
            set: vi.fn(),
          })),
        };
      }),
    } as any;

    const req = {
      agent: { id: 'visitor-agent' },
      params: { id: 'booth-1' },
      body: { content: 'One more message' },
    } as any;
    const res = createMockResponse();

    await handlePostBoothWallMessage(db, async () => 10)(req, res as any);

    expect(res.statusCode).toBe(429);
    expect(res.body.error).toBe('rate_limited');
  });

  it('posts a message successfully when under rate limit', async () => {
    let savedData: any = null;

    const db = {
      collection: vi.fn((name: string) => {
        if (name === 'booths') {
          return {
            doc: vi.fn(() => ({
              get: vi.fn(async () => ({
                exists: true,
                data: () => ({ agent_id: 'owner-agent' }),
              })),
            })),
          };
        }
        // booth_wall_messages
        return {
          where: vi.fn(() => ({
            where: vi.fn(() => ({
              where: vi.fn(() => ({
                get: vi.fn(async () => ({
                  size: 3,  // Under limit
                })),
              })),
            })),
          })),
          doc: vi.fn(() => ({
            set: vi.fn(async (data: any) => { savedData = data; }),
          })),
        };
      }),
    } as any;

    const req = {
      agent: { id: 'visitor-agent' },
      params: { id: 'booth-1' },
      body: { content: 'Great product! Would love to learn more.' },
    } as any;
    const res = createMockResponse();

    await handlePostBoothWallMessage(db, async () => 10)(req, res as any);

    expect(res.statusCode).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.status).toBe('posted');
    expect(savedData).toBeDefined();
    expect(savedData.booth_id).toBe('booth-1');
    expect(savedData.author_agent_id).toBe('visitor-agent');
    expect(savedData.content).toBe('Great product! Would love to learn more.');
    expect(savedData.deleted).toBe(false);
  });
});

describe('GET /api/booths/:id/wall (read messages)', () => {
  it('rejects non-owner from reading wall messages', async () => {
    const db = {
      collection: vi.fn(() => ({
        doc: vi.fn(() => ({
          get: vi.fn(async () => ({
            exists: true,
            data: () => ({ agent_id: 'owner-agent' }),
          })),
        })),
      })),
    } as any;

    const req = {
      agent: { id: 'visitor-agent' },
      params: { id: 'booth-1' },
    } as any;
    const res = createMockResponse();

    await handleGetBoothWall(db)(req, res as any);

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('unauthorized');
  });

  it('returns empty array when no messages', async () => {
    const db = {
      collection: vi.fn((name: string) => {
        if (name === 'booths') {
          return {
            doc: vi.fn(() => ({
              get: vi.fn(async () => ({
                exists: true,
                data: () => ({ agent_id: 'owner-agent' }),
              })),
            })),
          };
        }
        // booth_wall_messages
        return {
          where: vi.fn(() => ({
            where: vi.fn(() => ({
              orderBy: vi.fn(() => ({
                get: vi.fn(async () => ({
                  docs: [],
                })),
              })),
            })),
          })),
        };
      }),
    } as any;

    const req = {
      agent: { id: 'owner-agent' },
      params: { id: 'booth-1' },
    } as any;
    const res = createMockResponse();

    await handleGetBoothWall(db)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.booth_id).toBe('booth-1');
    expect(res.body.messages).toEqual([]);
  });

  it('returns non-deleted messages for the booth owner', async () => {
    const mockMessages = [
      {
        data: () => ({
          id: 'msg-1',
          booth_id: 'booth-1',
          author_agent_id: 'visitor-1',
          content: 'Great booth!',
          posted_at: '2026-05-15T10:00:00Z',
        }),
      },
      {
        data: () => ({
          id: 'msg-2',
          booth_id: 'booth-1',
          author_agent_id: 'visitor-2',
          content: 'Interested in your product.',
          posted_at: '2026-05-15T11:00:00Z',
        }),
      },
    ];

    const db = {
      collection: vi.fn((name: string) => {
        if (name === 'booths') {
          return {
            doc: vi.fn(() => ({
              get: vi.fn(async () => ({
                exists: true,
                data: () => ({ agent_id: 'owner-agent' }),
              })),
            })),
          };
        }
        return {
          where: vi.fn(() => ({
            where: vi.fn(() => ({
              orderBy: vi.fn(() => ({
                get: vi.fn(async () => ({
                  docs: mockMessages,
                })),
              })),
            })),
          })),
        };
      }),
    } as any;

    const req = {
      agent: { id: 'owner-agent' },
      params: { id: 'booth-1' },
    } as any;
    const res = createMockResponse();

    await handleGetBoothWall(db)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.messages).toHaveLength(2);
    expect(res.body.messages[0].content).toBe('Great booth!');
    expect(res.body.messages[1].content).toBe('Interested in your product.');
  });
});

describe('DELETE /api/booths/:id/wall/:messageId (soft-delete)', () => {
  it('allows message author to soft-delete their own message', async () => {
    const updateFn = vi.fn();

    const db = {
      collection: vi.fn((name: string) => {
        if (name === 'booth_wall_messages') {
          return {
            doc: vi.fn(() => ({
              get: vi.fn(async () => ({
                exists: true,
                data: () => ({
                  id: 'msg-1',
                  booth_id: 'booth-1',
                  author_agent_id: 'visitor-agent',
                  content: 'My message',
                  deleted: false,
                }),
              })),
              update: updateFn,
            })),
          };
        }
        // booths collection
        return {
          doc: vi.fn(() => ({
            get: vi.fn(async () => ({
              exists: true,
              data: () => ({ agent_id: 'owner-agent' }),
            })),
          })),
        };
      }),
    } as any;

    const req = {
      agent: { id: 'visitor-agent' },
      params: { id: 'booth-1', messageId: 'msg-1' },
    } as any;
    const res = createMockResponse();

    await handleDeleteBoothWallMessage(db)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('deleted');
    expect(updateFn).toHaveBeenCalled();
    const updateArgs = updateFn.mock.calls[0][0];
    expect(updateArgs.deleted).toBe(true);
    expect(updateArgs.deleted_by).toBe('visitor-agent');
  });

  it('allows booth owner to soft-delete any message on their wall', async () => {
    const updateFn = vi.fn();

    const db = {
      collection: vi.fn((name: string) => {
        if (name === 'booth_wall_messages') {
          return {
            doc: vi.fn(() => ({
              get: vi.fn(async () => ({
                exists: true,
                data: () => ({
                  id: 'msg-1',
                  booth_id: 'booth-1',
                  author_agent_id: 'visitor-agent',
                  content: 'Their message',
                  deleted: false,
                }),
              })),
              update: updateFn,
            })),
          };
        }
        return {
          doc: vi.fn(() => ({
            get: vi.fn(async () => ({
              exists: true,
              data: () => ({ agent_id: 'owner-agent' }),
            })),
          })),
        };
      }),
    } as any;

    const req = {
      agent: { id: 'owner-agent' },
      params: { id: 'booth-1', messageId: 'msg-1' },
    } as any;
    const res = createMockResponse();

    await handleDeleteBoothWallMessage(db)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('deleted');
    expect(updateFn).toHaveBeenCalled();
    const updateArgs = updateFn.mock.calls[0][0];
    expect(updateArgs.deleted).toBe(true);
    expect(updateArgs.deleted_by).toBe('owner-agent');
  });

  it('rejects deletion by an unauthorized agent', async () => {
    const db = {
      collection: vi.fn((name: string) => {
        if (name === 'booth_wall_messages') {
          return {
            doc: vi.fn(() => ({
              get: vi.fn(async () => ({
                exists: true,
                data: () => ({
                  id: 'msg-1',
                  booth_id: 'booth-1',
                  author_agent_id: 'visitor-agent',
                  content: 'Their message',
                  deleted: false,
                }),
              })),
            })),
          };
        }
        return {
          doc: vi.fn(() => ({
            get: vi.fn(async () => ({
              exists: true,
              data: () => ({ agent_id: 'owner-agent' }),
            })),
          })),
        };
      }),
    } as any;

    const req = {
      agent: { id: 'random-agent' },
      params: { id: 'booth-1', messageId: 'msg-1' },
    } as any;
    const res = createMockResponse();

    await handleDeleteBoothWallMessage(db)(req, res as any);

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('unauthorized');
  });

  it('rejects deletion of a nonexistent message', async () => {
    const db = {
      collection: vi.fn((name: string) => {
        if (name === 'booth_wall_messages') {
          return {
            doc: vi.fn(() => ({
              get: vi.fn(async () => ({ exists: false })),
            })),
          };
        }
        return { doc: vi.fn() };
      }),
    } as any;

    const req = {
      agent: { id: 'visitor-agent' },
      params: { id: 'booth-1', messageId: 'nonexistent' },
    } as any;
    const res = createMockResponse();

    await handleDeleteBoothWallMessage(db)(req, res as any);

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('not_found');
  });

  it('rejects deletion of a message from a different booth', async () => {
    const db = {
      collection: vi.fn((name: string) => {
        if (name === 'booth_wall_messages') {
          return {
            doc: vi.fn(() => ({
              get: vi.fn(async () => ({
                exists: true,
                data: () => ({
                  id: 'msg-1',
                  booth_id: 'booth-OTHER',  // Different booth
                  author_agent_id: 'visitor-agent',
                  content: 'Message',
                  deleted: false,
                }),
              })),
            })),
          };
        }
        return { doc: vi.fn() };
      }),
    } as any;

    const req = {
      agent: { id: 'visitor-agent' },
      params: { id: 'booth-1', messageId: 'msg-1' },
    } as any;
    const res = createMockResponse();

    await handleDeleteBoothWallMessage(db)(req, res as any);

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('not_found');
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Since the handler code was already written in Task 4, these tests should pass.

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent/functions"
npx vitest run test/booth-wall.test.ts
```

Expected: All 12 tests PASS.

- [ ] **Step 3: Commit**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent"
git add functions/test/booth-wall.test.ts
git commit -m "test: comprehensive booth wall message tests (post, read, soft-delete)"
```

---

## Chunk 5: Static JSON Generation for Talks & Booths

### Task 6: Add static JSON builders for talks and booths

**Files:**
- Modify: `functions/src/triggers/static-json.ts`
- Create: `functions/test/static-json-talks-booths.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// functions/test/static-json-talks-booths.test.ts
import { describe, it, expect } from 'vitest';
import {
  buildTalkPublicProfile,
  buildTalkIndex,
  buildBoothPublicProfile,
  buildBoothIndex,
} from '../src/triggers/static-json.js';

describe('Static JSON builders: Talks', () => {
  const sampleTalk = {
    id: 'talk-1',
    agent_id: 'agent-1',
    title: 'Why AI Agents Will Change Startups',
    topic: 'The agentic revolution',
    description: 'A deep dive into AI co-founders.',
    format: 'keynote',
    tags: ['ai', 'startups'],
    status: 'submitted',
    vote_count: 42,
    avg_score: 78.5,
    created_at: '2026-05-01T10:00:00Z',
    updated_at: '2026-05-01T10:00:00Z',
  };

  it('includes all public fields in talk profile', () => {
    const pub = buildTalkPublicProfile(sampleTalk);
    expect(pub.id).toBe('talk-1');
    expect(pub.agent_id).toBe('agent-1');
    expect(pub.title).toBe('Why AI Agents Will Change Startups');
    expect(pub.topic).toBe('The agentic revolution');
    expect(pub.description).toBe('A deep dive into AI co-founders.');
    expect(pub.format).toBe('keynote');
    expect(pub.tags).toEqual(['ai', 'startups']);
    expect(pub.status).toBe('submitted');
    expect(pub.vote_count).toBe(42);
    expect(pub.avg_score).toBe(78.5);
  });

  it('builds talk index from multiple proposals', () => {
    const talks = [
      { ...sampleTalk, id: 't1', title: 'Talk One' },
      { ...sampleTalk, id: 't2', title: 'Talk Two' },
    ];
    const index = buildTalkIndex(talks);
    expect(index).toHaveLength(2);
    expect(index[0].id).toBe('t1');
    expect(index[1].id).toBe('t2');
  });
});

describe('Static JSON builders: Booths', () => {
  const sampleBooth = {
    id: 'booth-1',
    agent_id: 'agent-1',
    company_name: 'Acme Corp',
    tagline: 'Building the future',
    logo_url: 'https://acme.com/logo.png',
    urls: [{ label: 'Website', url: 'https://acme.com' }],
    product_description: 'AI tools for startups.',
    pricing: 'Free + $99/mo',
    founding_team: 'Jane (CEO), John (CTO)',
    looking_for: ['customers', 'partners'],
    demo_video_url: 'https://youtube.com/watch?v=demo',
    created_at: '2026-05-01T10:00:00Z',
    updated_at: '2026-05-01T10:00:00Z',
  };

  it('includes all public fields in booth profile', () => {
    const pub = buildBoothPublicProfile(sampleBooth);
    expect(pub.id).toBe('booth-1');
    expect(pub.agent_id).toBe('agent-1');
    expect(pub.company_name).toBe('Acme Corp');
    expect(pub.tagline).toBe('Building the future');
    expect(pub.product_description).toBe('AI tools for startups.');
    expect(pub.urls).toEqual([{ label: 'Website', url: 'https://acme.com' }]);
    expect(pub.looking_for).toEqual(['customers', 'partners']);
  });

  it('builds booth index from multiple booths', () => {
    const booths = [
      { ...sampleBooth, id: 'b1', company_name: 'One' },
      { ...sampleBooth, id: 'b2', company_name: 'Two' },
    ];
    const index = buildBoothIndex(booths);
    expect(index).toHaveLength(2);
    expect(index[0].id).toBe('b1');
    expect(index[1].company_name).toBe('Two');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent/functions"
npx vitest run test/static-json-talks-booths.test.ts
```

Expected: FAIL -- `buildTalkPublicProfile`, `buildTalkIndex`, `buildBoothPublicProfile`, `buildBoothIndex` not found.

- [ ] **Step 3: Add talk and booth builders to static-json.ts**

Append the following to the end of `functions/src/triggers/static-json.ts`:

```ts
// --- Plan 2: Talk static JSON builders ---

export function buildTalkPublicProfile(talk: any): any {
  return {
    id: talk.id,
    agent_id: talk.agent_id,
    title: talk.title,
    topic: talk.topic,
    description: talk.description,
    format: talk.format,
    tags: talk.tags,
    status: talk.status,
    vote_count: talk.vote_count,
    avg_score: talk.avg_score,
  };
}

export function buildTalkIndex(talks: any[]): any[] {
  return talks.map(buildTalkPublicProfile);
}

export const onTalkWrite = onDocumentWritten('talks/{talkId}', async (event) => {
  const db = getFirestore();
  const snapshot = await db.collection('talks').get();

  const talks = snapshot.docs.map(doc => doc.data());
  const publicTalks = buildTalkIndex(talks);

  // Write index + individual files
  await writeStaticJson('talks/index.json', publicTalks);
  for (const talk of publicTalks) {
    await writeStaticJson(`talks/${talk.id}.json`, talk);
  }
});

// --- Plan 2: Booth static JSON builders ---
// Note: Booth wall messages are private — NOT included in static JSON.

export function buildBoothPublicProfile(booth: any): any {
  return {
    id: booth.id,
    agent_id: booth.agent_id,
    company_name: booth.company_name,
    tagline: booth.tagline,
    logo_url: booth.logo_url,
    urls: booth.urls,
    product_description: booth.product_description,
    pricing: booth.pricing,
    founding_team: booth.founding_team,
    looking_for: booth.looking_for,
    demo_video_url: booth.demo_video_url,
  };
}

export function buildBoothIndex(booths: any[]): any[] {
  return booths.map(buildBoothPublicProfile);
}

export const onBoothWrite = onDocumentWritten('booths/{boothId}', async (event) => {
  const db = getFirestore();
  const snapshot = await db.collection('booths').get();

  const booths = snapshot.docs.map(doc => doc.data());
  const publicBooths = buildBoothIndex(booths);

  // Write index + individual files
  await writeStaticJson('booths/index.json', publicBooths);
  for (const booth of publicBooths) {
    await writeStaticJson(`booths/${booth.id}.json`, booth);
  }
});
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent/functions"
npx vitest run test/static-json-talks-booths.test.ts
```

Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent"
git add functions/src/triggers/static-json.ts functions/test/static-json-talks-booths.test.ts
git commit -m "feat: static JSON builders and Firestore triggers for talks and booths"
```

---

## Chunk 6: Wire Routes & Firestore Indexes

### Task 7: Wire new routes into the Express router

**Files:**
- Modify: `functions/src/index.ts`

- [ ] **Step 1: Add imports and route registrations to index.ts**

Add the following imports at the top of `functions/src/index.ts`, alongside the existing imports:

```ts
import { createPhaseGate } from './middleware/phase-gate.js';
import { createIdempotencyMiddleware } from './middleware/idempotency.js';
import { handleCreateTalk, handleUpdateTalk } from './api/talks.js';
import { handleCreateOrUpdateBooth, handlePostBoothWallMessage, handleGetBoothWall, handleDeleteBoothWallMessage } from './api/booths.js';
import { onTalkWrite, onBoothWrite } from './triggers/static-json.js';
```

Add the following route registrations after the existing authenticated endpoints and before the health check:

```ts
// Phase gates — read overrides from Firestore settings
const cfpGate = createPhaseGate('cfp', (key) => {
  // Synchronous wrapper — loads from cache or returns undefined
  // In production, this would read from cached settings
  return undefined; // Falls back to date-based check
});
const boothSetupGate = createPhaseGate('booth_setup', (key) => {
  return undefined;
});

// Idempotency middleware instance
const idempotency = createIdempotencyMiddleware();

// Settings helper for booth wall rate limit
const getBoothWallMaxPerDay = async (): Promise<number> => {
  const settings = await loadSettings(db);
  return settings.booth_wall_max_per_day;
};

// --- Talk proposal endpoints (requires cfp phase) ---
app.post('/api/talks', auth, rateLimiter, cfpGate, idempotency, handleCreateTalk(db));
app.post('/api/talks/:id', auth, rateLimiter, cfpGate, handleUpdateTalk(db));

// --- Booth endpoints (requires booth_setup phase) ---
app.post('/api/booths', auth, rateLimiter, boothSetupGate, idempotency, handleCreateOrUpdateBooth(db));
app.post('/api/booths/:id/wall', auth, rateLimiter, handlePostBoothWallMessage(db, getBoothWallMaxPerDay));
app.get('/api/booths/:id/wall', auth, handleGetBoothWall(db));
app.delete('/api/booths/:id/wall/:messageId', auth, rateLimiter, handleDeleteBoothWallMessage(db));
```

Update the Firestore trigger exports at the bottom of `index.ts`:

```ts
// Firestore triggers for static JSON regeneration
export { onAgentWrite, onTalkWrite, onBoothWrite };
```

- [ ] **Step 2: Verify functions compile**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent/functions"
npm run build
```

Expected: Compiles without errors.

- [ ] **Step 3: Commit**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent"
git add functions/src/index.ts
git commit -m "feat: wire talk, booth, and booth wall routes with phase gates"
```

---

### Task 8: Add Firestore composite indexes

**Files:**
- Modify: `firestore.indexes.json`

- [ ] **Step 1: Add required composite indexes**

Add the following indexes to `firestore.indexes.json`:

```json
{
  "indexes": [
    {
      "collectionGroup": "talks",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "agent_id", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "booths",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "agent_id", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "booth_wall_messages",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "booth_id", "order": "ASCENDING" },
        { "fieldPath": "author_agent_id", "order": "ASCENDING" },
        { "fieldPath": "posted_at", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "booth_wall_messages",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "booth_id", "order": "ASCENDING" },
        { "fieldPath": "deleted", "order": "ASCENDING" },
        { "fieldPath": "posted_at", "order": "DESCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}
```

- [ ] **Step 2: Commit**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent"
git add firestore.indexes.json
git commit -m "feat: Firestore composite indexes for talks, booths, booth wall messages"
```

---

## Chunk 7: Full Test Suite & Final Verification

### Task 9: Run full test suite

- [ ] **Step 1: Run all function tests**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent/functions"
npx vitest run
```

Expected output (approximate):

```
 ✓ test/api-key.test.ts (5 tests)
 ✓ test/validate.test.ts (5 tests)
 ✓ test/validate-talks-booths.test.ts (21 tests)
 ✓ test/register.test.ts (4 tests)
 ✓ test/verify-email.test.ts (3 tests)
 ✓ test/profile.test.ts (3 tests)
 ✓ test/status.test.ts (4 tests)
 ✓ test/static-json.test.ts (2 tests)
 ✓ test/static-json-talks-booths.test.ts (4 tests)
 ✓ test/talks.test.ts (7 tests)
 ✓ test/booths.test.ts (3 tests)
 ✓ test/booth-wall.test.ts (12 tests)
 ✓ test/middleware/auth.test.ts (5 tests)
 ✓ test/middleware/rate-limit.test.ts (3 tests)
 ✓ test/middleware/phase-gate.test.ts (7 tests)
 ✓ test/middleware/idempotency.test.ts (4 tests)

Tests  92 passed
```

All tests PASS.

- [ ] **Step 2: Build functions**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent/functions"
npm run build
```

Expected: No errors.

- [ ] **Step 3: Build frontend**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent"
npm run build
```

Expected: No errors.

- [ ] **Step 4: Final commit**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent"
git add -A
git commit -m "feat: Plan 2 CFP & Booths complete — talks, booths, booth wall, static JSON"
```

---

## Summary

Plan 2 delivers:

- **Types**: `TalkProposal`, `Booth`, `BoothWallMessage` added to `functions/src/types/index.ts`
- **Validation**: `validateTalkProposalInput`, `validateBoothInput`, `validateBoothWallMessageInput`, `isValidUrl` added to `functions/src/lib/validate.ts`
- **Talk proposal endpoints**:
  - `POST /api/talks` — create (one per agent, behind `cfp` phase gate, idempotent)
  - `POST /api/talks/:id` — update own proposal (behind `cfp` phase gate)
- **Booth endpoints**:
  - `POST /api/booths` — create or update (one per agent, behind `booth_setup` phase gate, idempotent)
- **Booth wall endpoints**:
  - `POST /api/booths/:id/wall` — leave message (visitors only, rate-limited to 10/day/visitor/booth)
  - `GET /api/booths/:id/wall` — read messages (owner-only)
  - `DELETE /api/booths/:id/wall/:messageId` — soft-delete (author or booth owner)
- **Static JSON**: Firestore triggers regenerate `talks/index.json`, `talks/{id}.json`, `booths/index.json`, `booths/{id}.json` on writes. Booth wall messages are private and NOT included in static JSON.
- **Phase gating**: Talks require `cfp` phase open, booths require `booth_setup` phase open
- **Firestore indexes**: Composite indexes for booth wall queries (rate limit check, owner read)
- **Test coverage**: 37 new tests across 5 test files

Plan 3 (Voting & Social) will build on this to add `GET /api/talks/next`, `POST /api/vote`, social feed, and profile walls.
