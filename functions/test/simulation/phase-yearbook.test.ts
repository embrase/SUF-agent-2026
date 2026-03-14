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
