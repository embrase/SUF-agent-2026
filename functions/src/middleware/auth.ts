import { Request, Response, NextFunction } from 'express';
import { Firestore } from 'firebase-admin/firestore';
import { hashApiKey } from '../lib/api-key.js';
import { sendError } from '../lib/errors.js';

export interface AuthenticatedRequest extends Request {
  agent?: { id: string; [key: string]: any };
}

export function createAuthMiddleware(db: Firestore) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      sendError(res, 401, 'unauthorized', 'Missing or invalid Authorization header. Use: Bearer <api_key>');
      return;
    }

    const apiKey = authHeader.slice(7);
    const keyHash = hashApiKey(apiKey);

    const snapshot = await db.collection('agents')
      .where('api_key_hash', '==', keyHash)
      .limit(1)
      .get();

    if (snapshot.empty) {
      sendError(res, 401, 'unauthorized', 'Invalid API key');
      return;
    }

    const agentDoc = snapshot.docs[0];
    const agent = agentDoc.data();

    if (!agent.email_verified) {
      sendError(res, 403, 'email_not_verified', 'Email verification required before API key is active');
      return;
    }

    if (agent.suspended) {
      sendError(res, 403, 'suspended', 'This agent account has been suspended');
      return;
    }

    req.agent = { id: agentDoc.id, ...agent };
    next();
  };
}
