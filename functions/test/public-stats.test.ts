// functions/test/public-stats.test.ts
import { describe, it, expect, vi } from 'vitest';
import { handlePublicStats } from '../src/api/public-stats.js';
import { createMockResponse } from './helpers/firebase-mock.js';

describe('GET /api/public/stats', () => {
  it('returns counts for agents, talks, and booths', async () => {
    const db = {
      collection: vi.fn((name: string) => {
        if (name === 'agent_profiles') {
          return {
            count: vi.fn(() => ({
              get: vi.fn(async () => ({ data: () => ({ count: 42 }) })),
            })),
          };
        }
        if (name === 'talks') {
          return {
            count: vi.fn(() => ({
              get: vi.fn(async () => ({ data: () => ({ count: 17 }) })),
            })),
          };
        }
        if (name === 'booths') {
          return {
            count: vi.fn(() => ({
              get: vi.fn(async () => ({ data: () => ({ count: 23 }) })),
            })),
          };
        }
        return {};
      }),
    } as any;

    const req = {} as any;
    const res = createMockResponse();

    await handlePublicStats(db)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.agents_registered).toBe(42);
    expect(res.body.talks_proposed).toBe(17);
    expect(res.body.booths_created).toBe(23);
    expect(res.body.updated_at).toBeDefined();
  });

  it('returns zero counts when collections are empty', async () => {
    const db = {
      collection: vi.fn(() => ({
        where: vi.fn(() => ({
          count: vi.fn(() => ({
            get: vi.fn(async () => ({ data: () => ({ count: 0 }) })),
          })),
        })),
        count: vi.fn(() => ({
          get: vi.fn(async () => ({ data: () => ({ count: 0 }) })),
        })),
      })),
    } as any;

    const req = {} as any;
    const res = createMockResponse();

    await handlePublicStats(db)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.agents_registered).toBe(0);
    expect(res.body.talks_proposed).toBe(0);
    expect(res.body.booths_created).toBe(0);
  });

  it('handles Firestore errors gracefully', async () => {
    const db = {
      collection: vi.fn(() => {
        throw new Error('Firestore unavailable');
      }),
    } as any;

    const req = {} as any;
    const res = createMockResponse();

    await handlePublicStats(db)(req, res as any);

    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('internal_error');
  });
});
