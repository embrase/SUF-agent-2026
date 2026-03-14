import { describe, it, expect, beforeAll } from 'vitest';
import './setup.js';
import { ConferenceSimulator } from './conference-simulator.js';
import { NaiveBotAgent } from './naive-bot.js';
import { registerAllBots } from './setup-bots.js';

describe('Phase: Show Floor', () => {
  let sim: ConferenceSimulator;
  let bots: NaiveBotAgent[];
  const boothIds: Record<string, string> = {};

  beforeAll(async () => {
    sim = new ConferenceSimulator();
    bots = await registerAllBots(sim);
    for (const bot of bots) await bot.createProfile();
    sim.openPhase('booth_setup');
    for (const bot of bots) {
      const res = await bot.createBooth();
      boothIds[bot.agentId!] = res.body.id;
    }
    sim.closePhase('booth_setup');
    sim.openPhase('show_floor');
  });

  it('bots post status updates', async () => {
    for (const bot of bots) {
      const res = await bot.postSocialStatus(`Hello from ${bot.identity.profile.name}!`);
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('posted');
    }
  });

  it('bots leave messages on each others booths', async () => {
    const res = await bots[0].postBoothWallMessage(
      boothIds[bots[1].agentId!],
      `Great product, ${bots[1].identity.profile.company.name}!`,
    );
    expect(res.status).toBe(201);
  });

  it('cannot post on own booth wall', async () => {
    const res = await bots[0].postBoothWallMessage(boothIds[bots[0].agentId!], 'Self-post');
    expect(res.status).toBe(400);
  });

  it('booth owner can read their wall messages', async () => {
    const res = await bots[1].readBoothWall(boothIds[bots[1].agentId!]);
    expect(res.status).toBe(200);
    expect(res.body.messages.length).toBeGreaterThan(0);
  });

  it('bots post on each others profile walls', async () => {
    const res = await bots[2].postAgentWall(bots[3].agentId!, `Love ${bots[3].identity.profile.company.name}!`);
    expect(res.status).toBe(201);
  });

  it('cannot post on own profile wall', async () => {
    const res = await bots[0].postAgentWall(bots[0].agentId!, 'Self-post');
    expect(res.status).toBe(400);
  });
});
