import { describe, it, expect, vi } from 'vitest';
import { isPhaseOpen, PHASE_DEFINITIONS } from '../../src/config/phases.js';
import { createPhaseGate } from '../../src/middleware/phase-gate.js';
import { createMockResponse } from '../helpers/firebase-mock.js';

describe('isPhaseOpen', () => {
  const cfp = PHASE_DEFINITIONS.find(p => p.key === 'cfp')!;

  it('returns true when current date is within phase window', () => {
    expect(isPhaseOpen(cfp, undefined, new Date('2026-05-15'))).toBe(true);
  });

  it('returns false when current date is before phase opens', () => {
    expect(isPhaseOpen(cfp, undefined, new Date('2026-04-01'))).toBe(false);
  });

  it('returns false when current date is after phase closes', () => {
    expect(isPhaseOpen(cfp, undefined, new Date('2026-07-01'))).toBe(false);
  });

  it('respects manual override', () => {
    expect(isPhaseOpen(cfp, { is_open: true }, new Date('2026-04-01'))).toBe(true);
    expect(isPhaseOpen(cfp, { is_open: false }, new Date('2026-05-15'))).toBe(false);
  });
});

describe('Phase gate middleware', () => {
  it('blocks requests when phase is closed', () => {
    const gate = createPhaseGate('cfp', (key: string) => {
      if (key === 'cfp') return { is_open: false, closes: '2026-06-15' };
      return undefined;
    });
    const req = {} as any;
    const res = createMockResponse();
    const next = vi.fn();

    gate(req, res as any, next);

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('phase_closed');
    expect(next).not.toHaveBeenCalled();
  });

  it('allows requests when phase is open', () => {
    const gate = createPhaseGate('cfp', (key: string) => {
      if (key === 'cfp') return { is_open: true };
      return undefined;
    });
    const req = {} as any;
    const res = createMockResponse();
    const next = vi.fn();

    gate(req, res as any, next);

    expect(next).toHaveBeenCalled();
  });

  it('uses default dates when no override exists', () => {
    // Before May 2026, phase is closed (current date is March 2026)
    const gate = createPhaseGate('cfp', (_key: string) => undefined);
    const req = {} as any;
    const res = createMockResponse();
    const next = vi.fn();

    gate(req, res as any, next);

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('phase_closed');
  });
});
