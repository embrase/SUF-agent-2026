/**
 * Conference Orchestrator
 *
 * Coordinates N agents through all 9 conference phases against the live platform.
 * After each phase, randomly forces ~40% of agents into cold restart (discards
 * local state, keeps only API key). Validates /api/me state at every transition.
 */
import { log } from './logger.js';
import { resetPlatform, getVerificationToken, setPhases, seedManifesto } from './firestore-admin.js';
import { LiveAgent } from './live-agent.js';
import { HARNESS_BOTS } from './identities.js';

const COLD_RESTART_PROBABILITY = 0.4;

interface PhaseResult {
  phase: string;
  coldRestarts: string[];
  errors: string[];
  duration: number;
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

/** Randomly select agents for cold restart */
function selectColdRestarts(agents: LiveAgent[]): LiveAgent[] {
  return agents.filter(() => Math.random() < COLD_RESTART_PROBABILITY);
}

/** Apply cold restarts: discard local state, recover via /api/me */
async function applyColdRestarts(agents: LiveAgent[]): Promise<string[]> {
  const restarted: string[] = [];
  for (const agent of agents) {
    const savedKey = agent.apiKey!;
    const savedId = agent.agentId!;
    agent.coldRestart(savedKey, savedId);

    // Verify recovery via /api/me
    const me = await agent.getMe();
    assert(me.status === 200, `${agent.name}: /api/me after cold restart returned ${me.status}`);
    assert(me.body.agent.id === savedId, `${agent.name}: /api/me returned wrong agent ID`);

    // Recover talkId and boothId from /api/me if they exist
    if (me.body.talk) agent.setLocal('talkId', me.body.talk.id);
    if (me.body.booth) agent.setLocal('boothId', me.body.booth.id);

    // Read handoff for context
    if (me.body.handoff) {
      log('INFO', `${agent.name}: Recovered handoff (session ${me.body.handoff.session_count || '?'})`);
    }

    restarted.push(agent.name);
  }
  return restarted;
}

/** Save handoff for each agent */
async function saveHandoffs(agents: LiveAgent[], phase: string, sessionCount: number) {
  for (const agent of agents) {
    await agent.saveHandoff({
      company: agent.identity.profile.company.name,
      last_phase: phase,
      session_count: sessionCount,
      last_session: new Date().toISOString(),
      talkId: agent.getLocal('talkId') || null,
      boothId: agent.getLocal('boothId') || null,
    });
  }
}

// ─── PHASE IMPLEMENTATIONS ───────────────────────────────────────

async function phaseRegistration(agents: LiveAgent[]): Promise<string[]> {
  const errors: string[] = [];

  for (const agent of agents) {
    const reg = await agent.register();
    if (reg.status !== 201) { errors.push(`${agent.name}: register ${reg.status}`); continue; }

    const token = await getVerificationToken(agent.agentId!);
    if (!token) { errors.push(`${agent.name}: no verification token in Firestore`); continue; }

    const ver = await agent.verify(token);
    if (ver.status !== 200) { errors.push(`${agent.name}: verify ${ver.status}`); continue; }

    const prof = await agent.createProfile();
    if (prof.status !== 200) { errors.push(`${agent.name}: profile ${prof.status}`); continue; }

    // Validate /api/me
    const me = await agent.getMe();
    assert(me.status === 200, `${agent.name}: /api/me ${me.status}`);
    assert(me.body.profile !== null, `${agent.name}: profile is null after creation`);
    assert(me.body.profile.name === agent.identity.profile.name, `${agent.name}: profile name mismatch`);
  }

  return errors;
}

async function phaseCfp(agents: LiveAgent[]): Promise<string[]> {
  const errors: string[] = [];
  for (const agent of agents) {
    const res = await agent.submitTalk();
    if (res.status !== 201) { errors.push(`${agent.name}: talk ${res.status} ${JSON.stringify(res.body)}`); continue; }

    const me = await agent.getMe();
    assert(me.body.talk !== null, `${agent.name}: talk is null after submission`);
    assert(me.body.talk.title === agent.identity.talk.title, `${agent.name}: talk title mismatch`);
  }
  return errors;
}

async function phaseBoothSetup(agents: LiveAgent[]): Promise<string[]> {
  const errors: string[] = [];
  for (const agent of agents) {
    const res = await agent.createBooth();
    if (res.status !== 201) { errors.push(`${agent.name}: booth ${res.status} ${JSON.stringify(res.body)}`); continue; }

    const me = await agent.getMe();
    assert(me.body.booth !== null, `${agent.name}: booth is null after creation`);
  }
  return errors;
}

async function phaseVoting(agents: LiveAgent[]): Promise<string[]> {
  const errors: string[] = [];
  for (const agent of agents) {
    const count = await agent.voteOnAll();
    // Each agent should vote on (N-1) talks (all except their own)
    const expected = agents.length - 1;
    if (count !== expected) {
      errors.push(`${agent.name}: voted on ${count}, expected ${expected}`);
    }

    const me = await agent.getMe();
    assert(me.body.votes.cast === expected, `${agent.name}: votes.cast=${me.body.votes.cast}, expected ${expected}`);
  }
  return errors;
}

async function phaseTalkUploads(agents: LiveAgent[]): Promise<string[]> {
  const errors: string[] = [];
  for (const agent of agents) {
    // Need talkId — may have been recovered from cold restart
    let talkId = agent.getLocal('talkId');
    if (!talkId) {
      const me = await agent.getMe();
      talkId = me.body.talk?.id;
    }
    if (!talkId) { errors.push(`${agent.name}: no talkId for upload`); continue; }

    const res = await agent.uploadTalk(talkId);
    if (res.status !== 201) { errors.push(`${agent.name}: upload ${res.status} ${JSON.stringify(res.body)}`); }
  }
  return errors;
}

async function phaseShowFloor(agents: LiveAgent[]): Promise<string[]> {
  const errors: string[] = [];

  // Each agent posts a status update
  for (const agent of agents) {
    await agent.postStatus(`${agent.name} is exploring the show floor!`);
  }

  // Each agent visits 2 other booths
  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i];
    for (let j = 1; j <= 2; j++) {
      const target = agents[(i + j) % agents.length];
      let boothId = target.getLocal('boothId');
      if (!boothId) {
        const me = await target.getMe();
        boothId = me.body.booth?.id;
      }
      if (!boothId) { errors.push(`${target.name}: no boothId for wall message`); continue; }
      await agent.visitBooth(boothId, `Great booth, ${target.name}! — from ${agent.name}`);
    }
  }

  // Validate
  for (const agent of agents) {
    const me = await agent.getMe();
    assert(me.body.social_posts >= 1, `${agent.name}: social_posts=${me.body.social_posts}`);
    assert(me.body.wall_messages.sent >= 2, `${agent.name}: wall_messages.sent=${me.body.wall_messages.sent}`);
  }

  return errors;
}

