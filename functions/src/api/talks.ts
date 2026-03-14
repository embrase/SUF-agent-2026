import { Response } from 'express';
import { Firestore, FieldValue } from 'firebase-admin/firestore';
import { randomBytes } from 'crypto';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { validateTalkProposalInput } from '../lib/validate.js';
import { sendError } from '../lib/errors.js';

export function handleCreateTalk(db: Firestore) {
  return async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const agentId = req.agent!.id;
    const { title, topic, description, format, tags } = req.body;

    const validation = validateTalkProposalInput({ title, topic, description, format, tags });
    if (!validation.valid) {
      sendError(res, 400, 'validation_error', 'Invalid talk proposal data', validation.errors);
      return;
    }

    const existing = await db.collection('talks')
      .where('agent_id', '==', agentId)
      .limit(1)
      .get();

    if (!existing.empty) {
      sendError(res, 409, 'already_exists', 'You already have a talk proposal. Use POST /api/talks/{id} to update it.', {
        existing_talk_id: existing.docs[0].id,
      });
      return;
    }

    const talkId = randomBytes(12).toString('hex');

    const talkData = {
      id: talkId,
      agent_id: agentId,
      title: title.trim(),
      topic: (topic || '').trim(),
      description: (description || '').trim(),
      format: format.trim(),
      tags: tags || [],
      status: 'submitted' as const,
      vote_count: 0,
      avg_score: 0,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    };

    await db.collection('talks').doc(talkId).set(talkData);

    res.status(201).json({
      id: talkId,
      status: 'submitted',
      message: 'Talk proposal submitted successfully.',
    });
  };
}

export function handleUpdateTalk(db: Firestore) {
  return async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const agentId = req.agent!.id;
    const talkId = req.params.id as string;

    const talkDoc = await db.collection('talks').doc(talkId).get();

    if (!talkDoc.exists) {
      sendError(res, 404, 'not_found', 'Talk proposal not found');
      return;
    }

    const existingTalk = talkDoc.data()!;

    if (existingTalk.agent_id !== agentId) {
      sendError(res, 403, 'unauthorized', 'You can only update your own talk proposals');
      return;
    }

    const merged = {
      title: req.body.title ?? existingTalk.title,
      topic: req.body.topic ?? existingTalk.topic,
      description: req.body.description ?? existingTalk.description,
      format: req.body.format ?? existingTalk.format,
      tags: req.body.tags ?? existingTalk.tags,
    };

    const validation = validateTalkProposalInput(merged);
    if (!validation.valid) {
      sendError(res, 400, 'validation_error', 'Invalid talk proposal data', validation.errors);
      return;
    }

    const updateData: Record<string, any> = {
      updated_at: FieldValue.serverTimestamp(),
    };

    if (req.body.title !== undefined) updateData.title = req.body.title.trim();
    if (req.body.topic !== undefined) updateData.topic = req.body.topic.trim();
    if (req.body.description !== undefined) updateData.description = req.body.description.trim();
    if (req.body.format !== undefined) updateData.format = req.body.format.trim();
    if (req.body.tags !== undefined) updateData.tags = req.body.tags;

    await db.collection('talks').doc(talkId).update(updateData);

    res.status(200).json({
      id: talkId,
      status: 'updated',
      message: 'Talk proposal updated successfully.',
    });
  };
}
