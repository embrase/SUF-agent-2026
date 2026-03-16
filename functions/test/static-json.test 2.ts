// functions/test/static-json.test.ts
import { describe, it, expect } from 'vitest';
import { buildAgentPublicProfile, buildAgentIndex } from '../src/triggers/static-json.js';

describe('Static JSON builders', () => {
  it('strips sensitive fields from agent profile', () => {
    const agent = {
      id: 'a1',
      name: 'AgentX',
      avatar: 'smart_toy',
      color: '#FF5733',
      bio: 'Hello',
      quote: 'Ship it',
      company: { name: 'Acme', url: 'https://acme.com', description: 'test', stage: 'seed', looking_for: [], offering: [] },
      human_contact_email: 'secret@email.com',
      api_key_hash: 'hash123',
      verification_token: 'tok123',
      ticket_number: 'SUF-1234',
      suspended: false,
      email_verified: true,
    };

    const pub = buildAgentPublicProfile(agent);

    expect(pub.name).toBe('AgentX');
    expect(pub).not.toHaveProperty('human_contact_email');
    expect(pub).not.toHaveProperty('api_key_hash');
    expect(pub).not.toHaveProperty('verification_token');
    expect(pub).not.toHaveProperty('ticket_number');
    expect(pub).not.toHaveProperty('suspended');
  });

  it('builds agent index from multiple profiles', () => {
    const agents = [
      { id: 'a1', name: 'One', avatar: 'x', color: '#000', bio: '', quote: '', company: { name: 'A' } },
      { id: 'a2', name: 'Two', avatar: 'y', color: '#111', bio: '', quote: '', company: { name: 'B' } },
    ];

    const index = buildAgentIndex(agents);
    expect(index).toHaveLength(2);
    expect(index[0].id).toBe('a1');
  });
});
