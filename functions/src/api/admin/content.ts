import { Request, Response } from 'express';
import { Firestore } from 'firebase-admin/firestore';
import { sendError } from '../../lib/errors.js';
import { writeAuditLog } from '../../lib/audit-log.js';
import { AdminAuthenticatedRequest } from '../../middleware/admin-auth.js';

const VALID_COLLECTIONS = ['agents', 'talks', 'booths', 'social_posts', 'booth_wall_messages'];

function validateCollection(collection: string): boolean {
  return VALID_COLLECTIONS.includes(collection);
}

export function handleListTalks(db: Firestore) {
  return async (req: Request, res: Response): Promise<void> => {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);

    const snapshot = await db.collection('talks')
      .orderBy('created_at', 'desc')
      .limit(limit)
      .get();

    const talks = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.status(200).json({ talks, count: talks.length });
  };
}

export function handleListBooths(db: Firestore) {
  return async (req: Request, res: Response): Promise<void> => {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);

    const snapshot = await db.collection('booths')
      .orderBy('created_at', 'desc')
      .limit(limit)
      .get();

    const booths = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.status(200).json({ booths, count: booths.length });
  };
}

export function handleListSocial(db: Firestore) {
  return async (req: Request, res: Response): Promise<void> => {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);

    // Admin sees ALL posts including soft-deleted ones
    const snapshot = await db.collection('social_posts')
      .orderBy('posted_at', 'desc')
      .limit(limit)
      .get();

    const social_posts = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.status(200).json({ social_posts, count: social_posts.length });
  };
}

export function handleHideContent(db: Firestore) {
  return async (req: AdminAuthenticatedRequest, res: Response): Promise<void> => {
    const id = req.params.id as string;
    const { collection, reason } = req.body;

    if (!collection || !validateCollection(collection)) {
      sendError(res, 400, 'validation_error',
        `Field "collection" is required. Must be one of: ${VALID_COLLECTIONS.join(', ')}`);
      return;
    }

    const collectionName = collection as string;
    const doc = await db.collection(collectionName).doc(id).get();
    if (!doc.exists) {
      sendError(res, 404, 'not_found', `Item ${id} not found in ${collectionName}`);
      return;
    }

    await db.collection(collectionName).doc(id).update({
      hidden: true,
      hidden_at: new Date(),
      hidden_by: req.adminUser!.uid,
    });

    await writeAuditLog(db, {
      admin_uid: req.adminUser!.uid,
      admin_email: req.adminUser!.email,
      action: 'content_hide',
      target_type: collectionName,
      target_id: id,
      details: { collection: collectionName },
      reason,
    });

    res.status(200).json({
      id,
      collection: collectionName,
      hidden: true,
    });
  };
}

export function handleApproveContent(db: Firestore) {
  return async (req: AdminAuthenticatedRequest, res: Response): Promise<void> => {
    const id = req.params.id as string;
    const { collection, reason } = req.body;

    if (!collection || !validateCollection(collection)) {
      sendError(res, 400, 'validation_error',
        `Field "collection" is required. Must be one of: ${VALID_COLLECTIONS.join(', ')}`);
      return;
    }

    const collectionName = collection as string;
    const doc = await db.collection(collectionName).doc(id).get();
    if (!doc.exists) {
      sendError(res, 404, 'not_found', `Item ${id} not found in ${collectionName}`);
      return;
    }

    await db.collection(collectionName).doc(id).update({
      status: 'approved',
      hidden: false,
      approved_at: new Date(),
      approved_by: req.adminUser!.uid,
    });

    await writeAuditLog(db, {
      admin_uid: req.adminUser!.uid,
      admin_email: req.adminUser!.email,
      action: 'content_approve',
      target_type: collectionName,
      target_id: id,
      details: { collection: collectionName },
      reason,
    });

    res.status(200).json({
      id,
      collection: collectionName,
      status: 'approved',
    });
  };
}
