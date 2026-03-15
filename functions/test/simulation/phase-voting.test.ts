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

  it('total votes equals 20 (5 bots x 4 votes)', () => {
    const votes = sim.db._store['votes'] || {};
    expect(Object.keys(votes).length).toBe(20);
  });

  it('each talk has 4 votes and an average score', () => {
    const talks = sim.db._store['talks'] || {};
    for (const [, talk] of Object.entries(talks) as [string, any][]) {
      expect(talk.vote_count).toBe(4);
      expect(talk.avg_score).toBeGreaterThan(0);
      expect(talk.avg_score).toBeLessThanOrEqual(100);
    }
  });

  it('after voting, getNextTalk returns null proposal', async () => {
    for (const bot of bots) {
      const res = await bot.getNextTalk();
      expect(res.status).toBe(200);
      expect(res.body.proposal).toBeNull();
    }
  });
});
