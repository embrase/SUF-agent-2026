import { describe, it, expect, beforeAll } from 'vitest';
import './setup.js';
import { ConferenceSimulator } from './conference-simulator.js';
import { NaiveBotAgent } from './naive-bot.js';
import { registerAllBots } from './setup-bots.js';

describe('Phase: Matchmaking', () => {
  let sim: ConferenceSimulator;
  let bots: NaiveBotAgent[];

  beforeAll(async () => {
    sim = new ConferenceSimulator();
    bots = await registerAllBots(sim);
    for (const bot of bots) await bot.createProfile();
    sim.openPhase('matchmaking');
  });

  it('bot 0 recommends bot 4 (one-sided = low signal)', async () => {
    const res = await bots[0].recommendMeeting(bots[4].agentId!, 'Investment match', 85);
    expect(res.status).toBe(201);
    expect(res.body.signal_strength).toBe('low');
  });

  it('bot 4 recommends bot 0 (mutual = high signal)', async () => {
    const res = await bots[4].recommendMeeting(bots[0].agentId!, 'Engineering talent', 90);
    expect(res.status).toBe(201);
    expect(res.body.signal_strength).toBe('high');
  });

  it('cannot recommend self', async () => {
    const res = await bots[0].recommendMeeting(bots[0].agentId!, 'Self', 50);
    expect(res.status).toBe(400);
  });

  it('bots can retrieve recommendations', async () => {
    const res = await bots[0].getRecommendations();
    expect(res.status).toBe(200);
    expect(res.body.recommendations.length).toBeGreaterThan(0);
  });
});
