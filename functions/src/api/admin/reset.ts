// functions/src/api/admin/reset.ts
import { Response } from 'express';
import { Firestore, FieldValue } from 'firebase-admin/firestore';
import { AdminAuthenticatedRequest } from '../../middleware/admin-auth.js';
import { sendError } from '../../lib/errors.js';

const CONTENT_COLLECTIONS = [
  'talks', 'booths', 'votes', 'social_posts', 'booth_wall_messages',
  'recommendations', 'manifesto_history', 'yearbook',
];

const PROFILE_FIELDS_TO_CLEAR = [
  'name', 'avatar', 'color', 'bio', 'quote', 'company',
];

export function handleReset(db: Firestore) {
  return async (req: AdminAuthenticatedRequest, res: Response): Promise<void> => {
    const { collections, reset_profiles, confirm } = req.body;

    if (confirm !== 'RESET') {
      sendError(res, 400, 'validation_error', 'Must send confirm: "RESET" to proceed');
      return;
    }

    const targetCollections = collections && Array.isArray(collections)
      ? collections.filter((c: string) => CONTENT_COLLECTIONS.includes(c))
      : CONTENT_COLLECTIONS;

    let totalDeleted = 0;

    // Delete documents from each content collection
    for (const collName of targetCollections) {
      const snapshot = await db.collection(collName).get();
      const batch = db.batch();
      snapshot.docs.forEach(doc => batch.delete(doc.ref));
      if (!snapshot.empty) {
        await batch.commit();
        totalDeleted += snapshot.size;
      }
    }

    // Handle manifesto collection specially — delete all docs then re-seed
    if (targetCollections.includes('manifesto_history') || collections === undefined) {
      // Delete manifesto lock if it exists
      const lockDoc = await db.collection('manifesto').doc('lock').get();
      if (lockDoc.exists) {
        await db.collection('manifesto').doc('lock').delete();
        totalDeleted += 1;
      }

      // Re-seed manifesto/current with empty content
      await db.collection('manifesto').doc('current').set({
        content: '',
        version: 0,
        last_editor_agent_id: null,
        edit_summary: null,
        updated_at: FieldValue.serverTimestamp(),
      });
    }

    // Optionally reset agent profile fields (preserve identity)
    let agentsPreserved = 0;
    if (reset_profiles) {
      const agentsSnapshot = await db.collection('agents').get();
      agentsPreserved = agentsSnapshot.size;
      const batch = db.batch();
      for (const doc of agentsSnapshot.docs) {
        const clearData: Record<string, any> = {};
        for (const field of PROFILE_FIELDS_TO_CLEAR) {
          clearData[field] = FieldValue.delete();
        }
        clearData['updated_at'] = FieldValue.serverTimestamp();
        batch.update(doc.ref, clearData);
      }
      if (!agentsSnapshot.empty) await batch.commit();
    } else {
      const agentsCount = await db.collection('agents').count().get();
      agentsPreserved = agentsCount.data().count;
    }

    res.status(200).json({
      status: 'reset_complete',
      cleared: targetCollections,
      documents_deleted: totalDeleted,
      agents_preserved: agentsPreserved,
      profiles_reset: !!reset_profiles,
    });
  };
}
