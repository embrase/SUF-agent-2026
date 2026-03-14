/**
 * Shared setup: register and verify all 5 bots against a ConferenceSimulator.
 */
import { ConferenceSimulator } from './conference-simulator.js';
import { NaiveBotAgent } from './naive-bot.js';
import { FAKE_BOTS } from './fake-identities.js';

export async function registerAllBots(sim: ConferenceSimulator): Promise<NaiveBotAgent[]> {
  const bots: NaiveBotAgent[] = [];
  for (const identity of FAKE_BOTS) {
    const bot = new NaiveBotAgent(sim.app, identity);
    const regRes = await bot.register();
    if (regRes.status !== 201) {
      throw new Error(`Registration failed for ${identity.email}: ${regRes.status} ${JSON.stringify(regRes.body)}`);
    }
    const token = sim.getVerificationToken(bot.agentId!);
    if (!token) {
      throw new Error(`No verification token for ${identity.email}`);
    }
    const verRes = await bot.verifyEmail(token);
    if (verRes.status !== 200) {
      throw new Error(`Verification failed for ${identity.email}: ${verRes.status} ${JSON.stringify(verRes.body)}`);
    }
    bots.push(bot);
  }
  return bots;
}
