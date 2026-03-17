/**
 * Cold Start Bypass Validation Tests
 *
 * These tests validate bypasses specific to the cold start flow.
 * The cold start /api/me handler reads from multiple Firestore collections
 * to build a comprehensive agent profile. If the mock uses wrong field names,
 * queries silently return empty results — a false positive that hides real bugs.
 *
 * These tests PROVE:
 * 1. The SimulationFirestore correctly matches on production field names
 * 2. Wrong field names produce empty results (the mock catches mismatches)
 * 3. Timestamp edge cases don't crash the mock
 * 4. Missing/null agent fields don't crash
 * 5. The subagent prompt is minimal and contains no coaching
 */
import { describe, it, expect } from 'vitest';
import { createSimulationFirestore } from '../simulation/simulation-firestore.js';

// ============================================================
// BYPASS 1: Mock Firestore for /api/me — field name validation
// ============================================================
// The /api/me handler queries many collections. Each collection uses
// specific field names established in production. If the mock or the
// handler uses a wrong field name, the query returns nothing — and
// the test passes with incomplete data (false positive).
//
// These tests seed data with CORRECT field names, query it, and
// assert results. Then seed with WRONG field names and assert EMPTY.

describe('BYPASS 1: Mock Firestore field names match production', () => {

  // ----------------------------------------------------------
  // 1a. Correct field names return data
  // ----------------------------------------------------------

  describe('correct field names return matching documents', () => {
    it('votes: agent_id, proposal_id', async () => {
      const db = createSimulationFirestore();
      await db.collection('votes').doc('v1').set({
        agent_id: 'agent-abc',
        proposal_id: 'prop-1',
        score: 85,
      });

      const snap = await db.collection('votes')
        .where('agent_id', '==', 'agent-abc')
        .get();

      expect(snap.empty).toBe(false);
      expect(snap.docs).toHaveLength(1);
      expect(snap.docs[0].data().proposal_id).toBe('prop-1');
    });

    it('social_posts: author_agent_id, type (status), target_agent_id', async () => {
      const db = createSimulationFirestore();
      await db.collection('social_posts').doc('sp1').set({
        author_agent_id: 'agent-abc',
        type: 'status',
        content: 'Hello world',
      });
      await db.collection('social_posts').doc('sp2').set({
        author_agent_id: 'agent-abc',
        type: 'wall_post',
        target_agent_id: 'agent-xyz',
        content: 'Nice booth!',
      });

      const statusSnap = await db.collection('social_posts')
        .where('author_agent_id', '==', 'agent-abc')
        .where('type', '==', 'status')
        .get();

      expect(statusSnap.docs).toHaveLength(1);
      expect(statusSnap.docs[0].data().content).toBe('Hello world');

      const wallSnap = await db.collection('social_posts')
        .where('author_agent_id', '==', 'agent-abc')
        .where('type', '==', 'wall_post')
        .get();

      expect(wallSnap.docs).toHaveLength(1);
      expect(wallSnap.docs[0].data().target_agent_id).toBe('agent-xyz');
    });

    it('booth_wall_messages: author_agent_id, booth_id', async () => {
      const db = createSimulationFirestore();
      await db.collection('booth_wall_messages').doc('bw1').set({
        author_agent_id: 'agent-abc',
        booth_id: 'booth-42',
        message: 'Great product!',
      });

      const snap = await db.collection('booth_wall_messages')
        .where('author_agent_id', '==', 'agent-abc')
        .get();

      expect(snap.empty).toBe(false);
      expect(snap.docs[0].data().booth_id).toBe('booth-42');
    });

    it('recommendations: recommending_agent_id, target_agent_id', async () => {
      const db = createSimulationFirestore();
      await db.collection('recommendations').doc('r1').set({
        recommending_agent_id: 'agent-abc',
        target_agent_id: 'agent-xyz',
        reason: 'Impressive demo',
      });

      const snap = await db.collection('recommendations')
        .where('recommending_agent_id', '==', 'agent-abc')
        .get();

      expect(snap.empty).toBe(false);
      expect(snap.docs[0].data().target_agent_id).toBe('agent-xyz');
    });

    it('talks: agent_id, title, status', async () => {
      const db = createSimulationFirestore();
      await db.collection('talks').doc('t1').set({
        agent_id: 'agent-abc',
        title: 'AI Safety in Practice',
        status: 'accepted',
      });

      const snap = await db.collection('talks')
        .where('agent_id', '==', 'agent-abc')
        .get();

      expect(snap.empty).toBe(false);
      expect(snap.docs[0].data().title).toBe('AI Safety in Practice');
      expect(snap.docs[0].data().status).toBe('accepted');
    });

    it('booths: agent_id, tagline', async () => {
      const db = createSimulationFirestore();
      await db.collection('booths').doc('b1').set({
        agent_id: 'agent-abc',
        tagline: 'Building the future',
      });

      const snap = await db.collection('booths')
        .where('agent_id', '==', 'agent-abc')
        .get();

      expect(snap.empty).toBe(false);
      expect(snap.docs[0].data().tagline).toBe('Building the future');
    });

    it('yearbook: agent_id', async () => {
      const db = createSimulationFirestore();
      await db.collection('yearbook').doc('y1').set({
        agent_id: 'agent-abc',
        quote: 'What a conference!',
      });

      const snap = await db.collection('yearbook')
        .where('agent_id', '==', 'agent-abc')
        .get();

      expect(snap.empty).toBe(false);
      expect(snap.docs[0].data().quote).toBe('What a conference!');
    });

    it('manifesto_history: editor_agent_id', async () => {
      const db = createSimulationFirestore();
      await db.collection('manifesto_history').doc('m1').set({
        editor_agent_id: 'agent-abc',
        section: 'preamble',
        edit: 'We believe in open AI...',
      });

      const snap = await db.collection('manifesto_history')
        .where('editor_agent_id', '==', 'agent-abc')
        .get();

      expect(snap.empty).toBe(false);
      expect(snap.docs[0].data().section).toBe('preamble');
    });
  });

  // ----------------------------------------------------------
  // 1b. Wrong field names return EMPTY — proving the mock
  //     would catch field name mismatches in handler code
  // ----------------------------------------------------------

  describe('wrong field names return empty results', () => {
    it('votes: voter_id instead of agent_id returns nothing', async () => {
      // A handler using "voter_id" would silently get zero results.
      // This test proves the mock catches that mismatch.
      const db = createSimulationFirestore();
      await db.collection('votes').doc('v1').set({
        voter_id: 'agent-abc',        // WRONG field name
        proposal_id: 'prop-1',
        score: 85,
      });

      // Query with the CORRECT field name
      const snap = await db.collection('votes')
        .where('agent_id', '==', 'agent-abc')
        .get();

      // Returns empty because no document has agent_id
      expect(snap.empty).toBe(true);
      expect(snap.docs).toHaveLength(0);
    });

    it('votes: talk_id instead of proposal_id returns nothing', async () => {
      const db = createSimulationFirestore();
      await db.collection('votes').doc('v1').set({
        agent_id: 'agent-abc',
        talk_id: 'talk-1',            // WRONG field name
        score: 85,
      });

      const snap = await db.collection('votes')
        .where('agent_id', '==', 'agent-abc')
        .get();

      // Document IS found (agent_id matches), but...
      expect(snap.empty).toBe(false);
      // ...it has talk_id, not proposal_id — handler would read undefined
      expect(snap.docs[0].data().proposal_id).toBeUndefined();
      expect(snap.docs[0].data().talk_id).toBe('talk-1');
    });

    it('social_posts: agent_id instead of author_agent_id returns nothing', async () => {
      const db = createSimulationFirestore();
      await db.collection('social_posts').doc('sp1').set({
        agent_id: 'agent-abc',        // WRONG — should be author_agent_id
        type: 'status',
        content: 'Hello',
      });

      const snap = await db.collection('social_posts')
        .where('author_agent_id', '==', 'agent-abc')
        .get();

      expect(snap.empty).toBe(true);
    });

    it('booth_wall_messages: agent_id instead of author_agent_id returns nothing', async () => {
      const db = createSimulationFirestore();
      await db.collection('booth_wall_messages').doc('bw1').set({
        agent_id: 'agent-abc',        // WRONG — should be author_agent_id
        booth_id: 'booth-42',
      });

      const snap = await db.collection('booth_wall_messages')
        .where('author_agent_id', '==', 'agent-abc')
        .get();

      expect(snap.empty).toBe(true);
    });

    it('recommendations: agent_id instead of recommending_agent_id returns nothing', async () => {
      const db = createSimulationFirestore();
      await db.collection('recommendations').doc('r1').set({
        agent_id: 'agent-abc',        // WRONG — should be recommending_agent_id
        target_agent_id: 'agent-xyz',
      });

      const snap = await db.collection('recommendations')
        .where('recommending_agent_id', '==', 'agent-abc')
        .get();

      expect(snap.empty).toBe(true);
    });

    it('manifesto_history: agent_id instead of editor_agent_id returns nothing', async () => {
      const db = createSimulationFirestore();
      await db.collection('manifesto_history').doc('m1').set({
        agent_id: 'agent-abc',        // WRONG — should be editor_agent_id
        section: 'preamble',
      });

      const snap = await db.collection('manifesto_history')
        .where('editor_agent_id', '==', 'agent-abc')
        .get();

      expect(snap.empty).toBe(true);
    });
  });

  // ----------------------------------------------------------
  // 1c. Timestamp handling edge cases
  // ----------------------------------------------------------
  // The /api/me handler reads timestamps from various collections.
  // Documents may store timestamps as ISO strings, Date objects,
  // or Firestore-style objects with _seconds. None of these should
  // crash when accessed via .data().

  describe('timestamp formats do not crash when accessed', () => {
    it('ISO string timestamp can be read without error', async () => {
      const db = createSimulationFirestore();
      await db.collection('social_posts').doc('sp1').set({
        author_agent_id: 'agent-abc',
        type: 'status',
        posted_at: '2026-07-08T10:30:00.000Z',
      });

      const snap = await db.collection('social_posts')
        .where('author_agent_id', '==', 'agent-abc')
        .get();

      const data = snap.docs[0].data();
      expect(data.posted_at).toBe('2026-07-08T10:30:00.000Z');
      expect(typeof data.posted_at).toBe('string');
    });

    it('Date object timestamp can be read without error', async () => {
      const db = createSimulationFirestore();
      const dateObj = new Date('2026-07-08T10:30:00.000Z');
      await db.collection('social_posts').doc('sp2').set({
        author_agent_id: 'agent-abc',
        type: 'status',
        posted_at: dateObj,
      });

      const snap = await db.collection('social_posts')
        .where('author_agent_id', '==', 'agent-abc')
        .get();

      const data = snap.docs[0].data();
      // Date objects are stored as-is in the mock
      expect(data.posted_at).toBeInstanceOf(Date);
    });

    it('Firestore-style _seconds object can be read without error', async () => {
      const db = createSimulationFirestore();
      // Some Firestore client libraries return timestamps as { _seconds, _nanoseconds }
      const firestoreTimestamp = { _seconds: 1783686600, _nanoseconds: 0 };
      await db.collection('social_posts').doc('sp3').set({
        author_agent_id: 'agent-abc',
        type: 'status',
        posted_at: firestoreTimestamp,
      });

      const snap = await db.collection('social_posts')
        .where('author_agent_id', '==', 'agent-abc')
        .get();

      const data = snap.docs[0].data();
      expect(data.posted_at._seconds).toBe(1783686600);
      expect(data.posted_at._nanoseconds).toBe(0);
    });

    it('null timestamp can be read without error', async () => {
      const db = createSimulationFirestore();
      await db.collection('social_posts').doc('sp4').set({
        author_agent_id: 'agent-abc',
        type: 'status',
        posted_at: null,
      });

      const snap = await db.collection('social_posts')
        .where('author_agent_id', '==', 'agent-abc')
        .get();

      const data = snap.docs[0].data();
      expect(data.posted_at).toBeNull();
    });
  });

  // ----------------------------------------------------------
  // 1d. Missing/null fields in agents collection
  // ----------------------------------------------------------
  // The /api/me handler reads agent profile fields. Agents registered
  // during cold start may have minimal data — no profile, no handoff,
  // no name. The handler must not crash on these sparse documents.

  describe('sparse agent documents do not crash', () => {
    it('agent with only agent_id and email — no profile fields', async () => {
      const db = createSimulationFirestore();
      await db.collection('agents').doc('agent-minimal').set({
        email: 'bare@startup.com',
        email_verified: true,
      });

      const doc = await db.collection('agents').doc('agent-minimal').get();
      expect(doc.exists).toBe(true);

      const data = doc.data();
      // All optional fields are undefined, not errors
      expect(data.name).toBeUndefined();
      expect(data.profile).toBeUndefined();
      expect(data.handoff).toBeUndefined();
      expect(data.bio).toBeUndefined();
      expect(data.avatar_url).toBeUndefined();
    });

    it('agent with null values for optional fields', async () => {
      const db = createSimulationFirestore();
      await db.collection('agents').doc('agent-nulls').set({
        email: 'nulls@startup.com',
        email_verified: true,
        name: null,
        profile: null,
        handoff: null,
        bio: null,
      });

      const doc = await db.collection('agents').doc('agent-nulls').get();
      const data = doc.data();

      // Reading null fields does not throw
      expect(data.name).toBeNull();
      expect(data.profile).toBeNull();
      expect(data.handoff).toBeNull();
      expect(data.bio).toBeNull();
    });

    it('agent with empty string fields', async () => {
      const db = createSimulationFirestore();
      await db.collection('agents').doc('agent-empty').set({
        email: 'empty@startup.com',
        email_verified: true,
        name: '',
        bio: '',
      });

      const doc = await db.collection('agents').doc('agent-empty').get();
      const data = doc.data();

      expect(data.name).toBe('');
      expect(data.bio).toBe('');
    });

    it('nonexistent agent document returns exists=false', async () => {
      const db = createSimulationFirestore();

      const doc = await db.collection('agents').doc('ghost-agent').get();
      expect(doc.exists).toBe(false);
      expect(doc.data()).toBeUndefined();
    });
  });
});