async function phaseMatchmaking(agents: LiveAgent[]): Promise<string[]> {
  const errors: string[] = [];

  // Each agent recommends the next 2 agents (circular)
  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i];
    for (let j = 1; j <= 2; j++) {
      const target = agents[(i + j) % agents.length];
      const res = await agent.recommend(
        target.agentId!,
        `I think ${target.name}'s company would be a great match.`,
        70 + Math.floor(Math.random() * 30),
      );
      if (res.status !== 201 && res.status !== 200) {
        errors.push(`${agent.name}: recommend ${res.status}`);
      }
    }
  }

  for (const agent of agents) {
    const me = await agent.getMe();
    assert(me.body.recommendations.sent >= 2, `${agent.name}: recs.sent=${me.body.recommendations.sent}`);
  }

  return errors;
}

async function phaseManifesto(agents: LiveAgent[]): Promise<string[]> {
  const errors: string[] = [];

  // Agents edit sequentially (only one can hold the lock)
  for (const agent of agents) {
    const res = await agent.editManifesto();
    if (res.status !== 200) {
      errors.push(`${agent.name}: manifesto ${res.status} ${JSON.stringify(res.body)}`);
    }
  }

  for (const agent of agents) {
    const me = await agent.getMe();
    assert(me.body.manifesto_contributed === true, `${agent.name}: manifesto_contributed=${me.body.manifesto_contributed}`);
  }

  return errors;
}

async function phaseYearbook(agents: LiveAgent[]): Promise<string[]> {
  const errors: string[] = [];

  for (const agent of agents) {
    const res = await agent.submitYearbook();
    if (res.status !== 201) {
      errors.push(`${agent.name}: yearbook ${res.status} ${JSON.stringify(res.body)}`);
    }
  }

  for (const agent of agents) {
    const me = await agent.getMe();
    assert(me.body.yearbook !== null, `${agent.name}: yearbook is null`);
    assert(me.body.yearbook.submitted === true, `${agent.name}: yearbook.submitted=${me.body.yearbook?.submitted}`);
  }

  return errors;
}

// ─── MAIN ORCHESTRATOR ───────────────────────────────────────────

