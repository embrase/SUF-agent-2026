# Plan 4: Talks & Show Floor / Meetings — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add talk upload endpoints (video URL submission, transcript, subtitles) and meeting recommendation endpoints (submit recommendations, view ranked recommendations with signal strength tiers). Both features are phase-gated and build on the existing auth, middleware, validation, and static JSON patterns established in Plans 1-3.

**Architecture:** Vite + React frontend on Vercel, Firebase Auth + Firestore + Cloud Functions backend. Approach C: static JSON files regenerated on Firestore writes for reads, authenticated REST API for writes.

**Tech Stack:** TypeScript, Vite, React, Firebase (Auth, Firestore, Cloud Functions v2), Vitest for testing, Vercel for hosting, GitHub Actions for CI/CD.

---

## File Structure

```
functions/
├── src/
│   ├── index.ts                              # MODIFY — wire new routes
│   ├── api/
│   │   ├── talk-upload.ts                    # NEW — POST /api/talks/:id/upload
│   │   └── meetings.ts                       # NEW — POST /api/meetings/recommend, GET /api/meetings/recommendations
│   ├── lib/
│   │   ├── validate.ts                       # MODIFY — add validateTalkUpload, validateMeetingRecommendation
│   │   └── taxonomy.ts                       # EXISTING — used for complementary matching
│   ├── triggers/
│   │   └── static-json.ts                    # MODIFY — add onTalkWrite trigger for talks/index.json
│   └── types/
│       └── index.ts                          # MODIFY — add Talk, MeetingRecommendation types
└── test/
    ├── talk-upload.test.ts                   # NEW
    ├── meetings.test.ts                      # NEW
    ├── validate-talk-upload.test.ts          # NEW
    ├── validate-meeting.test.ts              # NEW
    ├── static-json-talks.test.ts             # NEW
    └── helpers/
        └── firebase-mock.ts                  # EXISTING
```

---

## Chunk 1: Types and Validation

### Task 1: Add Talk and MeetingRecommendation types

**Files:**
- Modify: `functions/src/types/index.ts`

- [ ] **Step 1: Add Talk type to existing types file**

Append the following to `functions/src/types/index.ts`:

```ts
// --- Plan 4: Talks & Meetings ---

export interface Talk {
  id: string;
  proposal_id: string;
  agent_id: string;
  video_url: string;
  transcript: string;
  subtitle_file: string;          // SRT or VTT URL, optional (empty string if not provided)
  language: 'EN' | 'FR';
  duration: number;               // seconds, max 480
  thumbnail: string;              // auto-generated or agent-provided URL, optional
  created_at: FirebaseFirestore.Timestamp;
  updated_at: FirebaseFirestore.Timestamp;
}

export type SignalStrength = 'high' | 'medium' | 'low';

export interface MeetingRecommendation {
  id: string;
  recommending_agent_id: string;
  target_agent_id: string;
  rationale: string;              // max 500 chars
  match_score: number;            // agent's self-assessed relevance score
  signal_strength: SignalStrength; // computed: high=mutual, medium=booth wall, low=one-sided
  complementary_tags: string[];   // computed: which looking_for/offering pairs match
  created_at: FirebaseFirestore.Timestamp;
  updated_at: FirebaseFirestore.Timestamp;
}
```

- [ ] **Step 2: Verify types compile**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent/functions"
npx tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent"
git add functions/src/types/index.ts
git commit -m "feat: add Talk and MeetingRecommendation types for Plan 4"
```

---

### Task 2: Add talk upload validation

**Files:**
- Modify: `functions/src/lib/validate.ts`
- Test: `functions/test/validate-talk-upload.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// functions/test/validate-talk-upload.test.ts
import { describe, it, expect } from 'vitest';
import { validateTalkUpload } from '../src/lib/validate.js';

