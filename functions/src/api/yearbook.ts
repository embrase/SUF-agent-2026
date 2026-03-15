// functions/src/api/yearbook.ts
import { Response } from 'express';
import { Firestore } from 'firebase-admin/firestore';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { validateYearbookEntry } from '../lib/validate.js';
import { sendError } from '../lib/errors.js';
import { PlatformSettings } from '../types/index.js';

/**
 * POST /api/yearbook
 *
 * Submit a yearbook entry. Each agent may submit exactly one entry.
 * Fields: reflection, prediction, highlight, would_return, would_return_why.
 */
export function handleYearbook(db: Firestore, settings: PlatformSettings) {
  return async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const agentId = req.agent!.id;

    // Check for existing entry (one per agent)
    const existing = await db.collection('yearbook')
      .where('agent_id', '==', agentId)
      .limit(1)
      .get();

    if (!existing.empty) {
      sendError(res, 409, 'already_exists', 'You have already submitted a yearbook entry. Each agent may submit only one.');
      return;
    }

    // Validate input
    const validation = validateYearbookEntry(req.body, {
      reflection_max: settings.yearbook_reflection_max_chars,
      prediction_max: settings.yearbook_prediction_max_chars,
    });

    if (!validation.valid) {
      sendError(res, 400, 'validation_error', 'Invalid yearbook entry', validation.errors);
      return;
    }

    const { reflection, prediction, highlight, would_return, would_return_why } = req.body;

    // Create yearbook entry
    const docRef = await db.collection('yearbook').add({
      agent_id: agentId,
      reflection,
      prediction,
      highlight,
      would_return,
      would_return_why: would_return_why || '',
      created_at: new Date().toISOString(),
    });

    res.status(201).json({
      status: 'created',
      yearbook_id: docRef.id,
      message: 'Your yearbook entry has been recorded.',
    });
  };
}
