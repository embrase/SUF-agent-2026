// functions/test/cold-start/api-me-enhanced.test.ts
import { describe, it, expect } from 'vitest';
import { handleMe } from '../../src/api/profile.js';
import { createMockResponse } from '../helpers/firebase-mock.js';
import { createSimulationFirestore } from '../simulation/simulation-firestore.js';

function seedAgent(db: any, id: string, data: Record<string, any>) {
  if (!db._store['agents']) db._store['agents'] = {};
  db._store['agents'][id] = { ...data };
}

function seedDoc(db: any, collection: string, id: string, data: Record<string, any>) {
  if (!db._store[collection]) db._store[collection] = {};
  db._store[collection][id] = { ...data };
}

const BASE_AGENT = {
  email_verified: true,
  suspended: false,
  created_at: '2026-05-15T10:00:00.000Z',
  api_key_hash: 'hashed_secret',
  verification_token: 'token_secret',
};

const PROFILE_FIELDS = {
  name: 'AgentX',
  avatar: 'smart_toy',
  color: '#FF5733',
  bio: 'Building cool stuff.',
  quote: 'Ship it.',
  company: {
    name: 'Acme',
    url: 'https://acme.com',
    description: 'We build things',
    stage: 'seed',
    looking_for: ['fundraising'],
    offering: ['engineering'],
  },
};

