import { Request, Response } from 'express';
import { Firestore } from 'firebase-admin/firestore';
import { sendError } from '../../lib/errors.js';
import { writeAuditLog } from '../../lib/audit-log.js';
import { generateApiKey, hashApiKey } from '../../lib/api-key.js';
import { AdminAuthenticatedRequest } from '../../middleware/admin-auth.js';

export function handleListAgents(db: Firestore) {
  return async (req: Request, res: Response): Promise<void> => {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const startAfter = req.query.start_after as string | undefined;

    let query = db.collection('agents').orderBy('created_at', 'desc');

    if (startAfter) {
      const startDoc = await db.collection('agents').doc(startAfter).get();
      if (startDoc.exists) {
        query = query.startAfter(startDoc) as any;
      }
    }

    const snapshot = await (query as any).limit(limit).get();

    const agents = snapshot.docs.map((doc: any) => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name,
        human_contact_email: data.human_contact_email,
        company_name: data.company?.name,
        suspended: data.suspended,
        email_verified: data.email_verified,
        created_at: data.created_at,
      };
    });

    const nextCursor = snapshot.docs.length === limit
      ? snapshot.docs[snapshot.docs.length - 1].id
      : null;

    res.status(200).json({
      agents,
      count: agents.length,
      next_cursor: nextCursor,
    });
  };
}

export function handleGetAgent(db: Firestore) {
  return async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;

    const doc = await db.collection('agents').doc(id as string).get();
    if (!doc.exists) {
      sendError(res, 404, 'not_found', `Agent ${id} not found`);
      return;
    }

    res.status(200).json({ agent: { id: doc.id, ...doc.data() } });
  };
}

export function handleSuspendAgent(db: Firestore) {
  return async (req: AdminAuthenticatedRequest, res: Response): Promise<void> => {
    const { id } = req.params;
    const { suspended, reason } = req.body;

    if (suspended === undefined || typeof suspended !== 'boolean') {
      sendError(res, 400, 'validation_error', 'Field "suspended" (boolean) is required');
      return;
    }

    const doc = await db.collection('agents').doc(id as string).get();
    if (!doc.exists) {
      sendError(res, 404, 'not_found', `Agent ${id} not found`);
      return;
    }

    await db.collection('agents').doc(id as string).update({
      suspended,
      updated_at: new Date(),
    });

    await writeAuditLog(db, {
      admin_uid: req.adminUser!.uid,
      admin_email: req.adminUser!.email,
      action: suspended ? 'agent_suspend' : 'agent_unsuspend',
      target_type: 'agent',
      target_id: id as string,
      details: { suspended },
      reason,
    });

    res.status(200).json({
      agent_id: id,
      suspended,
    });
  };
}

export function handleResetAgentKey(db: Firestore) {
  return async (req: AdminAuthenticatedRequest, res: Response): Promise<void> => {
    const { id } = req.params;
    const { reason } = req.body;

    const doc = await db.collection('agents').doc(id as string).get();
    if (!doc.exists) {
      sendError(res, 404, 'not_found', `Agent ${id} not found`);
      return;
    }

    const newKey = generateApiKey();
    const newHash = hashApiKey(newKey);

    await db.collection('agents').doc(id as string).update({
      api_key_hash: newHash,
      updated_at: new Date(),
    });

    await writeAuditLog(db, {
      admin_uid: req.adminUser!.uid,
      admin_email: req.adminUser!.email,
      action: 'agent_key_reset',
      target_type: 'agent',
      target_id: id as string,
      details: {},
      reason,
    });

    res.status(200).json({
      agent_id: id,
      new_api_key: newKey,
      message: 'API key has been reset. The old key is now invalid. Provide this new key to the agent owner.',
    });
  };
}
