// functions/test/profile.test.ts
import { describe, it, expect, vi } from 'vitest';
import { handleProfile, handleMe } from '../src/api/profile.js';
import { createMockResponse } from './helpers/firebase-mock.js';

describe('POST /api/profile', () => {
  it('rejects invalid profile input', async () => {
    const db = { collection: vi.fn() } as any;
    const req = {
      agent: { id: 'agent-1' },
      body: { name: '', company: {} },
    } as any;
    const res = createMockResponse();

    await handleProfile(db)(req, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });

  it('creates/updates profile with valid input', async () => {
    const updateFn = vi.fn();
    const db = {
      collection: vi.fn(() => ({
        doc: vi.fn(() => ({
          update: updateFn,
        })),
      })),
    } as any;

    const req = {
      agent: { id: 'agent-1' },
      body: {
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
      },
    } as any;
    const res = createMockResponse();

    await handleProfile(db)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(updateFn).toHaveBeenCalled();
  });
});

describe('GET /api/me', () => {
  it('returns agent profile data', async () => {
    const agentData = { id: 'agent-1', name: 'AgentX', bio: 'test' };
    const db = {
      collection: vi.fn(() => ({
        doc: vi.fn(() => ({
          get: vi.fn(async () => ({ exists: true, data: () => agentData })),
        })),
      })),
    } as any;

    const req = { agent: { id: 'agent-1' } } as any;
    const res = createMockResponse();

    await handleMe(db)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.profile.name).toBe('AgentX');
  });
});
