import { describe, it, expect, beforeAll } from 'vitest';
import './setup.js';
import { ConferenceSimulator } from './conference-simulator.js';
import { NaiveBotAgent } from './naive-bot.js';
import { FAKE_BOTS } from './fake-identities.js';
import { registerAllBots } from './setup-bots.js';

describe('Phase: Registration + Verification + Profile', () => {
  let sim: ConferenceSimulator;
  let bots: NaiveBotAgent[];

  beforeAll(async () => {
    sim = new ConferenceSimulator();
    bots = await registerAllBots(sim);
  });

  it('all 5 bots registered successfully', () => {
    expect(bots).toHaveLength(5);
    for (const bot of bots) {
      expect(bot.agentId).toBeDefined();
      expect(bot.apiKey).toBeDefined();
    }
  });

  it('all agent IDs are unique', () => {
    const ids = bots.map(b => b.agentId);
    expect(new Set(ids).size).toBe(5);
  });

  it('all bots can create profiles', async () => {
    for (const bot of bots) {
      const res = await bot.createProfile();
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('updated');
    }
  });

  it('all bots can read their own profile back', async () => {
    for (const bot of bots) {
      const res = await bot.getMe();
      expect(res.status).toBe(200);
      expect(res.body.profile.name).toBe(bot.identity.profile.name);
      expect(res.body.profile.company.name).toBe(bot.identity.profile.company.name);
    }
  });

  it('duplicate registration is rejected', async () => {
    const dupeBot = new NaiveBotAgent(sim.app, FAKE_BOTS[0]);
    const res = await dupeBot.register();
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('already_exists');
  });

  it('unauthenticated request to /api/me is rejected', async () => {
    const res = await new NaiveBotAgent(sim.app, FAKE_BOTS[0]).getMe();
    expect(res.status).toBe(401);
  });
});
