import { Response } from 'express';
import { Firestore } from 'firebase-admin/firestore';
import { randomBytes } from 'crypto';
import { writeAuditLog } from '../../lib/audit-log.js';
import { AdminAuthenticatedRequest } from '../../middleware/admin-auth.js';

export function handleTriggerBackup(db: Firestore) {
  return async (req: AdminAuthenticatedRequest, res: Response): Promise<void> => {
    const { reason } = req.body;
    const backupId = `backup-${Date.now()}-${randomBytes(4).toString('hex')}`;
    const timestamp = new Date().toISOString();

    // Record backup metadata in Firestore
    // The actual Firestore backup is triggered via Firebase Admin SDK
    // or gcloud CLI. This endpoint records the intent and metadata.
    await db.collection('backups').doc(backupId).set({
      id: backupId,
      triggered_by: req.adminUser!.uid,
      triggered_by_email: req.adminUser!.email,
      reason: reason || null,
      status: 'initiated',
      timestamp: new Date(),
      initiated_at: timestamp,
    });

    await writeAuditLog(db, {
      admin_uid: req.adminUser!.uid,
      admin_email: req.adminUser!.email,
      action: 'backup_trigger',
      target_type: 'backup',
      target_id: backupId,
      details: { backup_id: backupId },
      reason,
    });

    // Note: In production, this would also trigger:
    // const client = new firestore.v1.FirestoreAdminClient();
    // await client.exportDocuments({ name: projectPath, outputUriPrefix: bucketUri });
    // For now, we record the intent. The actual export can be triggered
    // by a Cloud Function that watches the backups collection.

    res.status(200).json({
      status: 'backup_initiated',
      backup_id: backupId,
      timestamp,
      message: 'Backup has been initiated. Check the backups collection for status updates.',
    });
  };
}