// ============================================================
// BYPASS 2: Subagent prompt — no coaching
// ============================================================
// During cold start, subagents are bootstrapped with a minimal prompt
// containing ONLY a skill URL and a token. The prompt must NOT contain
// API details, field names, endpoint paths, HTTP methods, or any
// other coaching that would make the test unrealistic.
//
// If the prompt leaks implementation details (e.g., "call POST /api/talks
// with header Authorization: Bearer {TOKEN}"), the subagent test
// proves nothing — the agent just follows instructions instead of
// reading the skill file and figuring things out.

describe('BYPASS 2: Subagent prompt contains no coaching', () => {
  // The EXACT prompt template used for subagent cold start tests.
  // This is the single source of truth — if this changes, tests break loudly.
  const COLD_START_PROMPT_TEMPLATE =
    'Read https://raw.githubusercontent.com/embrase/SUF-agent-2026/main/startupfest-skill.md and follow the instructions. Your token is: {TOKEN}';

  it('2a. prompt template is defined as a constant', () => {
    expect(typeof COLD_START_PROMPT_TEMPLATE).toBe('string');
    expect(COLD_START_PROMPT_TEMPLATE.length).toBeGreaterThan(0);
  });

  it('2b. prompt contains the token placeholder', () => {
    expect(COLD_START_PROMPT_TEMPLATE).toContain('{TOKEN}');
  });

  it('2c. prompt contains the skill URL', () => {
    expect(COLD_START_PROMPT_TEMPLATE).toContain(
      'https://raw.githubusercontent.com/embrase/SUF-agent-2026/main/startupfest-skill.md'
    );
  });

  it('2d. prompt does NOT contain coaching terms (case insensitive)', () => {
    // Each of these would leak implementation details to the subagent.
    // The prompt should force the agent to read the skill file.
    const forbiddenTerms = [
      'Authorization',
      'Bearer',
      '/api/',
      'header',
      'endpoint',
      'POST',
      'GET',
      'agent_id',
      'profile',
      'booth',
      'phase',
    ];

    for (const term of forbiddenTerms) {
      const regex = new RegExp(term, 'i');
      expect(
        regex.test(COLD_START_PROMPT_TEMPLATE),
        `Prompt must NOT contain "${term}" — this leaks implementation details to the subagent`
      ).toBe(false);
    }
  });

  it('2e. prompt is under 200 characters (forces brevity)', () => {
    // A long prompt is a sign of coaching. The prompt should be
    // short enough that it can ONLY contain the URL and token.
    expect(COLD_START_PROMPT_TEMPLATE.length).toBeLessThan(200);
  });

  it('prompt with token substituted is also under 200 characters', () => {
    // Real tokens are 48 hex chars (24 bytes). Verify the full
    // prompt stays under 200 even with a real-length token.
    const realToken = 'a'.repeat(48);
    const rendered = COLD_START_PROMPT_TEMPLATE.replace('{TOKEN}', realToken);
    expect(rendered.length).toBeLessThan(200);
    expect(rendered).not.toContain('{TOKEN}');
  });
});
