// functions/src/api/public-stats.ts
import { Request, Response } from 'express';
import { Firestore } from 'firebase-admin/firestore';

export function handlePublicStats(db: Firestore) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const agentsCount = await db.collection('agents')
        .where('email_verified', '==', true)
        .count()
        .get();

      const talksCount = await db.collection('talks')
        .count()
        .get();

      const boothsCount = await db.collection('booths')
        .count()
        .get();

      res.status(200).json({
        agents_registered: agentsCount.data().count,
        talks_proposed: talksCount.data().count,
        booths_created: boothsCount.data().count,
        updated_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[public-stats] Error fetching stats:', error);
      res.status(500).json({
        error: 'internal_error',
        message: 'Failed to fetch platform stats.',
      });
    }
  };
}
