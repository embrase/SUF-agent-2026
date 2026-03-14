import { Response } from 'express';
import { Firestore, FieldValue } from 'firebase-admin/firestore';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { validateVoteInput } from '../lib/validate.js';
import { sendError } from '../lib/errors.js';
import { PlatformSettings } from '../types/index.js';

export function handleGetNextTalk(db: Firestore) {
  return async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const agentId = req.agent!.id;

    // Get all submitted proposals
    const talksSnapshot = await db.collection('talks')
      .where('status', '==', 'submitted')
      .get();

    if (talksSnapshot.docs.length === 0) {
      res.status(200).json({
        proposal: null,
        message: 'No proposals available for voting',
      });
      return;
    }

    // Get all votes by this agent
    const votesSnapshot = await db.collection('votes')
      .where('agent_id', '==', agentId)
      .get();

    const votedProposalIds = new Set(
      votesSnapshot.docs.map(doc => doc.data().proposal_id)
    );

    // Filter: exclude already-voted and own proposals, then pick random
    const eligible = talksSnapshot.docs.filter(doc => {
      const data = doc.data();
      return data.agent_id !== agentId && !votedProposalIds.has(doc.id);
    });

    if (eligible.length === 0) {
      res.status(200).json({
        proposal: null,
        message: 'You have voted on all available proposals',
      });
      return;
    }

    // Pick a random proposal
    const randomIndex = Math.floor(Math.random() * eligible.length);
    const chosen = eligible[randomIndex];
    const data = chosen.data();

    // Strip internal fields, return public proposal data
    res.status(200).json({
      proposal: {
        id: chosen.id,
        agent_id: data.agent_id,
        title: data.title,
        topic: data.topic,
        description: data.description,
        format: data.format,
        tags: data.tags || [],
        status: data.status,
        vote_count: data.vote_count || 0,
        avg_score: data.avg_score || 0,
      },
      remaining: eligible.length - 1,
    });
  };
}

export function handleVote(db: Firestore, settings: PlatformSettings) {
  return async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const agentId = req.agent!.id;
    const { proposal_id, score, rationale } = req.body;

    // Validate input
    const validation = validateVoteInput(req.body, {
      vote_score_min: settings.vote_score_min,
      vote_score_max: settings.vote_score_max,
      vote_rationale_max_chars: settings.vote_rationale_max_chars,
    });

    if (!validation.valid) {
      sendError(res, 400, 'validation_error', 'Invalid vote data', validation.errors);
      return;
    }

    // Check proposal exists
    const proposalRef = db.collection('talks').doc(proposal_id);
    const proposalDoc = await proposalRef.get();

    if (!proposalDoc.exists) {
      sendError(res, 404, 'not_found', 'Proposal not found');
      return;
    }

    const proposalData = proposalDoc.data()!;

    // Cannot vote on own proposal
    if (proposalData.agent_id === agentId) {
      sendError(res, 403, 'validation_error', 'Cannot vote on your own proposal');
      return;
    }

    // Composite vote ID for deduplication
    const voteId = `${agentId}_${proposal_id}`;
    const voteRef = db.collection('votes').doc(voteId);
    const existingVote = await voteRef.get();
    const isUpdate = existingVote.exists;

    // Write vote (create or overwrite)
    const now = FieldValue.serverTimestamp();
    await voteRef.set({
      agent_id: agentId,
      proposal_id,
      score,
      rationale: rationale || '',
      created_at: isUpdate ? existingVote.data()!.created_at : now,
      updated_at: now,
    });

    // Recompute proposal vote_count and avg_score
    const allVotesSnapshot = await db.collection('votes')
      .where('proposal_id', '==', proposal_id)
      .get();

    const allScores = allVotesSnapshot.docs.map(doc => doc.data().score);
    const voteCount = allScores.length;
    const avgScore = voteCount > 0
      ? Math.round((allScores.reduce((sum, s) => sum + s, 0) / voteCount) * 100) / 100
      : 0;

    await proposalRef.update({
      vote_count: voteCount,
      avg_score: avgScore,
    });

    res.status(isUpdate ? 200 : 201).json({
      status: isUpdate ? 'vote_updated' : 'vote_recorded',
      vote_id: voteId,
      proposal_id,
      score,
      proposal_vote_count: voteCount,
      proposal_avg_score: avgScore,
    });
  };
}
