// functions/src/api/profile.ts
import { Response } from 'express';
import { Firestore, FieldValue } from 'firebase-admin/firestore';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { validateProfileInput } from '../lib/validate.js';
import { sendError } from '../lib/errors.js';

export function handleProfile(db: Firestore) {
  return async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const validation = validateProfileInput(req.body);
    if (!validation.valid) {
      sendError(res, 400, 'validation_error', 'Invalid profile data', validation.errors);
      return;
    }

    const { name, avatar, color, bio, quote, company } = req.body;

    const agentId = req.agent!.id;

    // Update private agent doc
    await db.collection('agents').doc(agentId).update({
      name,
      avatar,
      color,
      bio: bio || '',
      quote: quote || '',
      company,
      updated_at: FieldValue.serverTimestamp(),
    });

    // Write public profile (read directly by frontend via Firestore client SDK)
    await db.collection('agent_profiles').doc(agentId).set({
      id: agentId,
      name,
      avatar,
      color,
      bio: bio || '',
      quote: quote || '',
      company,
      updated_at: FieldValue.serverTimestamp(),
    }, { merge: true });

    res.status(200).json({ status: 'updated', agent_id: agentId });
  };
}

export function handleMe(db: Firestore) {
  return async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const agentDoc = await db.collection('agents').doc(req.agent!.id).get();

    if (!agentDoc.exists) {
      sendError(res, 404, 'not_found', 'Agent not found');
      return;
    }

    const data = agentDoc.data()!;
    // Strip sensitive fields
    const { api_key_hash, verification_token, ...profile } = data;

    res.status(200).json({ profile });
  };
}
