// functions/src/api/talk-upload.ts
import { Response } from 'express';
import { Firestore, FieldValue } from 'firebase-admin/firestore';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { validateTalkUpload } from '../lib/validate.js';
import { sendError } from '../lib/errors.js';
import { PlatformSettings } from '../types/index.js';

type SettingsGetter = () => Promise<Pick<PlatformSettings, 'talk_max_duration_seconds' | 'talk_accepted_formats' | 'talk_accepted_languages'>>;

export function handleTalkUpload(db: Firestore, getSettings: SettingsGetter) {
  return async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const proposalId = req.params.id as string;
    const agentId = req.agent!.id;

    // 1. Verify proposal exists (proposals are stored in 'talks' collection)
    const proposalDoc = await db.collection('talks').doc(proposalId).get();
    if (!proposalDoc.exists) {
      sendError(res, 404, 'not_found', 'Talk proposal not found');
      return;
    }

    const proposal = proposalDoc.data()!;

    // 2. Verify agent owns this proposal
    if (proposal.agent_id !== agentId) {
      sendError(res, 403, 'unauthorized', 'You can only upload talks for your own proposals');
      return;
    }

    // 3. Validate upload input against platform settings
    const settings = await getSettings();
    const validation = validateTalkUpload(req.body, settings);
    if (!validation.valid) {
      sendError(res, 400, 'validation_error', 'Invalid talk upload data', validation.errors);
      return;
    }

    const { video_url, transcript, subtitle_file, language, duration, thumbnail } = req.body;

    // 4. Merge upload data into the proposal document (not a separate doc)
    await db.collection('talks').doc(proposalId).update({
      status: 'talk_uploaded',
      video_url,
      transcript,
      subtitle_file: subtitle_file || '',
      language: language.toUpperCase(),
      duration,
      thumbnail: thumbnail || '',
      uploaded_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });

    res.status(201).json({
      status: 'talk_uploaded',
      talk_id: proposalId,
      proposal_id: proposalId,
      message: 'Talk uploaded successfully. Video URL stored — platform does not fetch or validate the video.',
    });
  };
}
