import { Request, Response } from 'express';
import { Firestore, FieldValue } from 'firebase-admin/firestore';
import { sendError } from '../../lib/errors.js';
import { writeAuditLog } from '../../lib/audit-log.js';
import { AdminAuthenticatedRequest } from '../../middleware/admin-auth.js';

export function handleListModeration(db: Firestore) {
  return async (req: Request, res: Response): Promise<void> => {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);

    const snapshot = await db.collection('moderation_queue')
      .where('status', '==', 'pending_review')
      .orderBy('submitted_at', 'asc')
      .limit(limit)
      .get();

    const items = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.status(200).json({ items, count: items.length });
  };
}

export function handleModerationApprove(db: Firestore) {
  return async (req: AdminAuthenticatedRequest, res: Response): Promise<void> => {
    const id = req.params.id as string;

    const doc = await db.collection('moderation_queue').doc(id).get();
    if (!doc.exists) {
      sendError(res, 404, 'not_found', `Moderation item ${id} not found`);
      return;
    }

    const item = doc.data()!;
    const collection = item.collection as string;
    const document_id = item.document_id as string;

    // Update the source document status to approved
    await db.collection(collection).doc(document_id).update({
      status: 'approved',
      hidden: false,
      approved_at: FieldValue.serverTimestamp(),
      approved_by: req.adminUser!.uid,
    });

    // Update the moderation queue item
    await db.collection('moderation_queue').doc(id).update({
      status: 'approved',
      reviewed_by: req.adminUser!.uid,
      reviewed_at: FieldValue.serverTimestamp(),
    });

    await writeAuditLog(db, {
      admin_uid: req.adminUser!.uid,
      admin_email: req.adminUser!.email,
      action: 'moderation_approve',
      target_type: 'moderation',
      target_id: id,
      details: { collection, document_id },
    });

    res.status(200).json({
      id,
      status: 'approved',
      collection,
      document_id,
    });
  };
}

export function handleModerationReject(db: Firestore) {
  return async (req: AdminAuthenticatedRequest, res: Response): Promise<void> => {
    const id = req.params.id as string;
    const { reason } = req.body;

    const doc = await db.collection('moderation_queue').doc(id).get();
    if (!doc.exists) {
      sendError(res, 404, 'not_found', `Moderation item ${id} not found`);
      return;
    }

    const item = doc.data()!;
    const collection = item.collection as string;
    const document_id = item.document_id as string;

    // Update the source document — mark as rejected and hidden
    await db.collection(collection).doc(document_id).update({
      status: 'rejected',
      hidden: true,
      rejected_at: FieldValue.serverTimestamp(),
      rejected_by: req.adminUser!.uid,
      rejection_reason: reason,
    });

    // Update the moderation queue item
    await db.collection('moderation_queue').doc(id).update({
      status: 'rejected',
      reviewed_by: req.adminUser!.uid,
      reviewed_at: FieldValue.serverTimestamp(),
      rejection_reason: reason,
    });

    await writeAuditLog(db, {
      admin_uid: req.adminUser!.uid,
      admin_email: req.adminUser!.email,
      action: 'moderation_reject',
      target_type: 'moderation',
      target_id: id,
      details: { collection, document_id },
      reason,
    });

    res.status(200).json({
      id,
      status: 'rejected',
      collection,
      document_id,
    });
  };
}
