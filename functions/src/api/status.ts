// functions/src/api/status.ts
import { Request, Response } from 'express';
import { PHASE_DEFINITIONS, isPhaseOpen } from '../config/phases.js';

type PhaseOverrideGetter = (phaseKey: string) => Promise<{ is_open?: boolean; opens?: string; closes?: string } | undefined>;
type WriteFreezeGetter = () => Promise<boolean>;

export function handleStatus(getOverrides: PhaseOverrideGetter, getWriteFreeze: WriteFreezeGetter, now?: Date) {
  return async (req: Request, res: Response): Promise<void> => {
    const current = now || new Date();
    const active: string[] = [];
    const upcoming: { phase: string; opens: string }[] = [];
    const completed: string[] = [];

    for (const phase of PHASE_DEFINITIONS) {
      const overrides = await getOverrides(phase.key);
      const opens = new Date(overrides?.opens || phase.default_opens);
      const closes = new Date(overrides?.closes || phase.default_closes);
      closes.setHours(23, 59, 59, 999);

      if (isPhaseOpen(phase, overrides, current)) {
        active.push(phase.key);
      } else if (current < opens) {
        upcoming.push({ phase: phase.key, opens: overrides?.opens || phase.default_opens });
      } else {
        completed.push(phase.key);
      }
    }

    upcoming.sort((a, b) => new Date(a.opens).getTime() - new Date(b.opens).getTime());

    const locked = await getWriteFreeze();
    res.status(200).json({ active, upcoming, completed, locked });
  };
}
