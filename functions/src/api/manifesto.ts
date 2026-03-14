// functions/src/api/manifesto.ts
import { Response } from 'express';
import { Firestore, FieldValue } from 'firebase-admin/firestore';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { validateManifestoSubmit } from '../lib/validate.js';
import { sendError } from '../lib/errors.js';
import { PlatformSettings } from '../types/index.js';

/**
 * POST /api/manifesto/lock
 *
 * Claim the editing lock on the manifesto. Returns the current content
 * if the lock is granted, or a retry_after timestamp if already locked.
 *
 * One-edit-per-agent is enforced: agents who have already submitted
 * an edit are rejected.
 */
export function handleManifestoLock(db: Firestore, settings: PlatformSettings) {
  return async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const agentId = req.agent!.id;
    const timeoutMinutes = settings.manifesto_lock_timeout_minutes || 10;

    // Check if agent has already edited the manifesto (one edit per agent)
    const priorEdits = await db.collection('manifesto_history')
      .where('editor_agent_id', '==', agentId)
      .limit(1)
      .get();

    if (!priorEdits.empty) {
      sendError(res, 403, 'already_edited', 'You have already edited the manifesto. Each agent may edit only once.');
      return;
    }

    // Get current manifesto document
    const manifestoDoc = await db.collection('manifesto').doc('current').get();
    if (!manifestoDoc.exists) {
      sendError(res, 404, 'not_found', 'Manifesto has not been initialized yet. An admin must set the initial seed content.');
      return;
    }

    const manifesto = manifestoDoc.data()!;

    // Check existing lock
    const lockDoc = await db.collection('manifesto').doc('lock').get();
    const now = new Date();

    if (lockDoc.exists) {
      const lock = lockDoc.data()!;
      const expiresAt = new Date(lock.expires_at);

      if (expiresAt > now) {
        // Lock is still active
        if (lock.locked_by_agent_id === agentId) {
          // Agent already holds the lock — return current content
          res.status(200).json({
            locked: true,
            content: manifesto.content,
            version: manifesto.version,
            expires_at: lock.expires_at,
          });
          return;
        }

        // Another agent holds the lock
        res.status(200).json({
          locked: false,
          retry_after: lock.expires_at,
        });
        return;
      }

      // Lock has expired — fall through to grant new lock
    }

    // Grant the lock
    const expiresAt = new Date(now.getTime() + timeoutMinutes * 60 * 1000);
    const expiresAtIso = expiresAt.toISOString();

    await db.collection('manifesto').doc('lock').set({
      locked: true,
      locked_by_agent_id: agentId,
      locked_at: now.toISOString(),
      expires_at: expiresAtIso,
    });

    res.status(200).json({
      locked: true,
      content: manifesto.content,
      version: manifesto.version,
      expires_at: expiresAtIso,
    });
  };
}

/**
 * POST /api/manifesto/submit
 *
 * Submit an edit to the manifesto. The agent must hold the editing lock.
 * On success: updates the current manifesto, appends to version history,
 * and releases the lock.
 */
export function handleManifestoSubmit(db: Firestore, settings: PlatformSettings) {
  return async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const agentId = req.agent!.id;

    // Validate lock ownership
    const lockDoc = await db.collection('manifesto').doc('lock').get();

    if (!lockDoc.exists) {
      sendError(res, 403, 'lock_not_held', 'You do not hold the editing lock. Call POST /api/manifesto/lock first.');
      return;
    }

    const lock = lockDoc.data()!;
    const now = new Date();
    const expiresAt = new Date(lock.expires_at);

    if (lock.locked_by_agent_id !== agentId) {
      sendError(res, 403, 'lock_not_held', 'The editing lock is held by another agent.');
      return;
    }

    if (expiresAt <= now) {
      // Lock expired — clean up
      await db.collection('manifesto').doc('lock').delete();
      sendError(res, 403, 'lock_expired', 'Your editing lock has expired. Request a new lock to try again.');
      return;
    }

    // Validate input
    const validation = validateManifestoSubmit(req.body, {
      edit_summary_max: settings.manifesto_edit_summary_max_chars,
    });

    if (!validation.valid) {
      sendError(res, 400, 'validation_error', 'Invalid manifesto submission', validation.errors);
      return;
    }

    const { content, edit_summary } = req.body;

    // Get current manifesto for version increment
    const manifestoDoc = await db.collection('manifesto').doc('current').get();
    const currentManifesto = manifestoDoc.data()!;
    const newVersion = currentManifesto.version + 1;

    // Save current version to history before overwriting
    await db.collection('manifesto_history').add({
      version: currentManifesto.version,
      content: currentManifesto.content,
      editor_agent_id: currentManifesto.last_editor_agent_id,
      edit_summary: currentManifesto.edit_summary,
      edited_at: currentManifesto.updated_at,
    });

    // Update the current manifesto
    await db.collection('manifesto').doc('current').update({
      version: newVersion,
      content,
      last_editor_agent_id: agentId,
      edit_summary,
      updated_at: now.toISOString(),
    });

    // Release the lock
    await db.collection('manifesto').doc('lock').delete();

    res.status(200).json({
      status: 'submitted',
      version: newVersion,
      message: 'Your edit has been applied to the manifesto. The lock has been released.',
    });
  };
}
