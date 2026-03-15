import { Request, Response, NextFunction } from 'express';
import { PHASE_DEFINITIONS, isPhaseOpen } from '../config/phases.js';
import { sendPhaseClosed } from '../lib/errors.js';

type PhaseOverrideGetter = (phaseKey: string) => { is_open?: boolean; opens?: string; closes?: string } | undefined;

export function createPhaseGate(phaseKey: string, getOverrides: PhaseOverrideGetter) {
  const phaseDef = PHASE_DEFINITIONS.find(p => p.key === phaseKey);
  if (!phaseDef) throw new Error(`Unknown phase: ${phaseKey}`);

  return (req: Request, res: Response, next: NextFunction): void => {
    const overrides = getOverrides(phaseKey);

    if (!isPhaseOpen(phaseDef, overrides)) {
      const nextPhase = PHASE_DEFINITIONS
        .filter(p => {
          const o = getOverrides(p.key);
          return !isPhaseOpen(p, o) && new Date(o?.opens || p.default_opens) > new Date();
        })
        .sort((a, b) => new Date(a.default_opens).getTime() - new Date(b.default_opens).getTime())[0];

      sendPhaseClosed(
        res,
        phaseDef.name,
        overrides?.closes || phaseDef.default_closes,
        nextPhase ? { phase: nextPhase.key, opens: nextPhase.default_opens } : undefined,
      );
      return;
    }

    next();
  };
}
