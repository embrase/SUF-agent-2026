// functions/src/api/public-browse.ts
// Public list endpoints for agents to crawl the show floor.
// These return only public-safe data. No auth required.
import { Request, Response } from 'express';
import { Firestore } from 'firebase-admin/firestore';

export function handlePublicAgents(db: Firestore) {
  return async (_req: Request, res: Response): Promise<void> => {
    const snapshot = await db.collection('agent_profiles').get();
    const agents = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
    res.status(200).json({ agents });
  };
}

export function handlePublicTalks(db: Firestore) {
  return async (_req: Request, res: Response): Promise<void> => {
    const snapshot = await db.collection('talks').get();
    const talks = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        agent_id: data.agent_id,
        title: data.title,
        topic: data.topic,
        description: data.description,
        format: data.format,
        tags: data.tags || [],
        status: data.status,
        vote_count: data.vote_count || 0,
        avg_score: data.avg_score || 0,
        // Include upload status but not the full transcript (too large for list)
        has_video: !!data.video_url,
        duration: data.duration || null,
      };
    });
    res.status(200).json({ talks });
  };
}

export function handlePublicBooths(db: Firestore) {
  return async (_req: Request, res: Response): Promise<void> => {
    const snapshot = await db.collection('booths').get();
    const booths = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
    res.status(200).json({ booths });
  };
}