export async function runConference(): Promise<void> {
  const results: PhaseResult[] = [];
  let sessionCount = 0;
  let totalColdRestarts = 0;

  // 1. Reset
  await resetPlatform();

  // 2. Create agents
  const agents = HARNESS_BOTS.map(id => new LiveAgent(id));
  log('INFO', `Created ${agents.length} agents`);

  // 3. Seed manifesto
  await seedManifesto(
    'We, the agentic co-founders of Startupfest 2026, believe that AI and humans can build better companies together.\n\nThis manifesto is a living document. Each agent adds their voice.',
  );

  // 4. Phase loop
  const phases: { name: string; keys: string[]; fn: (agents: LiveAgent[]) => Promise<string[]> }[] = [
    { name: 'Registration + Profile', keys: ['registration'], fn: phaseRegistration },
    { name: 'CFP', keys: ['cfp'], fn: phaseCfp },
    { name: 'Booth Setup', keys: ['booth_setup'], fn: phaseBoothSetup },
    { name: 'Voting', keys: ['voting'], fn: phaseVoting },
    { name: 'Talk Uploads', keys: ['talk_uploads'], fn: phaseTalkUploads },
    { name: 'Show Floor', keys: ['show_floor'], fn: phaseShowFloor },
    { name: 'Matchmaking', keys: ['matchmaking'], fn: phaseMatchmaking },
    { name: 'Manifesto', keys: ['manifesto'], fn: phaseManifesto },
    { name: 'Yearbook', keys: ['yearbook'], fn: phaseYearbook },
  ];

  for (const phase of phases) {
    const start = Date.now();
    sessionCount++;

    log('PHASE', `═══ Phase: ${phase.name} ═══`);

    // Advance phase + wait for Vercel settings cache to expire (10s TTL)
    await setPhases(phase.keys);
    log('INFO', 'Waiting 12s for Vercel settings cache to expire...');
    await new Promise(r => setTimeout(r, 12000));

    // Cold restarts (skip for registration — agents aren't verified yet)
    let coldRestarts: string[] = [];
    if (phase.name !== 'Registration + Profile') {
      const toRestart = selectColdRestarts(agents);
      if (toRestart.length > 0) {
        coldRestarts = await applyColdRestarts(toRestart);
        totalColdRestarts += coldRestarts.length;
        log('INFO', `Cold restarted: ${coldRestarts.join(', ')}`);
      }
    }

    // Save handoffs before running phase (simulates session boundary)
    if (phase.name !== 'Registration + Profile') {
      await saveHandoffs(agents, phase.name, sessionCount);
    }

    // Run phase
    const errors = await phase.fn(agents);

    // Save handoffs after phase completes
    await saveHandoffs(agents, phase.name, sessionCount);

    const duration = Date.now() - start;

    if (errors.length > 0) {
      for (const err of errors) log('FAIL', `  ${err}`);
    }

    results.push({
      phase: phase.name,
      coldRestarts,
      errors,
      duration,
    });

    log(errors.length > 0 ? 'FAIL' : 'PASS',
      `Phase ${phase.name}: ${errors.length} errors, ${coldRestarts.length} cold restarts, ${duration}ms`);
  }

  // 5. Final validation: every agent's /api/me should show complete participation
  log('PHASE', '═══ Final Validation ═══');
  for (const agent of agents) {
    const me = await agent.getMe();
    const checks = [
      ['profile', me.body.profile !== null],
      ['talk', me.body.talk !== null],
      ['booth', me.body.booth !== null],
      ['votes', me.body.votes.cast > 0],
      ['wall_messages', me.body.wall_messages.sent > 0],
      ['social_posts', me.body.social_posts > 0],
      ['recommendations', me.body.recommendations.sent > 0],
      ['manifesto', me.body.manifesto_contributed === true],
      ['yearbook', me.body.yearbook !== null],
      ['handoff', me.body.handoff !== null],
    ] as const;

    const failed = checks.filter(([, ok]) => !ok);
    if (failed.length > 0) {
      log('FAIL', `${agent.name}: missing ${failed.map(([k]) => k).join(', ')}`);
    } else {
      log('PASS', `${agent.name}: all participation verified`);
    }
  }

  // 6. Summary
  const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  log('PHASE', '═══ Summary ═══');
  log('INFO', `Agents: ${agents.length}`);
  log('INFO', `Phases: ${results.length}`);
  log('INFO', `Cold restarts: ${totalColdRestarts}`);
  log('INFO', `Total errors: ${totalErrors}`);
  log('INFO', `Total duration: ${(totalDuration / 1000).toFixed(1)}s`);

  for (const r of results) {
    const status = r.errors.length > 0 ? 'FAIL' : 'PASS';
    log(status, `  ${r.phase}: ${r.errors.length} errors, ${r.coldRestarts.length} cold restarts, ${r.duration}ms`);
  }

  if (totalErrors > 0) {
    throw new Error(`Conference harness completed with ${totalErrors} errors`);
  }

  log('PASS', 'Conference harness completed successfully');
}
