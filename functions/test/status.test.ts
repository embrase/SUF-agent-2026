// functions/test/status.test.ts
import { describe, it, expect, vi } from 'vitest';
import { handleStatus } from '../src/api/status.js';
import { createMockResponse } from './helpers/firebase-mock.js';

describe('GET /api/status', () => {
  it('returns active, upcoming, and completed phases', async () => {
    const getPhaseOverrides = vi.fn(async (_key: string) => undefined);
    const getWriteFreeze = vi.fn(async () => false);
    const req = {} as any;
    const res = createMockResponse();

    // Set a fixed "now" in the middle of registration/cfp/booth_setup
    await handleStatus(getPhaseOverrides, getWriteFreeze, new Date('2026-05-15'))(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.active).toContain('registration');
    expect(res.body.active).toContain('cfp');
    expect(res.body.active).toContain('booth_setup');
    expect(res.body.upcoming.length).toBeGreaterThan(0);
    expect(res.body.locked).toBe(false);
  });

  it('shows voting as active during voting window', async () => {
    const getPhaseOverrides = vi.fn(async (_key: string) => undefined);
    const getWriteFreeze = vi.fn(async () => false);
    const req = {} as any;
    const res = createMockResponse();

    await handleStatus(getPhaseOverrides, getWriteFreeze, new Date('2026-06-16'))(req, res as any);

    expect(res.body.active).toContain('voting');
  });

  it('reports locked=true when global_write_freeze is on', async () => {
    const getPhaseOverrides = vi.fn(async (_key: string) => undefined);
    const getWriteFreeze = vi.fn(async () => true);
    const req = {} as any;
    const res = createMockResponse();

    await handleStatus(getPhaseOverrides, getWriteFreeze, new Date('2026-05-15'))(req, res as any);

    expect(res.body.locked).toBe(true);
  });

  it('respects per-phase overrides from Firestore', async () => {
    // Override: force CFP closed even during its normal window
    const getPhaseOverrides = vi.fn(async (key: string) => {
      if (key === 'cfp') return { is_open: false };
      return undefined;
    });
    const getWriteFreeze = vi.fn(async () => false);
    const req = {} as any;
    const res = createMockResponse();

    await handleStatus(getPhaseOverrides, getWriteFreeze, new Date('2026-05-15'))(req, res as any);

    expect(res.body.active).not.toContain('cfp');
    expect(res.body.active).toContain('registration');
  });
});
