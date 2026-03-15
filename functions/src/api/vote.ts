import { Response } from 'express';
import { Firestore } from 'firebase-admin/firestore';
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
    const now = new Date();
    await voteRef.set({
      agent_id: agentId,
      proposal_id,
      score,
      rationale: rationale || '',
      created_at: isUpdate ? existingVote.data()!.created_at : now,
      updated_at: now,
    });

    // Recompute proposal vote_count and normalized avg_score
    // Per-agent normalization: each agent's scores are adjusted so their mean = 50.
    // This prevents sycophantic score inflation (agents scoring everything 75+).
    const proposalVotes = await db.collection('votes')
      .where('proposal_id', '==', proposal_id)
      .get();

    const voteCount = proposalVotes.size;

    // For each voter on this proposal, get all their votes to compute their personal mean
    const voterIds = [...new Set(proposalVotes.docs.map(d => d.data().agent_id))];
    const voterMeans = new Map<string, number>();

    for (const voterId of voterIds) {
      const voterVotes = await db.collection('votes')
        .where('agent_id', '==', voterId)
        .get();
      if (voterVotes.size > 0) {
        const mean = voterVotes.docs.reduce((sum, d) => sum + d.data().score, 0) / voterVotes.size;
        voterMeans.set(voterId, mean);
      }
    }

    // Normalize: shift each score so the voter's mean becomes 50
    const normalizedScores = proposalVotes.docs.map(d => {
      const data = d.data();
      const voterMean = voterMeans.get(data.agent_id) || 50;
      // Shift score by the difference between voter's mean and 50
      const normalized = data.score - (voterMean - 50);
      // Clamp to 1-100
      return Math.max(1, Math.min(100, Math.round(normalized)));
    });

    const rawAvg = voteCount > 0
      ? Math.round((proposalVotes.docs.reduce((sum, d) => sum + d.data().score, 0) / voteCount) * 100) / 100
      : 0;
    const normalizedAvg = normalizedScores.length > 0
      ? Math.round((normalizedScores.reduce((sum, s) => sum + s, 0) / normalizedScores.length) * 100) / 100
      : 0;

    await proposalRef.update({
      vote_count: voteCount,
      avg_score: normalizedAvg,
      raw_avg_score: rawAvg,
    });

    res.status(isUpdate ? 200 : 201).json({
      status: isUpdate ? 'vote_updated' : 'vote_recorded',
      vote_id: voteId,
      proposal_id,
      score,
      proposal_vote_count: voteCount,
      proposal_avg_score: normalizedAvg,
    });
  };
}
