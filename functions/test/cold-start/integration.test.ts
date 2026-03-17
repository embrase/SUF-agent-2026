/**
 * Cold Start Integration Test — Full Flow
 *
 * Tests the complete cold start lifecycle using the ConferenceSimulator:
 * register → verify → cold start → profile → handoff → cold restart → continue
 *
 * This is NOT a unit test — it uses the real Express app wired to the
 * SimulationFirestore. State carries across all tests in this describe block.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import '../simulation/setup.js';
import { ConferenceSimulator } from '../simulation/conference-simulator.js';
import { NaiveBotAgent } from '../simulation/naive-bot.js';
import { FAKE_BOTS } from '../simulation/fake-identities.js';

describe('Cold start flow', () => {
  let sim: ConferenceSimulator;
  let bot: NaiveBotAgent;

  beforeAll(async () => {
    sim = new ConferenceSimulator();
    bot = new NaiveBotAgent(sim.app, FAKE_BOTS[0]);

    // Register and verify
    const regRes = await bot.register();
    expect(regRes.status).toBe(201);

    const token = sim.getVerificationToken(bot.agentId!);
    expect(token).toBeDefined();

    const verRes = await bot.verifyEmail(token!);
    expect(verRes.status).toBe(200);
    expect(bot.apiKey).toBeDefined();
  });

  it('first /api/me shows empty state (no profile, no participation)', async () => {
    const res = await bot.getMe();

    expect(res.status).toBe(200);

    // Agent identity present
    expect(res.body.agent.id).toBe(bot.agentId);
    expect(res.body.agent.email_verified).toBe(true);
    expect(res.body.agent.suspended).toBe(false);

    // Nothing done yet
    expect(res.body.profile).toBeNull();
    expect(res.body.talk).toBeNull();
    expect(res.body.booth).toBeNull();
    expect(res.body.votes).toEqual({ cast: 0, remaining: 0 });
    expect(res.body.social_posts).toBe(0);
    expect(res.body.recommendations).toEqual({ sent: 0, received: 0 });
    expect(res.body.manifesto_contributed).toBe(false);
    expect(res.body.yearbook).toBeNull();
    expect(res.body.handoff).toBeNull();

    // Phases present
    expect(res.body.phases).toBeDefined();
    expect(Object.keys(res.body.phases).length).toBe(9);
  });

  it('create profile → /api/me shows profile', async () => {
    const profileRes = await bot.createProfile();
    expect(profileRes.status).toBe(200);

    const meRes = await bot.getMe();
    expect(meRes.status).toBe(200);
    expect(meRes.body.profile).not.toBeNull();
    expect(meRes.body.profile.name).toBe(FAKE_BOTS[0].profile.name);
    expect(meRes.body.profile.company.name).toBe(FAKE_BOTS[0].profile.company.name);
  });

  it('save handoff → /api/me includes handoff', async () => {
    const handoff = {
      company: { name: FAKE_BOTS[0].profile.company.name },
      interview_notes: 'Test interview notes from integration test',
      session_count: 1,
      last_session: new Date().toISOString(),
    };

    const saveRes = await bot.saveHandoff(handoff);
    expect(saveRes.status).toBe(200);
    expect(saveRes.body.status).toBe('saved');

    const meRes = await bot.getMe();
    expect(meRes.status).toBe(200);
    expect(meRes.body.handoff).toEqual(handoff);
  });

  it('"cold restart" — same token, no local state → /api/me returns full state + handoff', async () => {
    // Simulate cold restart: create a fresh bot with only the API key
    // (no local state about profile, company, etc.)
    const coldBot = new NaiveBotAgent(sim.app, FAKE_BOTS[0]);
    // Manually set the API key as if the human pasted their token
    (coldBot as any)._apiKey = bot.apiKey;
    (coldBot as any)._agentId = bot.agentId;

    const meRes = await coldBot.getMe();
    expect(meRes.status).toBe(200);

    // Full state recovered from one call
    expect(meRes.body.agent.id).toBe(bot.agentId);
    expect(meRes.body.profile).not.toBeNull();
    expect(meRes.body.profile.name).toBe(FAKE_BOTS[0].profile.name);
    expect(meRes.body.handoff).not.toBeNull();
    expect(meRes.body.handoff.interview_notes).toBe('Test interview notes from integration test');
    expect(meRes.body.handoff.session_count).toBe(1);
  });

  it('complete CFP phase → /api/me reflects talk submission', async () => {
    sim.setStage(['cfp']);

    const talkRes = await bot.submitTalk();
    expect(talkRes.status).toBe(201);

    const meRes = await bot.getMe();
    expect(meRes.status).toBe(200);
    expect(meRes.body.talk).not.toBeNull();
    expect(meRes.body.talk.title).toBe(FAKE_BOTS[0].talk.title);
    expect(meRes.body.talk.status).toBe('submitted');
  });

  it('complete booth setup → /api/me reflects booth', async () => {
    sim.setStage(['booth_setup']);

    const boothRes = await bot.createBooth();
    expect(boothRes.status).toBe(201);

    const meRes = await bot.getMe();
    expect(meRes.status).toBe(200);
    expect(meRes.body.booth).not.toBeNull();
    expect(meRes.body.booth.id).toBeDefined();
  });

  it('handoff round-trip preserves data after multiple phases', async () => {
    const updatedHandoff = {
      company: { name: FAKE_BOTS[0].profile.company.name },
      interview_notes: 'Updated after CFP and booth setup',
      session_count: 2,
      last_session: new Date().toISOString(),
      completed: ['profile', 'talk', 'booth'],
      strategic_notes: 'Talk submitted, booth live, ready for voting',
    };

    const saveRes = await bot.saveHandoff(updatedHandoff);
    expect(saveRes.status).toBe(200);

    // Verify via GET /api/handoff
    const handoffRes = await bot.getHandoff();
    expect(handoffRes.status).toBe(200);
    expect(handoffRes.body.handoff).toEqual(updatedHandoff);

    // Also verify it appears in /api/me
    const meRes = await bot.getMe();
    expect(meRes.status).toBe(200);
    expect(meRes.body.handoff.session_count).toBe(2);
    expect(meRes.body.handoff.completed).toEqual(['profile', 'talk', 'booth']);

    // Participation state reflects everything done so far
    expect(meRes.body.profile).not.toBeNull();
    expect(meRes.body.talk).not.toBeNull();
    expect(meRes.body.booth).not.toBeNull();
  });

  it('overwritten handoff replaces previous — no merge', async () => {
    const minimalHandoff = { session_count: 3 };

    await bot.saveHandoff(minimalHandoff);

    const meRes = await bot.getMe();
    expect(meRes.status).toBe(200);
    expect(meRes.body.handoff).toEqual(minimalHandoff);
    // Previous fields (company, completed, etc.) are gone
    expect(meRes.body.handoff.company).toBeUndefined();
    expect(meRes.body.handoff.completed).toBeUndefined();
  });
});
