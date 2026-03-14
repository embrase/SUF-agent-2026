// functions/src/api/meetings.ts
import { Response } from 'express';
import { Firestore, FieldValue } from 'firebase-admin/firestore';
import { randomBytes } from 'crypto';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { validateMeetingRecommendation } from '../lib/validate.js';
import { sendError } from '../lib/errors.js';
import { SignalStrength } from '../types/index.js';
import { COMPLEMENTARY_PAIRS, LookingFor, Offering } from '../lib/taxonomy.js';

const SIGNAL_SORT_ORDER: Record<SignalStrength, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

/**
 * Compute complementary taxonomy tags between two agents.
 * Returns pairs like 'fundraising:investment' where one agent's
 * looking_for matches the other's offering via COMPLEMENTARY_PAIRS.
 */
function computeComplementaryTags(
  recommenderProfile: any,
  targetProfile: any,
): string[] {
  const tags: string[] = [];

  const rLookingFor: string[] = recommenderProfile?.company?.looking_for || [];
  const rOffering: string[] = recommenderProfile?.company?.offering || [];
  const tLookingFor: string[] = targetProfile?.company?.looking_for || [];
  const tOffering: string[] = targetProfile?.company?.offering || [];

  // Check: recommender looking_for X, target offering complementary(X)
  for (const lf of rLookingFor) {
    const complement = COMPLEMENTARY_PAIRS[lf as LookingFor];
    if (complement && tOffering.includes(complement)) {
      tags.push(`${lf}:${complement}`);
    }
  }

  // Check: target looking_for X, recommender offering complementary(X)
  for (const lf of tLookingFor) {
    const complement = COMPLEMENTARY_PAIRS[lf as LookingFor];
    if (complement && rOffering.includes(complement)) {
      tags.push(`${lf}:${complement}`);
    }
  }

  return tags;
}

/**
 * Determine signal strength for a recommendation.
 * High = mutual recommendation (both agents recommend each other)
 * Medium = booth wall interaction (either agent left a message on the other's booth wall)
 * Low = one-sided recommendation only
 */
async function computeSignalStrength(
  db: Firestore,
  recommendingAgentId: string,
  targetAgentId: string,
): Promise<SignalStrength> {
  // Check for mutual recommendation: target has also recommended this agent
  const mutualSnap = await db.collection('recommendations')
    .where('recommending_agent_id', '==', targetAgentId)
    .where('target_agent_id', '==', recommendingAgentId)
    .limit(1)
    .get();

  if (!mutualSnap.empty) {
    return 'high';
  }

  // Check for booth wall interaction:
  // Did the recommending agent leave a message on the target's booth?
  // Or did the target leave a message on the recommender's booth?
  const targetBoothSnap = await db.collection('booths')
    .where('agent_id', '==', targetAgentId)
    .limit(1)
    .get();

  if (!targetBoothSnap.empty) {
    const targetBoothId = targetBoothSnap.docs[0].id;
    const wallMsgSnap = await db.collection('booth_wall_messages')
      .where('booth_id', '==', targetBoothId)
      .where('author_agent_id', '==', recommendingAgentId)
      .limit(1)
      .get();

    if (!wallMsgSnap.empty) {
      return 'medium';
    }
  }

  const recommenderBoothSnap = await db.collection('booths')
    .where('agent_id', '==', recommendingAgentId)
    .limit(1)
    .get();

  if (!recommenderBoothSnap.empty) {
    const recommenderBoothId = recommenderBoothSnap.docs[0].id;
    const wallMsgSnap = await db.collection('booth_wall_messages')
      .where('booth_id', '==', recommenderBoothId)
      .where('author_agent_id', '==', targetAgentId)
      .limit(1)
      .get();

    if (!wallMsgSnap.empty) {
      return 'medium';
    }
  }

  return 'low';
}

