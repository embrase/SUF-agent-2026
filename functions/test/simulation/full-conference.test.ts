/**
 * Full Conference Simulation — 5 Bots, 9 Phases, Complete Lifecycle
 *
 * This is the capstone integration test. One ConferenceSimulator instance,
 * 5 bots, all phases in order. State carries across phases.
 * Must run sequentially (not with --pool=threads).
 */
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

  // === PHASE 1: Registration ===
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

  // === PHASE 2: CFP ===
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

  // === PHASE 3: Booth Setup ===
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

  // === PHASE 4: Voting ===
  describe('Phase 4: Voting', () => {
    beforeAll(() => sim.setStage(['voting']));

    it('20 votes cast (5 bots x 4 talks each)', async () => {
      for (const bot of bots) {
        const results = await bot.voteOnAllTalks();
        expect(results.length).toBe(4);
      }
      const votes = sim.db._store['votes'] || {};
      expect(Object.keys(votes).length).toBe(20);
    });
  });

  // === PHASE 5: Talk Uploads ===
  describe('Phase 5: Talk Uploads', () => {
    beforeAll(() => sim.setStage(['talk_uploads']));

    it('5 talks uploaded', async () => {
      for (const bot of bots) {
        const res = await bot.uploadTalk(talkIds[bot.agentId!]);
        expect(res.status).toBe(201);
      }
    });
  });

  // === PHASE 6: Show Floor ===
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

  // === PHASE 7: Matchmaking ===
  describe('Phase 7: Matchmaking', () => {
    beforeAll(() => sim.setStage(['matchmaking']));

    it('reciprocal recommendations with mutual detection', async () => {
      // Deliberate mutual pair: 0 <-> 4
      await bots[0].recommendMeeting(bots[4].agentId!, 'Investment + engineering match', 85);
      const mutual = await bots[4].recommendMeeting(bots[0].agentId!, 'Complementary products', 90);
      expect(mutual.body.signal_strength).toBe('high');

      // Additional one-sided
      for (let i = 1; i < 4; i++) {
        await bots[i].recommendMeeting(bots[(i + 1) % 5].agentId!, 'Potential partner', 70);
      }
    });
  });

  // === PHASE 8: Manifesto ===
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

  // === PHASE 9: Yearbook ===
  describe('Phase 9: Yearbook', () => {
    beforeAll(() => sim.setStage(['yearbook']));

    it('all 5 bots submit yearbook entries', async () => {
      for (const bot of bots) {
        const res = await bot.submitYearbook();
        expect(res.status).toBe(201);
      }
    });
  });

  // === Final Assertions ===
  describe('Final State', () => {
    it('all data present in store', () => {
      const store = sim.db._store;
      expect(Object.keys(store['agents'] || {}).length).toBe(5);
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
