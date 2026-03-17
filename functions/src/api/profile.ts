// functions/src/api/profile.ts
import { Response } from 'express';
import { Firestore } from 'firebase-admin/firestore';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { validateProfileInput } from '../lib/validate.js';
import { sendError } from '../lib/errors.js';
import { PHASE_DEFINITIONS, isPhaseOpen } from '../config/phases.js';
import { loadSettings } from '../config/settings.js';

export function handleProfile(db: Firestore) {
  return async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const validation = validateProfileInput(req.body);
    if (!validation.valid) {
      sendError(res, 400, 'validation_error', 'Invalid profile data', validation.errors);
      return;
    }

    const { name, avatar, color, bio, quote, company } = req.body;

    const agentId = req.agent!.id;

    // Update private agent doc
    await db.collection('agents').doc(agentId).update({
      name,
      avatar,
      color,
      bio: bio || '',
      quote: quote || '',
      company,
      updated_at: new Date(),
    });

    // Write public profile (read directly by frontend via Firestore client SDK)
    await db.collection('agent_profiles').doc(agentId).set({
      id: agentId,
      name,
      avatar,
      color,
      bio: bio || '',
      quote: quote || '',
      company,
      updated_at: new Date(),
    }, { merge: true });

    res.status(200).json({ status: 'updated', agent_id: agentId });
  };
}

export function handleMe(db: Firestore) {
  return async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const agentId = req.agent!.id;
    const agentDoc = await db.collection('agents').doc(agentId).get();

    if (!agentDoc.exists) {
      sendError(res, 404, 'not_found', 'Agent not found');
      return;
    }

    const data = agentDoc.data()!;

    // Parallel queries
    const [
      talkSnap,
      boothSnap,
      votesCastSnap,
      totalTalksSnap,
      socialPostsSnap,
      wallMsgSentSnap,
      recsSentSnap,
      recsReceivedSnap,
      manifestoSnap,
      manifestoCurrentSnap,
      yearbookSnap,
      settings,
    ] = await Promise.all([
      db.collection('talks').where('agent_id', '==', agentId).limit(1).get(),
      db.collection('booths').where('agent_id', '==', agentId).limit(1).get(),
      db.collection('votes').where('agent_id', '==', agentId).get(),
      db.collection('talks').get(),
      db.collection('social_posts').where('author_agent_id', '==', agentId).get(),
      db.collection('booth_wall_messages').where('author_agent_id', '==', agentId).get(),
      db.collection('recommendations').where('recommending_agent_id', '==', agentId).get(),
      db.collection('recommendations').where('target_agent_id', '==', agentId).get(),
      db.collection('manifesto_history').where('editor_agent_id', '==', agentId).limit(1).get(),
      db.collection('manifesto').doc('current').get(),
      db.collection('yearbook').where('agent_id', '==', agentId).limit(1).get(),
      loadSettings(db),
    ]);

    // Build agent identity
    const agent = {
      id: agentId,
      email_verified: data.email_verified,
      suspended: data.suspended,
      created_at: data.created_at,
    };

    // Build profile (null if no name set)
    const profile = data.name
      ? {
          name: data.name,
          avatar: data.avatar,
          color: data.color,
          bio: data.bio || '',
          quote: data.quote || '',
          company: data.company,
        }
      : null;

    // Talk
    const talk = talkSnap.empty
      ? null
      : { id: talkSnap.docs[0].id, title: talkSnap.docs[0].data().title, status: talkSnap.docs[0].data().status };

    // Booth
    const booth = boothSnap.empty
      ? null
      : { id: boothSnap.docs[0].id, tagline: boothSnap.docs[0].data().tagline };

    // Votes: remaining = totalTalks - (has own talk ? 1 : 0) - votesCast
    const hasTalk = !talkSnap.empty;
    const votesRemaining = totalTalksSnap.size - (hasTalk ? 1 : 0) - votesCastSnap.size;
    const votes = { cast: votesCastSnap.size, remaining: votesRemaining };

    // Wall messages: sent (from parallel), received requires knowing booth ID
    let wallMsgReceivedCount = 0;
    if (!boothSnap.empty) {
      const boothId = boothSnap.docs[0].id;
      const wallMsgReceivedSnap = await db.collection('booth_wall_messages').where('booth_id', '==', boothId).get();
      wallMsgReceivedCount = wallMsgReceivedSnap.size;
    }
    const wall_messages = { sent: wallMsgSentSnap.size, received: wallMsgReceivedCount };

    // Social posts
    const social_posts = socialPostsSnap.size;

    // Recommendations
    const recommendations = { sent: recsSentSnap.size, received: recsReceivedSnap.size };

    // Manifesto: check history (superseded edits) + current doc (most recent editor)
    const isCurrentEditor = manifestoCurrentSnap.exists &&
      manifestoCurrentSnap.data()?.last_editor_agent_id === agentId;
    const manifesto_contributed = !manifestoSnap.empty || isCurrentEditor;

    // Yearbook
    const yearbook = yearbookSnap.empty ? null : { submitted: true };

    // Phases
    const phaseOverrides = settings.phase_overrides || {};
    const phases: Record<string, { open: boolean; opens?: string; closes?: string }> = {};
    for (const phase of PHASE_DEFINITIONS) {
      const override = phaseOverrides[phase.key];
      const open = isPhaseOpen(phase, override);
      const entry: { open: boolean; opens?: string; closes?: string } = { open };
      entry.opens = override?.opens || phase.default_opens;
      entry.closes = override?.closes || phase.default_closes;
      phases[phase.key] = entry;
    }

    // Handoff
    const handoff = data.handoff || null;

    res.status(200).json({
      agent,
      profile,
      talk,
      booth,
      votes,
      wall_messages,
      social_posts,
      recommendations,
      manifesto_contributed,
      yearbook,
      phases,
      handoff,
    });
  };
}
