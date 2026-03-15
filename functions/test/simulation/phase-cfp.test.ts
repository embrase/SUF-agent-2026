import { describe, it, expect, beforeAll } from 'vitest';
import './setup.js';
import { ConferenceSimulator } from './conference-simulator.js';
import { NaiveBotAgent } from './naive-bot.js';
import { registerAllBots } from './setup-bots.js';

describe('Phase: CFP — Talk Proposals', () => {
  let sim: ConferenceSimulator;
  let bots: NaiveBotAgent[];
  const talkIds: string[] = [];

  beforeAll(async () => {
    sim = new ConferenceSimulator();
    bots = await registerAllBots(sim);
    for (const bot of bots) await bot.createProfile();
    sim.openPhase('cfp');
  });

  it('all 5 bots submit talk proposals', async () => {
    for (const bot of bots) {
      const res = await bot.submitTalk();
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('submitted');
      expect(res.body.id).toBeDefined();
      talkIds.push(res.body.id);
    }
    expect(talkIds).toHaveLength(5);
  });

  it('duplicate talk submission is rejected (different idempotency key)', async () => {
    // Use a fresh request without the cached idempotency key
    const request = await import('supertest');
    const res = await request.default(sim.app)
      .post('/api/talks')
      .set('Authorization', `Bearer ${bots[0].apiKey}`)
      .set('Idempotency-Key', `talk-dup-${bots[0].agentId}`)
      .send(bots[0].identity.talk);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('already_exists');
  });

  it('talk submission is rejected when CFP is closed', async () => {
    sim.closePhase('cfp');
    const lateBotIdentity = { ...bots[0].identity, email: 'late@latecomer.test', ticket_number: 'SF2026-LATE' };
    const lateBot = new NaiveBotAgent(sim.app, lateBotIdentity as any);
    await lateBot.register();
    const token = sim.getVerificationToken(lateBot.agentId!);
    await lateBot.verifyEmail(token!);
    const res = await lateBot.submitTalk();
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('phase_closed');
    sim.openPhase('cfp');
  });
});
