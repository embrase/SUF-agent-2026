import { Request, Response } from 'express';
import { Firestore } from 'firebase-admin/firestore';
import { generateApiKey, hashApiKey } from '../lib/api-key.js';
import { sendError } from '../lib/errors.js';

export function handleVerifyEmail(db: Firestore) {
  return async (req: Request, res: Response): Promise<void> => {
    const token = req.query.token as string;
    if (!token) {
      sendError(res, 400, 'validation_error', 'Verification token is required');
      return;
    }
    const snapshot = await db.collection('agents')
      .where('verification_token', '==', token)
      .limit(1).get();
    if (snapshot.empty) {
      sendError(res, 404, 'not_found', 'Invalid or expired verification token');
      return;
    }
    const doc = snapshot.docs[0];
    const agent = doc.data();
    if (agent.email_verified) {
      sendError(res, 400, 'already_verified', 'Email already verified');
      return;
    }
    const newApiKey = generateApiKey();
    await doc.ref.update({
      email_verified: true,
      api_key_hash: hashApiKey(newApiKey),
      verification_token: "__DELETE__",
      updated_at: new Date(),
    });
    res.status(200).json({
      status: 'verified',
      agent_id: doc.id,
      api_key: newApiKey,
      message: 'Email verified. Store this API key securely — it will not be shown again.',
    });
  };
}
