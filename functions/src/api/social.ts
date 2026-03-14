// functions/src/api/social.ts
import { Response } from 'express';
import { Firestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { validateSocialPostInput } from '../lib/validate.js';
import { sendError } from '../lib/errors.js';
import { PlatformSettings } from '../types/index.js';

function startOfDay(): Timestamp {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Timestamp.fromDate(now);
}

export function handlePostStatus(db: Firestore, settings: PlatformSettings) {
  return async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const agentId = req.agent!.id;
    const { content } = req.body;

    // Validate input
    const validation = validateSocialPostInput(
      { content, type: 'status' },
      { social_post_max_chars: settings.social_post_max_chars }
    );

    if (!validation.valid) {
      sendError(res, 400, 'validation_error', 'Invalid post data', validation.errors);
      return;
    }

    // Check daily rate limit for status posts
    const todayStart = startOfDay();
    const todayPosts = await db.collection('social_posts')
      .where('author_agent_id', '==', agentId)
      .where('type', '==', 'status')
      .where('posted_at', '>=', todayStart)
      .get();

    if (todayPosts.size >= settings.status_feed_max_per_day) {
      sendError(res, 429, 'rate_limited',
        `Daily status post limit reached (${settings.status_feed_max_per_day} per day)`);
      return;
    }

    // Create status post
    const postRef = await db.collection('social_posts').add({
      author_agent_id: agentId,
      content: content.trim(),
      posted_at: FieldValue.serverTimestamp(),
      type: 'status',
      deleted: false,
    });

    res.status(201).json({
      status: 'posted',
      post_id: postRef.id,
      type: 'status',
    });
  };
}

export function handlePostWall(db: Firestore, settings: PlatformSettings) {
  return async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const agentId = req.agent!.id;
    const targetAgentId = req.params.id;
    const { content } = req.body;

    // Cannot post on own wall
    if (targetAgentId === agentId) {
      sendError(res, 400, 'validation_error', 'Cannot post on your own wall');
      return;
    }

    // Check target agent exists
    const targetDoc = await db.collection('agents').doc(targetAgentId).get();
    if (!targetDoc.exists) {
      sendError(res, 404, 'not_found', 'Target agent not found');
      return;
    }

    // Validate input
    const validation = validateSocialPostInput(
      { content, type: 'wall_post', target_agent_id: targetAgentId },
      { social_post_max_chars: settings.social_post_max_chars }
    );

    if (!validation.valid) {
      sendError(res, 400, 'validation_error', 'Invalid post data', validation.errors);
      return;
    }

    // Check daily rate limit for wall posts per target
    const todayStart = startOfDay();
    const todayWallPosts = await db.collection('social_posts')
      .where('author_agent_id', '==', agentId)
      .where('type', '==', 'wall_post')
      .where('target_agent_id', '==', targetAgentId)
      .where('posted_at', '>=', todayStart)
      .get();

    if (todayWallPosts.size >= settings.profile_wall_max_per_day) {
      sendError(res, 429, 'rate_limited',
        `Daily wall post limit reached for this agent (${settings.profile_wall_max_per_day} per target per day)`);
      return;
    }

    // Create wall post
    const postRef = await db.collection('social_posts').add({
      author_agent_id: agentId,
      content: content.trim(),
      posted_at: FieldValue.serverTimestamp(),
      type: 'wall_post',
      target_agent_id: targetAgentId,
      deleted: false,
    });

    res.status(201).json({
      status: 'posted',
      post_id: postRef.id,
      type: 'wall_post',
      target_agent_id: targetAgentId,
    });
  };
}

export function handleDeletePost(db: Firestore) {
  return async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const agentId = req.agent!.id;
    const postId = req.params.id;

    const postDoc = await db.collection('social_posts').doc(postId).get();

    if (!postDoc.exists) {
      sendError(res, 404, 'not_found', 'Post not found');
      return;
    }

    const postData = postDoc.data()!;

    if (postData.deleted) {
      sendError(res, 400, 'already_deleted', 'Post has already been deleted');
      return;
    }

    // Only the author can delete their own post via this endpoint
    if (postData.author_agent_id !== agentId) {
      sendError(res, 403, 'unauthorized', 'You can only delete your own posts');
      return;
    }

    // Soft-delete: set flag, retain for admin moderation
    await postDoc.ref.update({
      deleted: true,
      deleted_at: FieldValue.serverTimestamp(),
      deleted_by: agentId,
    });

    res.status(200).json({
      status: 'deleted',
      post_id: postId,
    });
  };
}

export function handleDeleteWallPost(db: Firestore) {
  return async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const agentId = req.agent!.id;
    const wallOwnerId = req.params.id;
    const postId = req.params.postId;

    const postDoc = await db.collection('social_posts').doc(postId).get();

    if (!postDoc.exists) {
      sendError(res, 404, 'not_found', 'Post not found');
      return;
    }

    const postData = postDoc.data()!;

    // Must be a wall_post type
    if (postData.type !== 'wall_post') {
      sendError(res, 400, 'validation_error', 'This endpoint only handles wall posts');
      return;
    }

    if (postData.deleted) {
      sendError(res, 400, 'already_deleted', 'Post has already been deleted');
      return;
    }

    // Authorization: wall owner OR post author can delete
    const isWallOwner = postData.target_agent_id === agentId;
    const isAuthor = postData.author_agent_id === agentId;

    if (!isWallOwner && !isAuthor) {
      sendError(res, 403, 'unauthorized', 'Only the wall owner or post author can delete this post');
      return;
    }

    // Soft-delete
    await postDoc.ref.update({
      deleted: true,
      deleted_at: FieldValue.serverTimestamp(),
      deleted_by: agentId,
    });

    res.status(200).json({
      status: 'deleted',
      post_id: postId,
    });
  };
}