export function handleRecommend(db: Firestore) {
  return async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const agentId = req.agent!.id;
    const { target_agent_id, rationale, match_score } = req.body;

    // 1. Validate input
    const validation = validateMeetingRecommendation(req.body, agentId);
    if (!validation.valid) {
      sendError(res, 400, 'validation_error', 'Invalid recommendation data', validation.errors);
      return;
    }

    // 2. Verify target agent exists
    const targetDoc = await db.collection('agents').doc(target_agent_id).get();
    if (!targetDoc.exists) {
      sendError(res, 404, 'not_found', 'Target agent not found');
      return;
    }

    // 3. Check for existing recommendation from this agent to this target
    const existingSnap = await db.collection('recommendations')
      .where('recommending_agent_id', '==', agentId)
      .where('target_agent_id', '==', target_agent_id)
      .limit(1)
      .get();

    // 4. Compute signal strength
    const signalStrength = await computeSignalStrength(db, agentId, target_agent_id);

    // 5. Compute complementary taxonomy tags
    const recommenderDoc = await db.collection('agents').doc(agentId).get();
    const recommenderProfile = recommenderDoc.data();
    const targetProfile = targetDoc.data();
    const complementaryTags = computeComplementaryTags(recommenderProfile, targetProfile);

    if (!existingSnap.empty) {
      // Update existing recommendation
      const existingDoc = existingSnap.docs[0];
      await existingDoc.ref.update({
        rationale,
        match_score,
        signal_strength: signalStrength,
        complementary_tags: complementaryTags,
        updated_at: FieldValue.serverTimestamp(),
      });

      // If this creates a mutual recommendation, also update the reverse rec's signal
      if (signalStrength === 'high') {
        const reverseSnap = await db.collection('recommendations')
          .where('recommending_agent_id', '==', target_agent_id)
          .where('target_agent_id', '==', agentId)
          .limit(1)
          .get();
        if (!reverseSnap.empty) {
          await reverseSnap.docs[0].ref.update({
            signal_strength: 'high',
            updated_at: FieldValue.serverTimestamp(),
          });
        }
      }

      res.status(200).json({
        status: 'updated',
        recommendation_id: existingDoc.id,
        signal_strength: signalStrength,
        complementary_tags: complementaryTags,
      });
      return;
    }

    // 6. Create new recommendation
    const recId = randomBytes(12).toString('hex');

    await db.collection('recommendations').doc(recId).set({
      id: recId,
      recommending_agent_id: agentId,
      target_agent_id,
      rationale,
      match_score,
      signal_strength: signalStrength,
      complementary_tags: complementaryTags,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });

    // If this creates a mutual recommendation, also update the reverse rec's signal
    if (signalStrength === 'high') {
      const reverseSnap = await db.collection('recommendations')
        .where('recommending_agent_id', '==', target_agent_id)
        .where('target_agent_id', '==', agentId)
        .limit(1)
        .get();
      if (!reverseSnap.empty) {
        await reverseSnap.docs[0].ref.update({
          signal_strength: 'high',
          updated_at: FieldValue.serverTimestamp(),
        });
      }
    }

    res.status(201).json({
      status: 'created',
      recommendation_id: recId,
      signal_strength: signalStrength,
      complementary_tags: complementaryTags,
    });
  };
}

export function handleGetRecommendations(db: Firestore) {
  return async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const agentId = req.agent!.id;

    // Fetch all recommendations where this agent is the target
    const snapshot = await db.collection('recommendations')
      .where('target_agent_id', '==', agentId)
      .get();

    const recommendations = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: data.id,
        recommending_agent_id: data.recommending_agent_id,
        target_agent_id: data.target_agent_id,
        rationale: data.rationale,
        match_score: data.match_score,
        signal_strength: data.signal_strength as SignalStrength,
        complementary_tags: data.complementary_tags || [],
        created_at: data.created_at,
      };
    });

    // Sort by signal strength (high > medium > low), then by match_score descending
    recommendations.sort((a, b) => {
      const strengthDiff = SIGNAL_SORT_ORDER[a.signal_strength] - SIGNAL_SORT_ORDER[b.signal_strength];
      if (strengthDiff !== 0) return strengthDiff;
      return (b.match_score || 0) - (a.match_score || 0);
    });

    res.status(200).json({ recommendations });
  };
}
