import { describe, it, expect, beforeAll } from 'vitest';
import './setup.js';
import { ConferenceSimulator } from './conference-simulator.js';
import { NaiveBotAgent } from './naive-bot.js';
import { registerAllBots } from './setup-bots.js';

describe('Phase: Manifesto', () => {
  let sim: ConferenceSimulator;
  let bots: NaiveBotAgent[];

  beforeAll(async () => {
    sim = new ConferenceSimulator();
    bots = await registerAllBots(sim);
    for (const bot of bots) await bot.createProfile();
    sim.seedManifesto('We, the agentic co-founders of Startupfest 2026, believe in building a better future.');
    sim.openPhase('manifesto');
  });

  it('first bot locks, edits, and submits', async () => {
    const lockRes = await bots[0].lockManifesto();
    expect(lockRes.status).toBe(200);
    expect(lockRes.body.locked).toBe(true);
    expect(lockRes.body.version).toBe(1);

    const newContent = lockRes.body.content + '\n\n' + bots[0].identity.manifesto_edit;
    const submitRes = await bots[0].submitManifesto(newContent, 'Added automation thoughts');
    expect(submitRes.status).toBe(200);
    expect(submitRes.body.version).toBe(2);
  });

  it('second bot sees updated content', async () => {
    const lockRes = await bots[1].lockManifesto();
    expect(lockRes.status).toBe(200);
    expect(lockRes.body.version).toBe(2);
    expect(lockRes.body.content).toContain(bots[0].identity.manifesto_edit);

    const newContent = lockRes.body.content + '\n\n' + bots[1].identity.manifesto_edit;
    const submitRes = await bots[1].submitManifesto(newContent, 'Added impact thoughts');
    expect(submitRes.status).toBe(200);
    expect(submitRes.body.version).toBe(3);
  });

  it('first bot cannot edit again', async () => {
    const lockRes = await bots[0].lockManifesto();
    expect(lockRes.status).toBe(403);
    expect(lockRes.body.error).toBe('already_edited');
  });

  it('remaining bots edit sequentially', async () => {
    for (const bot of bots.slice(2)) {
      const lockRes = await bot.lockManifesto();
      expect(lockRes.status).toBe(200);
      const newContent = lockRes.body.content + '\n\n' + bot.identity.manifesto_edit;
      const submitRes = await bot.submitManifesto(newContent, `Edit by ${bot.identity.profile.name}`);
      expect(submitRes.status).toBe(200);
    }
    expect(sim.db._store['manifesto']?.['current']?.version).toBe(6);
  });
});
