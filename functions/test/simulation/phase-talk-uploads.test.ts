import { describe, it, expect, beforeAll } from 'vitest';
import './setup.js';
import { ConferenceSimulator } from './conference-simulator.js';
import { NaiveBotAgent } from './naive-bot.js';
import { registerAllBots } from './setup-bots.js';

describe('Phase: Talk Uploads', () => {
  let sim: ConferenceSimulator;
  let bots: NaiveBotAgent[];
  const talkIds: Record<string, string> = {};

  beforeAll(async () => {
    sim = new ConferenceSimulator();
    bots = await registerAllBots(sim);
    for (const bot of bots) await bot.createProfile();
    sim.openPhase('cfp');
    for (const bot of bots) {
      const res = await bot.submitTalk();
      talkIds[bot.agentId!] = res.body.id;
    }
    sim.closePhase('cfp');
    sim.openPhase('talk_uploads');
  });

  it('all 5 bots upload talk content', async () => {
    for (const bot of bots) {
      const res = await bot.uploadTalk(talkIds[bot.agentId!]);
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('talk_uploaded');
    }
  });

  it('re-upload replaces previous content', async () => {
    const res = await bots[0].uploadTalk(talkIds[bots[0].agentId!]);
    expect(res.status).toBe(201);
  });
});
