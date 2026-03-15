import { Request, Response } from 'express';
import { Firestore } from 'firebase-admin/firestore';
import { PHASE_DEFINITIONS, isPhaseOpen } from '../../config/phases.js';
import { sendError } from '../../lib/errors.js';
import { writeAuditLog } from '../../lib/audit-log.js';
import { AdminAuthenticatedRequest } from '../../middleware/admin-auth.js';
import { PhaseState } from '../../types/index.js';

export function handleGetPhases(db: Firestore, now?: Date) {
  return async (req: Request, res: Response): Promise<void> => {
    const current = now || new Date();
    const settingsDoc = await db.collection('config').doc('settings').get();
    const settings = settingsDoc.exists ? settingsDoc.data() || {} : {};
    const overrides = settings.phase_overrides || {};
    const globalFreeze = settings.global_write_freeze || false;

    const phases: PhaseState[] = PHASE_DEFINITIONS.map((phase) => {
      const override = overrides[phase.key];
      return {
        key: phase.key,
        name: phase.name,
        default_opens: phase.default_opens,
        default_closes: phase.default_closes,
        override_opens: override?.opens,
        override_closes: override?.closes,
        override_is_open: override?.is_open,
        computed_is_open: isPhaseOpen(phase, override, current),
      };
    });

    res.status(200).json({ phases, global_write_freeze: globalFreeze });
  };
}

export function handleUpdatePhase(db: Firestore) {
  return async (req: AdminAuthenticatedRequest, res: Response): Promise<void> => {
    const key = req.params.key as string;
    const { is_open, opens, closes, reason } = req.body;

    const phaseDef = PHASE_DEFINITIONS.find((p) => p.key === key);
    if (!phaseDef) {
      sendError(res, 404, 'not_found', `Unknown phase key: ${key}`);
      return;
    }

    // Build the override object — only include fields that were provided
    const override: Record<string, unknown> = {};
    if (is_open !== undefined) override.is_open = is_open;
    if (opens !== undefined) override.opens = opens;
    if (closes !== undefined) override.closes = closes;

    // Update settings in Firestore using dot notation for nested field
    await db.collection('config').doc('settings').set(
      { phase_overrides: { [key]: override } },
      { merge: true }
    );

    // Audit log
    await writeAuditLog(db, {
      admin_uid: req.adminUser!.uid,
      admin_email: req.adminUser!.email,
      action: 'phase_update',
      target_type: 'phase',
      target_id: key,
      details: override,
      reason,
    });

    res.status(200).json({
      updated: true,
      phase_key: key,
      override,
    });
  };
}

export function handleToggleFreeze(db: Firestore) {
  return async (req: AdminAuthenticatedRequest, res: Response): Promise<void> => {
    const { freeze, reason } = req.body;

    if (freeze === undefined || typeof freeze !== 'boolean') {
      sendError(res, 400, 'validation_error', 'Field "freeze" (boolean) is required');
      return;
    }

    await db.collection('config').doc('settings').set(
      { global_write_freeze: freeze },
      { merge: true }
    );

    await writeAuditLog(db, {
      admin_uid: req.adminUser!.uid,
      admin_email: req.adminUser!.email,
      action: freeze ? 'global_freeze_on' : 'global_freeze_off',
      target_type: 'settings',
      target_id: 'global_write_freeze',
      details: { freeze },
      reason,
    });

    res.status(200).json({ global_write_freeze: freeze });
  };
}
