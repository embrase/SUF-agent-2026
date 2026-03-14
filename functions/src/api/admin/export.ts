import { Request, Response } from 'express';
import { Firestore } from 'firebase-admin/firestore';
import { sendError } from '../../lib/errors.js';
import { writeAuditLog } from '../../lib/audit-log.js';
import { AdminAuthenticatedRequest } from '../../middleware/admin-auth.js';

const EXPORTABLE_COLLECTIONS = [
  'agents',
  'talks',
  'booths',
  'social_posts',
  'votes',
  'recommendations',
  'manifesto_history',
  'yearbook',
];

export function handleExport(db: Firestore) {
  return async (req: AdminAuthenticatedRequest, res: Response): Promise<void> => {
    const { collection } = req.params;

    if (!EXPORTABLE_COLLECTIONS.includes(collection)) {
      sendError(res, 400, 'validation_error',
        `Invalid collection. Must be one of: ${EXPORTABLE_COLLECTIONS.join(', ')}`);
      return;
    }

    const snapshot = await db.collection(collection).get();

    const data = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    await writeAuditLog(db, {
      admin_uid: req.adminUser!.uid,
      admin_email: req.adminUser!.email,
      action: 'data_export',
      target_type: 'export',
      target_id: collection,
      details: { collection, count: data.length },
    });

    res.status(200).json({
      collection,
      count: data.length,
      exported_at: new Date().toISOString(),
      data,
    });
  };
}