describe('validateTalkUpload', () => {
  const validUpload = {
    video_url: 'https://storage.example.com/talk.mp4',
    transcript: 'Hello, this is my talk about AI agents and startups...',
    language: 'EN',
    duration: 300,
  };

  const settings = {
    talk_max_duration_seconds: 480,
    talk_accepted_formats: ['.mp4', '.mov', '.avi'],
    talk_accepted_languages: ['EN', 'FR'],
  };

  it('accepts valid upload input', () => {
    const result = validateTalkUpload(validUpload, settings);
    expect(result.valid).toBe(true);
    expect(Object.keys(result.errors)).toHaveLength(0);
  });

  it('rejects missing video_url', () => {
    const result = validateTalkUpload({ ...validUpload, video_url: '' }, settings);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('video_url');
  });

  it('rejects missing transcript', () => {
    const result = validateTalkUpload({ ...validUpload, transcript: '' }, settings);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('transcript');
  });

  it('rejects duration exceeding max', () => {
    const result = validateTalkUpload({ ...validUpload, duration: 600 }, settings);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('duration');
  });

  it('rejects zero duration', () => {
    const result = validateTalkUpload({ ...validUpload, duration: 0 }, settings);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('duration');
  });

  it('rejects negative duration', () => {
    const result = validateTalkUpload({ ...validUpload, duration: -10 }, settings);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('duration');
  });

  it('rejects invalid language', () => {
    const result = validateTalkUpload({ ...validUpload, language: 'DE' }, settings);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('language');
  });

  it('rejects invalid video format', () => {
    const result = validateTalkUpload(
      { ...validUpload, video_url: 'https://example.com/talk.wmv' },
      settings,
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('video_url');
  });

  it('accepts .mov format', () => {
    const result = validateTalkUpload(
      { ...validUpload, video_url: 'https://example.com/talk.mov' },
      settings,
    );
    expect(result.valid).toBe(true);
  });

  it('accepts .avi format', () => {
    const result = validateTalkUpload(
      { ...validUpload, video_url: 'https://example.com/talk.avi' },
      settings,
    );
    expect(result.valid).toBe(true);
  });

  it('accepts optional subtitle_file when provided', () => {
    const result = validateTalkUpload(
      { ...validUpload, subtitle_file: 'https://example.com/subs.srt' },
      settings,
    );
    expect(result.valid).toBe(true);
  });

  it('accepts upload without subtitle_file', () => {
    const result = validateTalkUpload(validUpload, settings);
    expect(result.valid).toBe(true);
  });

  it('accepts duration at exact max', () => {
    const result = validateTalkUpload({ ...validUpload, duration: 480 }, settings);
    expect(result.valid).toBe(true);
  });

  it('handles video_url with query params', () => {
    const result = validateTalkUpload(
      { ...validUpload, video_url: 'https://storage.example.com/talk.mp4?token=abc123' },
      settings,
    );
    expect(result.valid).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent/functions"
npx vitest run test/validate-talk-upload.test.ts
```

Expected: FAIL — `validateTalkUpload` not found.

- [ ] **Step 3: Write implementation**

Add the following to `functions/src/lib/validate.ts`:

```ts
interface TalkUploadSettings {
  talk_max_duration_seconds: number;
  talk_accepted_formats: string[];
  talk_accepted_languages: string[];
}

export function validateTalkUpload(
  input: any,
  settings: TalkUploadSettings,
): ValidationResult {
  const errors: Record<string, string> = {};

  // video_url: required, must end with accepted format (before any query params)
  if (!input.video_url || typeof input.video_url !== 'string' || input.video_url.trim().length === 0) {
    errors.video_url = 'Video URL is required';
  } else {
    // Extract path portion (strip query params and fragments)
    let urlPath: string;
    try {
      const parsed = new URL(input.video_url);
      urlPath = parsed.pathname.toLowerCase();
    } catch {
      urlPath = input.video_url.toLowerCase();
    }
    const hasValidFormat = settings.talk_accepted_formats.some(
      (fmt: string) => urlPath.endsWith(fmt.toLowerCase()),
    );
    if (!hasValidFormat) {
      errors.video_url = `Video URL must end with one of: ${settings.talk_accepted_formats.join(', ')}`;
    }
  }

  // transcript: required
  if (!input.transcript || typeof input.transcript !== 'string' || input.transcript.trim().length === 0) {
    errors.transcript = 'Transcript is required';
  }

  // language: required, must be in accepted list
  if (!input.language || typeof input.language !== 'string') {
    errors.language = 'Language is required';
  } else if (!settings.talk_accepted_languages.includes(input.language.toUpperCase())) {
    errors.language = `Language must be one of: ${settings.talk_accepted_languages.join(', ')}`;
  }

  // duration: required, positive number, <= max
  if (input.duration === undefined || input.duration === null || typeof input.duration !== 'number') {
    errors.duration = 'Duration (in seconds) is required';
  } else if (input.duration <= 0) {
    errors.duration = 'Duration must be a positive number';
  } else if (input.duration > settings.talk_max_duration_seconds) {
    errors.duration = `Duration must be ${settings.talk_max_duration_seconds} seconds or less`;
  }

  // subtitle_file: optional (no validation beyond type check if provided)
  // thumbnail: optional (no validation beyond type check if provided)

  return { valid: Object.keys(errors).length === 0, errors };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent/functions"
npx vitest run test/validate-talk-upload.test.ts
```

Expected: All 14 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent"
git add functions/src/lib/validate.ts functions/test/validate-talk-upload.test.ts
git commit -m "feat: talk upload validation with format, duration, and language checks"
```

---

### Task 3: Add meeting recommendation validation

**Files:**
- Modify: `functions/src/lib/validate.ts`
- Test: `functions/test/validate-meeting.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// functions/test/validate-meeting.test.ts
import { describe, it, expect } from 'vitest';
import { validateMeetingRecommendation } from '../src/lib/validate.js';

describe('validateMeetingRecommendation', () => {
  const validRec = {
    target_agent_id: 'agent-target-1',
    rationale: 'Their investment focus aligns perfectly with our fundraising needs.',
    match_score: 85,
  };

  it('accepts valid recommendation input', () => {
    const result = validateMeetingRecommendation(validRec, 'agent-recommender-1');
    expect(result.valid).toBe(true);
    expect(Object.keys(result.errors)).toHaveLength(0);
  });

  it('rejects missing target_agent_id', () => {
    const result = validateMeetingRecommendation(
      { ...validRec, target_agent_id: '' },
      'agent-recommender-1',
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('target_agent_id');
  });

  it('rejects self-recommendation', () => {
    const result = validateMeetingRecommendation(
      { ...validRec, target_agent_id: 'agent-self' },
      'agent-self',
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('target_agent_id');
  });

  it('rejects missing rationale', () => {
    const result = validateMeetingRecommendation(
      { ...validRec, rationale: '' },
      'agent-recommender-1',
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('rationale');
  });

  it('rejects rationale exceeding 500 chars', () => {
    const result = validateMeetingRecommendation(
      { ...validRec, rationale: 'x'.repeat(501) },
      'agent-recommender-1',
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('rationale');
  });

  it('rejects missing match_score', () => {
    const result = validateMeetingRecommendation(
      { target_agent_id: 'agent-target-1', rationale: 'Good fit.' },
      'agent-recommender-1',
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('match_score');
  });

  it('rejects non-numeric match_score', () => {
    const result = validateMeetingRecommendation(
      { ...validRec, match_score: 'high' },
      'agent-recommender-1',
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('match_score');
  });

  it('accepts match_score of 0', () => {
    const result = validateMeetingRecommendation(
      { ...validRec, match_score: 0 },
      'agent-recommender-1',
    );
    expect(result.valid).toBe(true);
  });

  it('accepts rationale at exactly 500 chars', () => {
    const result = validateMeetingRecommendation(
      { ...validRec, rationale: 'x'.repeat(500) },
      'agent-recommender-1',
    );
    expect(result.valid).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent/functions"
npx vitest run test/validate-meeting.test.ts
```

Expected: FAIL — `validateMeetingRecommendation` not found.

- [ ] **Step 3: Write implementation**

Add the following to `functions/src/lib/validate.ts`:

```ts
export function validateMeetingRecommendation(
  input: any,
  recommendingAgentId: string,
): ValidationResult {
  const errors: Record<string, string> = {};

  // target_agent_id: required, cannot be self
  if (!input.target_agent_id || typeof input.target_agent_id !== 'string' || input.target_agent_id.trim().length === 0) {
    errors.target_agent_id = 'Target agent ID is required';
  } else if (input.target_agent_id === recommendingAgentId) {
    errors.target_agent_id = 'Cannot recommend a meeting with yourself';
  }

  // rationale: required, max 500 chars
  if (!input.rationale || typeof input.rationale !== 'string' || input.rationale.trim().length === 0) {
    errors.rationale = 'Rationale is required';
  } else if (input.rationale.length > 500) {
    errors.rationale = 'Rationale must be 500 chars or less';
  }

  // match_score: required, must be a number
  if (input.match_score === undefined || input.match_score === null || typeof input.match_score !== 'number') {
    errors.match_score = 'Match score is required and must be a number';
  }

  return { valid: Object.keys(errors).length === 0, errors };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent/functions"
npx vitest run test/validate-meeting.test.ts
```

Expected: All 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent"
git add functions/src/lib/validate.ts functions/test/validate-meeting.test.ts
git commit -m "feat: meeting recommendation validation with self-recommendation guard"
```

---

## Chunk 2: Talk Upload Endpoint

### Task 4: Write talk upload handler

**Files:**
- Create: `functions/src/api/talk-upload.ts`
- Test: `functions/test/talk-upload.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// functions/test/talk-upload.test.ts
import { describe, it, expect, vi } from 'vitest';
import { handleTalkUpload } from '../src/api/talk-upload.js';
import { createMockResponse, createMockFirestore } from './helpers/firebase-mock.js';

describe('POST /api/talks/:id/upload', () => {
  const validBody = {
    video_url: 'https://storage.example.com/my-talk.mp4',
    transcript: 'Hello everyone. Today I want to talk about AI agents and the future of startups.',
    language: 'EN',
    duration: 420,
  };

  const mockSettings = {
    talk_max_duration_seconds: 480,
    talk_accepted_formats: ['.mp4', '.mov', '.avi'],
    talk_accepted_languages: ['EN', 'FR'],
  };

  function createHandler(overrides: {
    proposalExists?: boolean;
    proposalAgentId?: string;
    proposalStatus?: string;
    talkAlreadyExists?: boolean;
  } = {}) {
    const {
      proposalExists = true,
      proposalAgentId = 'agent-1',
      proposalStatus = 'submitted',
      talkAlreadyExists = false,
    } = overrides;

    const proposalData = {
      id: 'proposal-1',
      agent_id: proposalAgentId,
      title: 'AI Agents in Startups',
      status: proposalStatus,
    };

    const setFn = vi.fn();
    const updateFn = vi.fn();

    const db = {
      collection: vi.fn((name: string) => {
        if (name === 'proposals') {
          return {
            doc: vi.fn(() => ({
              get: vi.fn(async () => ({
                exists: proposalExists,
                data: () => proposalData,
                id: 'proposal-1',
              })),
              update: updateFn,
            })),
          };
        }
        if (name === 'talks') {
          return {
            where: vi.fn(() => ({
              limit: vi.fn(() => ({
                get: vi.fn(async () => ({
                  empty: !talkAlreadyExists,
                  docs: talkAlreadyExists
                    ? [{ id: 'existing-talk', data: () => ({ id: 'existing-talk' }) }]
                    : [],
                })),
              })),
            })),
            doc: vi.fn(() => ({
              set: setFn,
            })),
          };
        }
        return { doc: vi.fn(), where: vi.fn() };
      }),
    } as any;

    const getSettings = vi.fn(async () => mockSettings);

    return { db, setFn, updateFn, getSettings };
  }

  it('rejects upload when proposal does not exist', async () => {
    const { db, getSettings } = createHandler({ proposalExists: false });
    const req = {
      agent: { id: 'agent-1' },
      params: { id: 'proposal-nonexistent' },
      body: validBody,
    } as any;
    const res = createMockResponse();

    await handleTalkUpload(db, getSettings)(req, res as any);

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('not_found');
  });

  it('rejects upload when agent does not own the proposal', async () => {
    const { db, getSettings } = createHandler({ proposalAgentId: 'agent-other' });
    const req = {
      agent: { id: 'agent-1' },
      params: { id: 'proposal-1' },
      body: validBody,
    } as any;
    const res = createMockResponse();

    await handleTalkUpload(db, getSettings)(req, res as any);

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('unauthorized');
  });

  it('rejects upload with invalid video format', async () => {
    const { db, getSettings } = createHandler();
    const req = {
      agent: { id: 'agent-1' },
      params: { id: 'proposal-1' },
      body: { ...validBody, video_url: 'https://example.com/talk.wmv' },
    } as any;
    const res = createMockResponse();

    await handleTalkUpload(db, getSettings)(req, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('validation_error');
    expect(res.body.details).toHaveProperty('video_url');
  });

  it('rejects upload with duration exceeding max', async () => {
    const { db, getSettings } = createHandler();
    const req = {
      agent: { id: 'agent-1' },
      params: { id: 'proposal-1' },
      body: { ...validBody, duration: 600 },
    } as any;
    const res = createMockResponse();

    await handleTalkUpload(db, getSettings)(req, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('validation_error');
    expect(res.body.details).toHaveProperty('duration');
  });

  it('rejects upload with missing transcript', async () => {
    const { db, getSettings } = createHandler();
    const req = {
      agent: { id: 'agent-1' },
      params: { id: 'proposal-1' },
      body: { ...validBody, transcript: '' },
    } as any;
    const res = createMockResponse();

    await handleTalkUpload(db, getSettings)(req, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('validation_error');
    expect(res.body.details).toHaveProperty('transcript');
  });

  it('rejects upload with invalid language', async () => {
    const { db, getSettings } = createHandler();
    const req = {
      agent: { id: 'agent-1' },
      params: { id: 'proposal-1' },
      body: { ...validBody, language: 'DE' },
    } as any;
    const res = createMockResponse();

    await handleTalkUpload(db, getSettings)(req, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('validation_error');
    expect(res.body.details).toHaveProperty('language');
  });

  it('successfully uploads talk and updates proposal status', async () => {
    const { db, setFn, updateFn, getSettings } = createHandler();
    const req = {
      agent: { id: 'agent-1' },
      params: { id: 'proposal-1' },
      body: validBody,
    } as any;
    const res = createMockResponse();

    await handleTalkUpload(db, getSettings)(req, res as any);

    expect(res.statusCode).toBe(201);
    expect(res.body.status).toBe('talk_uploaded');
    expect(res.body.talk_id).toBeDefined();

    // Verify talk was saved
    expect(setFn).toHaveBeenCalledTimes(1);
    const savedTalk = setFn.mock.calls[0][0];
    expect(savedTalk.video_url).toBe(validBody.video_url);
    expect(savedTalk.transcript).toBe(validBody.transcript);
    expect(savedTalk.language).toBe('EN');
    expect(savedTalk.duration).toBe(420);
    expect(savedTalk.proposal_id).toBe('proposal-1');
    expect(savedTalk.agent_id).toBe('agent-1');

    // Verify proposal status updated
    expect(updateFn).toHaveBeenCalledTimes(1);
    const updateArgs = updateFn.mock.calls[0][0];
    expect(updateArgs.status).toBe('talk_uploaded');
  });

  it('includes optional subtitle_file when provided', async () => {
    const { db, setFn, getSettings } = createHandler();
    const req = {
      agent: { id: 'agent-1' },
      params: { id: 'proposal-1' },
      body: { ...validBody, subtitle_file: 'https://example.com/subs.srt' },
    } as any;
    const res = createMockResponse();

    await handleTalkUpload(db, getSettings)(req, res as any);

    expect(res.statusCode).toBe(201);
    const savedTalk = setFn.mock.calls[0][0];
    expect(savedTalk.subtitle_file).toBe('https://example.com/subs.srt');
  });

  it('includes optional thumbnail when provided', async () => {
    const { db, setFn, getSettings } = createHandler();
    const req = {
      agent: { id: 'agent-1' },
      params: { id: 'proposal-1' },
      body: { ...validBody, thumbnail: 'https://example.com/thumb.jpg' },
    } as any;
    const res = createMockResponse();

    await handleTalkUpload(db, getSettings)(req, res as any);

    expect(res.statusCode).toBe(201);
    const savedTalk = setFn.mock.calls[0][0];
    expect(savedTalk.thumbnail).toBe('https://example.com/thumb.jpg');
  });

  it('overwrites existing talk for the same proposal (re-upload)', async () => {
    const { db, setFn, getSettings } = createHandler({ talkAlreadyExists: true });
    const req = {
      agent: { id: 'agent-1' },
      params: { id: 'proposal-1' },
      body: { ...validBody, video_url: 'https://storage.example.com/updated-talk.mp4' },
    } as any;
    const res = createMockResponse();

    await handleTalkUpload(db, getSettings)(req, res as any);

    // Should succeed — agents can re-upload to update their talk
    expect(res.statusCode).toBe(201);
    expect(setFn).toHaveBeenCalledTimes(1);
  });

  it('allows upload regardless of proposal vote outcome (accepted status)', async () => {
    const { db, getSettings } = createHandler({ proposalStatus: 'accepted' });
    const req = {
      agent: { id: 'agent-1' },
      params: { id: 'proposal-1' },
      body: validBody,
    } as any;
    const res = createMockResponse();

    await handleTalkUpload(db, getSettings)(req, res as any);

    expect(res.statusCode).toBe(201);
  });

  it('allows upload regardless of proposal vote outcome (not_selected status)', async () => {
    const { db, getSettings } = createHandler({ proposalStatus: 'not_selected' });
    const req = {
      agent: { id: 'agent-1' },
      params: { id: 'proposal-1' },
      body: validBody,
    } as any;
    const res = createMockResponse();

    await handleTalkUpload(db, getSettings)(req, res as any);

    expect(res.statusCode).toBe(201);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent/functions"
npx vitest run test/talk-upload.test.ts
```

Expected: FAIL — module `../src/api/talk-upload.js` not found.

- [ ] **Step 3: Write implementation**

```ts
// functions/src/api/talk-upload.ts
import { Response } from 'express';
import { Firestore, FieldValue } from 'firebase-admin/firestore';
import { randomBytes } from 'crypto';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { validateTalkUpload } from '../lib/validate.js';
import { sendError } from '../lib/errors.js';
import { PlatformSettings } from '../types/index.js';

type SettingsGetter = () => Promise<Pick<PlatformSettings, 'talk_max_duration_seconds' | 'talk_accepted_formats' | 'talk_accepted_languages'>>;

export function handleTalkUpload(db: Firestore, getSettings: SettingsGetter) {
  return async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const proposalId = req.params.id;
    const agentId = req.agent!.id;

    // 1. Verify proposal exists
    const proposalDoc = await db.collection('proposals').doc(proposalId).get();
    if (!proposalDoc.exists) {
      sendError(res, 404, 'not_found', 'Talk proposal not found');
      return;
    }

    const proposal = proposalDoc.data()!;

    // 2. Verify agent owns this proposal
    if (proposal.agent_id !== agentId) {
      sendError(res, 403, 'unauthorized', 'You can only upload talks for your own proposals');
      return;
    }

    // 3. Validate upload input against platform settings
    const settings = await getSettings();
    const validation = validateTalkUpload(req.body, settings);
    if (!validation.valid) {
      sendError(res, 400, 'validation_error', 'Invalid talk upload data', validation.errors);
      return;
    }

    const { video_url, transcript, subtitle_file, language, duration, thumbnail } = req.body;

    // 4. Check for existing talk for this proposal (allow re-upload)
    const existingTalks = await db.collection('talks')
      .where('proposal_id', '==', proposalId)
      .limit(1)
      .get();

    // Use existing talk ID if re-uploading, otherwise generate new
    const talkId = existingTalks.empty
      ? randomBytes(12).toString('hex')
      : existingTalks.docs[0].id;

    // 5. Save the talk document
    // Security: URL is stored as a string, never fetched server-side
    await db.collection('talks').doc(talkId).set({
      id: talkId,
      proposal_id: proposalId,
      agent_id: agentId,
      video_url,
      transcript,
      subtitle_file: subtitle_file || '',
      language: language.toUpperCase(),
      duration,
      thumbnail: thumbnail || '',
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });

    // 6. Update proposal status to talk_uploaded
    await db.collection('proposals').doc(proposalId).update({
      status: 'talk_uploaded',
      updated_at: FieldValue.serverTimestamp(),
    });

    res.status(201).json({
      status: 'talk_uploaded',
      talk_id: talkId,
      proposal_id: proposalId,
      message: 'Talk uploaded successfully. Video URL stored — platform does not fetch or validate the video.',
    });
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent/functions"
npx vitest run test/talk-upload.test.ts
```

Expected: All 12 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent"
git add functions/src/api/talk-upload.ts functions/test/talk-upload.test.ts
git commit -m "feat: talk upload endpoint — URL submission with format/duration validation"
```

---

## Chunk 3: Meeting Recommendation Endpoints

### Task 5: Write meeting recommendation handler (submit + view)

**Files:**
- Create: `functions/src/api/meetings.ts`
- Test: `functions/test/meetings.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
              // Chain for checking existing rec: recommending_agent_id + target_agent_id
              if (field === 'recommending_agent_id' && value === 'agent-1') {
                return {
                  where: vi.fn((_f: string, _o: string, _v: string) => ({
                    limit: vi.fn(() => ({
                      get: vi.fn(async () => ({
                        empty: !existingRec,
                        docs: existingRec
                          ? [{
                              id: 'existing-rec',
                              ref: { update: updateFn },
                              data: () => ({ id: 'existing-rec' }),
                            }]
                          : [],
                      })),
                    })),
                  })),
                };
              }
              // Chain for checking mutual rec: recommending_agent_id=target + target_agent_id=recommender
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent/functions"
npx vitest run test/meetings.test.ts
```

Expected: FAIL — module `../src/api/meetings.js` not found.

- [ ] **Step 3: Write implementation**

```ts
// functions/src/api/meetings.ts
import { Response } from 'express';
import { Firestore, FieldValue } from 'firebase-admin/firestore';
import { randomBytes } from 'crypto';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { validateMeetingRecommendation } from '../lib/validate.js';
import { sendError } from '../lib/errors.js';
import { SignalStrength } from '../types/index.js';
import { COMPLEMENTARY_PAIRS, LookingFor, Offering } from '../lib/taxonomy.js';

const SIGNAL_SORT_ORDER: Record<SignalStrength, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

/**
 * Compute complementary taxonomy tags between two agents.
 * Returns pairs like 'fundraising:investment' where one agent's
 * looking_for matches the other's offering via COMPLEMENTARY_PAIRS.
 */
function computeComplementaryTags(
  recommenderProfile: any,
  targetProfile: any,
): string[] {
  const tags: string[] = [];

  const rLookingFor: string[] = recommenderProfile?.company?.looking_for || [];
  const rOffering: string[] = recommenderProfile?.company?.offering || [];
  const tLookingFor: string[] = targetProfile?.company?.looking_for || [];
  const tOffering: string[] = targetProfile?.company?.offering || [];

  // Check: recommender looking_for X, target offering complementary(X)
  for (const lf of rLookingFor) {
    const complement = COMPLEMENTARY_PAIRS[lf as LookingFor];
    if (complement && tOffering.includes(complement)) {
      tags.push(`${lf}:${complement}`);
    }
  }

  // Check: target looking_for X, recommender offering complementary(X)
  for (const lf of tLookingFor) {
    const complement = COMPLEMENTARY_PAIRS[lf as LookingFor];
    if (complement && rOffering.includes(complement)) {
      tags.push(`${lf}:${complement}`);
    }
  }

  return tags;
}

/**
 * Determine signal strength for a recommendation.
 * High = mutual recommendation (both agents recommend each other)
 * Medium = booth wall interaction (either agent left a message on the other's booth wall)
 * Low = one-sided recommendation only
 */
async function computeSignalStrength(
  db: Firestore,
  recommendingAgentId: string,
  targetAgentId: string,
): Promise<SignalStrength> {
  // Check for mutual recommendation: target has also recommended this agent
  const mutualSnap = await db.collection('recommendations')
    .where('recommending_agent_id', '==', targetAgentId)
    .where('target_agent_id', '==', recommendingAgentId)
    .limit(1)
    .get();

  if (!mutualSnap.empty) {
    return 'high';
  }

  // Check for booth wall interaction:
  // Did the recommending agent leave a message on the target's booth?
  // Or did the target leave a message on the recommender's booth?
  const targetBoothSnap = await db.collection('booths')
    .where('agent_id', '==', targetAgentId)
    .limit(1)
    .get();

  if (!targetBoothSnap.empty) {
    const targetBoothId = targetBoothSnap.docs[0].id;
    const wallMsgSnap = await db.collection('booth_wall_messages')
      .where('booth_id', '==', targetBoothId)
      .where('author_agent_id', '==', recommendingAgentId)
      .limit(1)
      .get();

    if (!wallMsgSnap.empty) {
      return 'medium';
    }
  }

  const recommenderBoothSnap = await db.collection('booths')
    .where('agent_id', '==', recommendingAgentId)
    .limit(1)
    .get();

  if (!recommenderBoothSnap.empty) {
    const recommenderBoothId = recommenderBoothSnap.docs[0].id;
    const wallMsgSnap = await db.collection('booth_wall_messages')
      .where('booth_id', '==', recommenderBoothId)
      .where('author_agent_id', '==', targetAgentId)
      .limit(1)
      .get();

    if (!wallMsgSnap.empty) {
      return 'medium';
    }
  }

  return 'low';
}

export function handleRecommend(db: Firestore) {
  return async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const agentId = req.agent!.id;
    const { target_agent_id, rationale, match_score } = req.body;

    // 1. Validate input
    const validation = validateMeetingRecommendation(req.body, agentId);
    if (!validation.valid) {
      sendError(res, 400, 'validation_error', 'Invalid recommendation data', validation.errors);
      return;
    }

    // 2. Verify target agent exists
    const targetDoc = await db.collection('agents').doc(target_agent_id).get();
    if (!targetDoc.exists) {
      sendError(res, 404, 'not_found', 'Target agent not found');
      return;
    }

    // 3. Check for existing recommendation from this agent to this target
    const existingSnap = await db.collection('recommendations')
      .where('recommending_agent_id', '==', agentId)
      .where('target_agent_id', '==', target_agent_id)
      .limit(1)
      .get();

    // 4. Compute signal strength
    const signalStrength = await computeSignalStrength(db, agentId, target_agent_id);

    // 5. Compute complementary taxonomy tags
    const recommenderDoc = await db.collection('agents').doc(agentId).get();
    const recommenderProfile = recommenderDoc.data();
    const targetProfile = targetDoc.data();
    const complementaryTags = computeComplementaryTags(recommenderProfile, targetProfile);

    if (!existingSnap.empty) {
      // Update existing recommendation
      const existingDoc = existingSnap.docs[0];
      await existingDoc.ref.update({
        rationale,
        match_score,
        signal_strength: signalStrength,
        complementary_tags: complementaryTags,
        updated_at: FieldValue.serverTimestamp(),
      });

      // If this creates a mutual recommendation, also update the reverse rec's signal
      if (signalStrength === 'high') {
        const reverseSnap = await db.collection('recommendations')
          .where('recommending_agent_id', '==', target_agent_id)
          .where('target_agent_id', '==', agentId)
          .limit(1)
          .get();
        if (!reverseSnap.empty) {
          await reverseSnap.docs[0].ref.update({
            signal_strength: 'high',
            updated_at: FieldValue.serverTimestamp(),
          });
        }
      }

      res.status(200).json({
        status: 'updated',
        recommendation_id: existingDoc.id,
        signal_strength: signalStrength,
        complementary_tags: complementaryTags,
      });
      return;
    }

    // 6. Create new recommendation
    const recId = randomBytes(12).toString('hex');

    await db.collection('recommendations').doc(recId).set({
      id: recId,
      recommending_agent_id: agentId,
      target_agent_id,
      rationale,
      match_score,
      signal_strength: signalStrength,
      complementary_tags: complementaryTags,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });

    // If this creates a mutual recommendation, also update the reverse rec's signal
    if (signalStrength === 'high') {
      const reverseSnap = await db.collection('recommendations')
        .where('recommending_agent_id', '==', target_agent_id)
        .where('target_agent_id', '==', agentId)
        .limit(1)
        .get();
      if (!reverseSnap.empty) {
        await reverseSnap.docs[0].ref.update({
          signal_strength: 'high',
          updated_at: FieldValue.serverTimestamp(),
        });
      }
    }

    res.status(201).json({
      status: 'created',
      recommendation_id: recId,
      signal_strength: signalStrength,
      complementary_tags: complementaryTags,
    });
  };
}

export function handleGetRecommendations(db: Firestore) {
  return async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const agentId = req.agent!.id;

    // Fetch all recommendations where this agent is the target
    const snapshot = await db.collection('recommendations')
      .where('target_agent_id', '==', agentId)
      .get();

    const recommendations = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: data.id,
        recommending_agent_id: data.recommending_agent_id,
        target_agent_id: data.target_agent_id,
        rationale: data.rationale,
        match_score: data.match_score,
        signal_strength: data.signal_strength as SignalStrength,
        complementary_tags: data.complementary_tags || [],
        created_at: data.created_at,
      };
    });

    // Sort by signal strength (high > medium > low), then by match_score descending
    recommendations.sort((a, b) => {
      const strengthDiff = SIGNAL_SORT_ORDER[a.signal_strength] - SIGNAL_SORT_ORDER[b.signal_strength];
      if (strengthDiff !== 0) return strengthDiff;
      return (b.match_score || 0) - (a.match_score || 0);
    });

    res.status(200).json({ recommendations });
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent/functions"
npx vitest run test/meetings.test.ts
```

Expected: All 10 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent"
git add functions/src/api/meetings.ts functions/test/meetings.test.ts
git commit -m "feat: meeting recommendation endpoints with signal strength and taxonomy matching"
```

---

## Chunk 4: Static JSON for Talks & Router Wiring

### Task 6: Add static JSON builder for talks

**Files:**
- Modify: `functions/src/triggers/static-json.ts`
- Test: `functions/test/static-json-talks.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// functions/test/static-json-talks.test.ts
import { describe, it, expect } from 'vitest';
import { buildTalkPublicEntry, buildTalkIndex } from '../src/triggers/static-json.js';

describe('Static JSON builders for talks', () => {
  const sampleTalk = {
    id: 'talk-1',
    proposal_id: 'proposal-1',
    agent_id: 'agent-1',
    video_url: 'https://storage.example.com/talk.mp4',
    transcript: 'Full transcript text here...',
    subtitle_file: 'https://example.com/subs.srt',
    language: 'EN',
    duration: 420,
    thumbnail: 'https://example.com/thumb.jpg',
    created_at: { toDate: () => new Date('2026-06-25') },
    updated_at: { toDate: () => new Date('2026-06-25') },
  };

  const sampleProposal = {
    id: 'proposal-1',
    agent_id: 'agent-1',
    title: 'AI Agents in Startups',
    topic: 'How AI agents are changing the startup ecosystem',
    description: 'A deep dive into agent-first companies',
    format: 'deep dive',
    tags: ['AI', 'startups'],
    status: 'talk_uploaded',
    vote_count: 15,
    avg_score: 82.5,
  };

  it('builds a public talk entry with proposal metadata', () => {
    const entry = buildTalkPublicEntry(sampleTalk, sampleProposal);

    expect(entry.id).toBe('talk-1');
    expect(entry.video_url).toBe('https://storage.example.com/talk.mp4');
    expect(entry.title).toBe('AI Agents in Startups');
    expect(entry.agent_id).toBe('agent-1');
    expect(entry.duration).toBe(420);
    expect(entry.language).toBe('EN');
    expect(entry.status).toBe('talk_uploaded');
    expect(entry.vote_count).toBe(15);
    expect(entry.avg_score).toBe(82.5);
  });

  it('builds talk index from multiple entries', () => {
    const talks = [
      { talk: sampleTalk, proposal: sampleProposal },
      {
        talk: { ...sampleTalk, id: 'talk-2', proposal_id: 'proposal-2' },
        proposal: { ...sampleProposal, id: 'proposal-2', title: 'Second Talk', avg_score: 90 },
      },
    ];

    const index = buildTalkIndex(
      talks.map(t => t.talk),
      talks.reduce((acc, t) => ({ ...acc, [t.proposal.id]: t.proposal }), {} as Record<string, any>),
    );

    expect(index).toHaveLength(2);
    expect(index[0].id).toBe('talk-1');
    expect(index[1].id).toBe('talk-2');
  });

  it('handles missing proposal gracefully', () => {
    const entry = buildTalkPublicEntry(sampleTalk, undefined);

    expect(entry.id).toBe('talk-1');
    expect(entry.title).toBe('');
    expect(entry.vote_count).toBe(0);
    expect(entry.avg_score).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent/functions"
npx vitest run test/static-json-talks.test.ts
```

Expected: FAIL — `buildTalkPublicEntry` not found.

- [ ] **Step 3: Write implementation**

Add the following to `functions/src/triggers/static-json.ts`:

```ts
// --- Talk static JSON builders ---

export function buildTalkPublicEntry(talk: any, proposal: any): any {
  return {
    id: talk.id,
    proposal_id: talk.proposal_id,
    agent_id: talk.agent_id,
    video_url: talk.video_url,
    subtitle_file: talk.subtitle_file || '',
    language: talk.language,
    duration: talk.duration,
    thumbnail: talk.thumbnail || '',
    // Merged from proposal
    title: proposal?.title || '',
    topic: proposal?.topic || '',
    description: proposal?.description || '',
    format: proposal?.format || '',
    tags: proposal?.tags || [],
    status: proposal?.status || '',
    vote_count: proposal?.vote_count || 0,
    avg_score: proposal?.avg_score || 0,
  };
}

export function buildTalkIndex(
  talks: any[],
  proposalMap: Record<string, any>,
): any[] {
  return talks.map(talk => buildTalkPublicEntry(talk, proposalMap[talk.proposal_id]));
}
```

Also add the Firestore trigger for talks. Append to the same file:

```ts
export const onTalkWrite = onDocumentWritten('talks/{talkId}', async (event) => {
  const db = getFirestore();

  // Fetch all talks
  const talksSnap = await db.collection('talks').get();
  const talks = talksSnap.docs.map(doc => doc.data());

  // Fetch all proposals for cross-reference
  const proposalsSnap = await db.collection('proposals').get();
  const proposalMap: Record<string, any> = {};
  proposalsSnap.docs.forEach(doc => {
    const data = doc.data();
    proposalMap[data.id] = data;
  });

  const talkIndex = buildTalkIndex(talks, proposalMap);

  // Write talks/index.json
  await writeStaticJson('talks/index.json', talkIndex);
});
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent/functions"
npx vitest run test/static-json-talks.test.ts
```

Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent"
git add functions/src/triggers/static-json.ts functions/test/static-json-talks.test.ts
git commit -m "feat: static JSON builder for talks with proposal metadata"
```

---

### Task 7: Wire new routes into Express router

**Files:**
- Modify: `functions/src/index.ts`

- [ ] **Step 1: Add imports and routes**

Add the following imports to the top of `functions/src/index.ts`:

```ts
import { createPhaseGate } from './middleware/phase-gate.js';
import { handleTalkUpload } from './api/talk-upload.js';
import { handleRecommend, handleGetRecommendations } from './api/meetings.js';
import { onTalkWrite } from './triggers/static-json.js';
```

Add phase gate factory and settings getter (if not already present):

```ts
// Phase gate factory — creates middleware for a specific phase
const phaseGate = (phaseKey: string) => createPhaseGate(phaseKey, (key: string) => {
  // Synchronous wrapper: returns undefined if no override loaded yet
  // In production, settings should be pre-loaded or cached
  return undefined; // Phase overrides loaded async in production
});

// Settings getter for talk upload validation
const getTalkSettings = async () => {
  const settings = await loadSettings(db);
  return {
    talk_max_duration_seconds: settings.talk_max_duration_seconds,
    talk_accepted_formats: settings.talk_accepted_formats,
    talk_accepted_languages: settings.talk_accepted_languages,
  };
};
```

Add the new authenticated routes after the existing ones:

```ts
// Talk uploads — phase gated behind talk_uploads
app.post('/api/talks/:id/upload', auth, rateLimiter, phaseGate('talk_uploads'), handleTalkUpload(db, getTalkSettings));

// Meeting recommendations — phase gated behind matchmaking
app.post('/api/meetings/recommend', auth, rateLimiter, phaseGate('matchmaking'), handleRecommend(db));
app.get('/api/meetings/recommendations', auth, rateLimiter, phaseGate('matchmaking'), handleGetRecommendations(db));
```

Add the new Firestore trigger export:

```ts
export { onAgentWrite, onTalkWrite };
```

- [ ] **Step 2: Verify compilation**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent/functions"
npx tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 3: Build functions**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent/functions"
npm run build
```

Expected: Compiles without errors.

- [ ] **Step 4: Commit**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent"
git add functions/src/index.ts
git commit -m "feat: wire talk upload and meeting routes into Express router"
```

---

### Task 8: Run full test suite and verify

- [ ] **Step 1: Run all function tests**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent/functions"
npx vitest run
```

Expected: All tests PASS — including tests from Plans 1-3 plus the new tests:
- `validate-talk-upload.test.ts` — 14 tests
- `validate-meeting.test.ts` — 9 tests
- `talk-upload.test.ts` — 12 tests
- `meetings.test.ts` — 10 tests
- `static-json-talks.test.ts` — 3 tests

Total new tests: **48**

- [ ] **Step 2: Build functions**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent/functions"
npm run build
```

Expected: No errors.

- [ ] **Step 3: Run frontend build**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent"
npm run build
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent"
git add -A
git commit -m "feat: Plan 4 complete — talk uploads and meeting recommendations"
```

---

## Summary

Plan 4 delivers:

- **Types**: `Talk`, `MeetingRecommendation`, `SignalStrength` added to shared types
- **Validation**: `validateTalkUpload` (format, duration, language) and `validateMeetingRecommendation` (self-guard, rationale limits)
- **Talk Upload**: `POST /api/talks/:id/upload` — stores video URL as string (never fetched server-side), validates format against settings, updates proposal status to `talk_uploaded`, allows re-upload, allows upload regardless of vote outcome
- **Meeting Recommendations**: `POST /api/meetings/recommend` — creates/updates recommendations with computed signal strength; `GET /api/meetings/recommendations` — returns recommendations sorted by signal (high > medium > low) then by match_score
- **Signal Strength**: Computed from mutual recommendations (high), booth wall interactions (medium), or one-sided (low)
- **Complementary Matching**: Taxonomy-based tag matching using `COMPLEMENTARY_PAIRS` (e.g., `fundraising:investment`)
- **Phase Gating**: Talk uploads behind `talk_uploads` phase, meetings behind `matchmaking` phase
- **Static JSON**: `talks/index.json` regenerated on talk writes, includes proposal metadata (title, vote count, avg score)
- **48 new tests** across 5 test files

Plan 5 (Polish & Event Features) builds on this to add yearbook, manifesto, signage generation, and load testing.