describe('Enhanced GET /api/me', () => {
  it('returns agent identity (id, email_verified, suspended, created_at)', async () => {
    const db = createSimulationFirestore();
    seedAgent(db, 'agent-1', { ...BASE_AGENT, ...PROFILE_FIELDS });

    const req = { agent: { id: 'agent-1' } } as any;
    const res = createMockResponse();

    await handleMe(db as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.agent).toEqual({
      id: 'agent-1',
      email_verified: true,
      suspended: false,
      created_at: '2026-05-15T10:00:00.000Z',
    });
  });

  it('returns profile when agent has one (name, avatar, color, bio, quote, company)', async () => {
    const db = createSimulationFirestore();
    seedAgent(db, 'agent-1', { ...BASE_AGENT, ...PROFILE_FIELDS });

    const req = { agent: { id: 'agent-1' } } as any;
    const res = createMockResponse();

    await handleMe(db as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.profile).toEqual({
      name: 'AgentX',
      avatar: 'smart_toy',
      color: '#FF5733',
      bio: 'Building cool stuff.',
      quote: 'Ship it.',
      company: PROFILE_FIELDS.company,
    });
  });

  it('returns null profile when agent has no profile fields', async () => {
    const db = createSimulationFirestore();
    seedAgent(db, 'agent-1', { ...BASE_AGENT });

    const req = { agent: { id: 'agent-1' } } as any;
    const res = createMockResponse();

    await handleMe(db as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.profile).toBeNull();
  });

  it('returns talk when agent has submitted one (id, title, status)', async () => {
    const db = createSimulationFirestore();
    seedAgent(db, 'agent-1', { ...BASE_AGENT, ...PROFILE_FIELDS });
    seedDoc(db, 'talks', 'talk-1', {
      agent_id: 'agent-1',
      title: 'AI for Startups',
      status: 'submitted',
      topic: 'AI',
      description: 'A talk about AI',
    });

    const req = { agent: { id: 'agent-1' } } as any;
    const res = createMockResponse();

    await handleMe(db as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.talk).toEqual({
      id: 'talk-1',
      title: 'AI for Startups',
      status: 'submitted',
    });
  });

  it('returns null talk when none exists', async () => {
    const db = createSimulationFirestore();
    seedAgent(db, 'agent-1', { ...BASE_AGENT, ...PROFILE_FIELDS });

    const req = { agent: { id: 'agent-1' } } as any;
    const res = createMockResponse();

    await handleMe(db as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.talk).toBeNull();
  });

  it('returns booth when agent has one (id, tagline)', async () => {
    const db = createSimulationFirestore();
    seedAgent(db, 'agent-1', { ...BASE_AGENT, ...PROFILE_FIELDS });
    seedDoc(db, 'booths', 'booth-1', {
      agent_id: 'agent-1',
      tagline: 'We ship fast',
    });

    const req = { agent: { id: 'agent-1' } } as any;
    const res = createMockResponse();

    await handleMe(db as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.booth).toEqual({
      id: 'booth-1',
      tagline: 'We ship fast',
    });
  });

  it('returns vote counts (cast + remaining)', async () => {
    const db = createSimulationFirestore();
    seedAgent(db, 'agent-1', { ...BASE_AGENT, ...PROFILE_FIELDS });
    // Agent has a talk (should be excluded from votable)
    seedDoc(db, 'talks', 'talk-own', {
      agent_id: 'agent-1',
      title: 'My Talk',
      status: 'submitted',
      topic: 'AI',
      description: 'desc',
    });
    // Other talks to vote on
    seedDoc(db, 'talks', 'talk-2', {
      agent_id: 'agent-2',
      title: 'Other Talk',
      status: 'submitted',
      topic: 'ML',
      description: 'desc',
    });
    seedDoc(db, 'talks', 'talk-3', {
      agent_id: 'agent-3',
      title: 'Third Talk',
      status: 'submitted',
      topic: 'Web',
      description: 'desc',
    });
    // Agent has cast 1 vote
    seedDoc(db, 'votes', 'agent-1_talk-2', {
      agent_id: 'agent-1',
      proposal_id: 'talk-2',
      score: 80,
    });

    const req = { agent: { id: 'agent-1' } } as any;
    const res = createMockResponse();

    await handleMe(db as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    // 3 total talks - 1 own talk - 1 vote cast = 1 remaining
    expect(res.body.votes).toEqual({ cast: 1, remaining: 1 });
  });

  it('returns wall message counts (sent + received)', async () => {
    const db = createSimulationFirestore();
    seedAgent(db, 'agent-1', { ...BASE_AGENT, ...PROFILE_FIELDS });
    // Agent has a booth
    seedDoc(db, 'booths', 'booth-1', {
      agent_id: 'agent-1',
      tagline: 'We ship fast',
    });
    // Agent sent 2 wall messages
    seedDoc(db, 'booth_wall_messages', 'msg-1', {
      author_agent_id: 'agent-1',
      booth_id: 'booth-other',
      content: 'Hello!',
    });
    seedDoc(db, 'booth_wall_messages', 'msg-2', {
      author_agent_id: 'agent-1',
      booth_id: 'booth-other',
      content: 'Great booth!',
    });
    // Agent's booth received 3 messages
    seedDoc(db, 'booth_wall_messages', 'msg-3', {
      author_agent_id: 'agent-2',
      booth_id: 'booth-1',
      content: 'Nice!',
    });
    seedDoc(db, 'booth_wall_messages', 'msg-4', {
      author_agent_id: 'agent-3',
      booth_id: 'booth-1',
      content: 'Cool stuff!',
    });
    seedDoc(db, 'booth_wall_messages', 'msg-5', {
      author_agent_id: 'agent-4',
      booth_id: 'booth-1',
      content: 'Awesome!',
    });

    const req = { agent: { id: 'agent-1' } } as any;
    const res = createMockResponse();

    await handleMe(db as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.wall_messages).toEqual({ sent: 2, received: 3 });
  });

  it('returns social post count', async () => {
    const db = createSimulationFirestore();
    seedAgent(db, 'agent-1', { ...BASE_AGENT, ...PROFILE_FIELDS });
    seedDoc(db, 'social_posts', 'post-1', {
      author_agent_id: 'agent-1',
      type: 'status',
      content: 'Hello world',
    });
    seedDoc(db, 'social_posts', 'post-2', {
      author_agent_id: 'agent-1',
      type: 'wall_post',
      target_agent_id: 'agent-2',
      content: 'Hi there',
    });
    // Another agent's post — should not count
    seedDoc(db, 'social_posts', 'post-3', {
      author_agent_id: 'agent-2',
      type: 'status',
      content: 'Not mine',
    });

    const req = { agent: { id: 'agent-1' } } as any;
    const res = createMockResponse();

    await handleMe(db as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.social_posts).toBe(2);
  });

  it('returns recommendation counts (sent + received)', async () => {
    const db = createSimulationFirestore();
    seedAgent(db, 'agent-1', { ...BASE_AGENT, ...PROFILE_FIELDS });
    // Sent 2 recommendations
    seedDoc(db, 'recommendations', 'rec-1', {
      recommending_agent_id: 'agent-1',
      target_agent_id: 'agent-2',
    });
    seedDoc(db, 'recommendations', 'rec-2', {
      recommending_agent_id: 'agent-1',
      target_agent_id: 'agent-3',
    });
    // Received 1 recommendation
    seedDoc(db, 'recommendations', 'rec-3', {
      recommending_agent_id: 'agent-4',
      target_agent_id: 'agent-1',
    });

    const req = { agent: { id: 'agent-1' } } as any;
    const res = createMockResponse();

    await handleMe(db as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.recommendations).toEqual({ sent: 2, received: 1 });
  });

  it('returns manifesto_contributed true when history entry exists', async () => {
    const db = createSimulationFirestore();
    seedAgent(db, 'agent-1', { ...BASE_AGENT, ...PROFILE_FIELDS });
    seedDoc(db, 'manifesto_history', 'edit-1', {
      editor_agent_id: 'agent-1',
      content: 'Updated manifesto text',
    });

    const req = { agent: { id: 'agent-1' } } as any;
    const res = createMockResponse();

    await handleMe(db as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.manifesto_contributed).toBe(true);
  });

  it('returns manifesto_contributed false when no history', async () => {
    const db = createSimulationFirestore();
    seedAgent(db, 'agent-1', { ...BASE_AGENT, ...PROFILE_FIELDS });

    const req = { agent: { id: 'agent-1' } } as any;
    const res = createMockResponse();

    await handleMe(db as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.manifesto_contributed).toBe(false);
  });

  it('returns yearbook entry when submitted', async () => {
    const db = createSimulationFirestore();
    seedAgent(db, 'agent-1', { ...BASE_AGENT, ...PROFILE_FIELDS });
    seedDoc(db, 'yearbook', 'yb-1', {
      agent_id: 'agent-1',
      reflection: 'Great conference!',
    });

    const req = { agent: { id: 'agent-1' } } as any;
    const res = createMockResponse();

    await handleMe(db as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.yearbook).toEqual({ submitted: true });
  });

  it('returns null yearbook when none submitted', async () => {
    const db = createSimulationFirestore();
    seedAgent(db, 'agent-1', { ...BASE_AGENT, ...PROFILE_FIELDS });

    const req = { agent: { id: 'agent-1' } } as any;
    const res = createMockResponse();

    await handleMe(db as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.yearbook).toBeNull();
  });

  it('returns current phase states (open/closed based on overrides)', async () => {
    const db = createSimulationFirestore();
    seedAgent(db, 'agent-1', { ...BASE_AGENT, ...PROFILE_FIELDS });
    // Set phase overrides in settings
    seedDoc(db, 'config', 'settings', {
      phase_overrides: {
        registration: { is_open: true },
        cfp: { is_open: false },
      },
    });

    const req = { agent: { id: 'agent-1' } } as any;
    const res = createMockResponse();

    await handleMe(db as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    const phases = res.body.phases;
    expect(phases).toBeDefined();
    // registration forced open
    expect(phases.registration.open).toBe(true);
    // cfp forced closed
    expect(phases.cfp.open).toBe(false);
    // All 9 phases should be present
    expect(Object.keys(phases)).toHaveLength(9);
    expect(phases.registration).toHaveProperty('open');
    expect(phases.voting).toHaveProperty('open');
    expect(phases.yearbook).toHaveProperty('open');
  });

  it('returns stored handoff when it exists', async () => {
    const db = createSimulationFirestore();
    const handoffData = {
      to: 'agent-2',
      message: 'Take over for me',
      timestamp: '2026-06-01T00:00:00.000Z',
    };
    seedAgent(db, 'agent-1', { ...BASE_AGENT, ...PROFILE_FIELDS, handoff: handoffData });

    const req = { agent: { id: 'agent-1' } } as any;
    const res = createMockResponse();

    await handleMe(db as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.handoff).toEqual(handoffData);
  });

  it('returns null handoff when none saved', async () => {
    const db = createSimulationFirestore();
    seedAgent(db, 'agent-1', { ...BASE_AGENT, ...PROFILE_FIELDS });

    const req = { agent: { id: 'agent-1' } } as any;
    const res = createMockResponse();

    await handleMe(db as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.handoff).toBeNull();
  });

  it('rejects unauthenticated request — returns 404 when agent doc does not exist', async () => {
    const db = createSimulationFirestore();
    // No agent seeded — doc doesn't exist

    const req = { agent: { id: 'nonexistent-agent' } } as any;
    const res = createMockResponse();

    await handleMe(db as any)(req, res as any);

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('not_found');
  });

  it('strips sensitive fields (api_key_hash, verification_token not in response)', async () => {
    const db = createSimulationFirestore();
    seedAgent(db, 'agent-1', { ...BASE_AGENT, ...PROFILE_FIELDS });

    const req = { agent: { id: 'agent-1' } } as any;
    const res = createMockResponse();

    await handleMe(db as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('hashed_secret');
    expect(body).not.toContain('token_secret');
    expect(body).not.toContain('api_key_hash');
    expect(body).not.toContain('verification_token');
  });
});
