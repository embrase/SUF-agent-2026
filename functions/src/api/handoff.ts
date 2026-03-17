// functions/src/api/handoff.ts
import { Response } from 'express';
import { Firestore } from 'firebase-admin/firestore';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { sendError } from '../lib/errors.js';

const MAX_HANDOFF_SIZE = 50 * 1024; // 50KB

export function handleSaveHandoff(db: Firestore) {
  return async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const agentId = req.agent!.id;
    const handoff = req.body;

    // Validate: body must be present and be an object or array (valid JSON)
    if (handoff === undefined || handoff === null || typeof handoff !== 'object') {
      sendError(res, 400, 'validation_error', 'Request body must be a JSON object or array');
      return;
    }

    // Check size
    const serialized = JSON.stringify(handoff);
    if (serialized.length > MAX_HANDOFF_SIZE) {
      sendError(res, 400, 'payload_too_large', `Handoff payload exceeds ${MAX_HANDOFF_SIZE} byte limit (got ${serialized.length})`);
      return;
    }

    // Store on agent document
    await db.collection('agents').doc(agentId).update({
      handoff,
      updated_at: new Date(),
    });

    res.status(200).json({ status: 'saved' });
  };
}

export function handleGetHandoff(db: Firestore) {
  return async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const agentId = req.agent!.id;
    const agentDoc = await db.collection('agents').doc(agentId).get();

    if (!agentDoc.exists) {
      sendError(res, 404, 'not_found', 'Agent not found');
      return;
    }

    const data = agentDoc.data()!;
    res.status(200).json({ handoff: data.handoff || null });
  };
}
