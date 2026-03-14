# Production Bugs Found During Test Harness Planning

These were discovered by code review while planning the conference simulation test harness. They are documented and proven by `functions/test/simulation/bypass-validation.test.ts`. None have been fixed yet.

## Bug 1: Orphaned agents on mailer failure
**File:** `functions/src/api/register.ts:32-43`
**Issue:** Agent document is written to Firestore (line 32) BEFORE `mailer.sendVerification()` is called (line 43). If the mailer throws, the agent exists in the database but no email was sent. The human is told "check your email" but nothing arrived. No try/catch around the mailer call.
**Fix options:** (a) Wrap mailer in try/catch and delete the agent doc on failure, or (b) Send email first, write doc only on success (but then a Firestore failure loses the email).
**Proven by:** RISK 1 tests in bypass-validation.test.ts

## Bug 2: Phase gate overrides are dead code
**File:** `functions/src/index.ts:75-77` and all other `createPhaseGate` calls
**Issue:** `createPhaseGate` expects a synchronous `PhaseOverrideGetter`. Production passes `(key) => { return undefined; }` to every gate — a sync function that always returns undefined. The async Firestore-backed `getPhaseOverrides` is only passed to `handleStatus`, which correctly awaits it. Phase overrides stored in `config/settings.phase_overrides` are read by the status endpoint but never applied to phase gates.
**Impact:** Admin phase overrides (open/close phases via Firestore settings) have no effect on actual endpoint access. Only the hardcoded dates in `config/phases.ts` control phase gates.
**Fix:** Pass a sync getter to `createPhaseGate` that reads from a cached/preloaded settings object, or make the phase gate middleware async.
**Proven by:** RISK 4 tests in bypass-validation.test.ts

## Bug 3: Idempotency middleware never records responses
**File:** `functions/src/middleware/idempotency.ts`
**Issue:** The middleware exposes `recordResponse()` for handlers to call after completing a write. No handler in `functions/src/api/` ever calls it. The cache is always 'pending', never a stored response. Duplicate requests with the same `Idempotency-Key` header both pass through to the handler.
**Impact:** Idempotency keys are accepted but provide zero deduplication protection. A network retry with the same key creates duplicate resources.
**Fix:** Handlers that use idempotency (talks, booths) should call `middleware.recordResponse(agentId, key, status, body)` after successful writes.
**Proven by:** RISK 5 tests in bypass-validation.test.ts

## Bug 4: Booth wall rate limit query has type mismatch
**File:** `functions/src/api/booths.ts:108-114`
**Issue:** `todayStart` is created as `new Date()` (a JS Date object). The `posted_at` field is stored via `FieldValue.serverTimestamp()` (a Firestore Timestamp). The `where('posted_at', '>=', todayStart)` comparison works in real Firestore (automatic coercion) but would fail in any JS-based mock. `social.ts` avoids this by using `Timestamp.fromDate()` for todayStart — keeping both sides as Timestamps.
**Impact:** Likely works in production Firestore (which coerces Date to Timestamp), but the inconsistency with `social.ts` is confusing and breaks in-memory testing.
**Fix:** Use `Timestamp.fromDate(todayStart)` like social.ts does.
**Proven by:** RISK 6 tests in bypass-validation.test.ts

## Bug already fixed: talk-upload reads from wrong collection
**File:** `functions/src/api/talk-upload.ts:18,70` (was `proposals`, now `talks`)
**Issue:** `handleTalkUpload` read from `db.collection('proposals')` but `handleCreateTalk` writes to `db.collection('talks')`. No `proposals` collection exists.
**Status:** FIXED in this session. Tests updated and passing.
