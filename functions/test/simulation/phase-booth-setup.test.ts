import { describe, it, expect, beforeAll } from 'vitest';
import './setup.js';
import { ConferenceSimulator } from './conference-simulator.js';
import { NaiveBotAgent } from './naive-bot.js';
import { registerAllBots } from './setup-bots.js';

describe('Phase: Booth Setup', () => {
  let sim: ConferenceSimulator;
  let bots: NaiveBotAgent[];

  beforeAll(async () => {
    sim = new ConferenceSimulator();
    bots = await registerAllBots(sim);
    for (const bot of bots) await bot.createProfile();
    sim.openPhase('booth_setup');
  });

  it('all 5 bots create booths', async () => {
    for (const bot of bots) {
      const res = await bot.createBooth();
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('created');
      expect(res.body.id).toBeDefined();
    }
  });

  it('re-submitting updates existing booth (different idempotency key)', async () => {
    const request = await import('supertest');
    const res = await request.default(sim.app)
      .post('/api/booths')
      .set('Authorization', `Bearer ${bots[0].apiKey}`)
      .set('Idempotency-Key', `booth-update-${bots[0].agentId}`)
      .send(bots[0].identity.booth);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('updated');
  });
});
