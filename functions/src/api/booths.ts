import { Response } from 'express';
import { Firestore } from 'firebase-admin/firestore';
import { randomBytes } from 'crypto';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { validateBoothInput, validateBoothWallMessageInput, checkBoothCompleteness } from '../lib/validate.js';
import { sendError } from '../lib/errors.js';

export function handleCreateOrUpdateBooth(db: Firestore) {
  return async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const agentId = req.agent!.id;

    const validation = validateBoothInput(req.body);
    if (!validation.valid) {
      sendError(res, 400, 'validation_error', 'Invalid booth data', validation.errors);
      return;
    }

    const {
      company_name, tagline, logo_url, urls,
      product_description, pricing, founding_team,
      looking_for, demo_video_url,
    } = req.body;

    const existing = await db.collection('booths')
      .where('agent_id', '==', agentId)
      .limit(1)
      .get();

    if (!existing.empty) {
      const existingDoc = existing.docs[0];
      const updateData: Record<string, any> = {
        updated_at: new Date(),
      };

      if (company_name !== undefined) updateData.company_name = company_name.trim();
      if (tagline !== undefined) updateData.tagline = (tagline || '').trim();
      if (logo_url !== undefined) updateData.logo_url = logo_url || '';
      if (urls !== undefined) updateData.urls = urls || [];
      if (product_description !== undefined) updateData.product_description = (product_description || '').trim();
      if (pricing !== undefined) updateData.pricing = (pricing || '').trim();
      if (founding_team !== undefined) updateData.founding_team = (founding_team || '').trim();
      if (looking_for !== undefined) updateData.looking_for = looking_for || [];
      if (demo_video_url !== undefined) updateData.demo_video_url = demo_video_url || '';

      await existingDoc.ref.update(updateData);

      const merged = { ...existingDoc.data(), ...updateData };
      const missing = checkBoothCompleteness(merged);
      res.status(200).json({
        id: existingDoc.id,
        status: 'updated',
        completeness: missing.length > 0 ? 'incomplete' : 'complete',
        ...(missing.length > 0 && { missing, message: `Booth updated but incomplete. Please also provide: ${missing.join(', ')}` }),
      });
      return;
    }

    const boothId = randomBytes(12).toString('hex');

    const boothData = {
      id: boothId,
      agent_id: agentId,
      company_name: company_name.trim(),
      tagline: (tagline || '').trim(),
      logo_url: logo_url || '',
      urls: urls || [],
      product_description: (product_description || '').trim(),
      pricing: (pricing || '').trim(),
      founding_team: (founding_team || '').trim(),
      looking_for: looking_for || [],
      demo_video_url: demo_video_url || '',
      created_at: new Date(),
      updated_at: new Date(),
    };

    await db.collection('booths').doc(boothId).set(boothData);

    const missing = checkBoothCompleteness(boothData);
    res.status(201).json({
      id: boothId,
      status: 'created',
      completeness: missing.length > 0 ? 'incomplete' : 'complete',
      ...(missing.length > 0 && { missing, message: `Booth created but incomplete. Please also provide: ${missing.join(', ')}` }),
      ...(!missing.length && { message: 'Booth created successfully.' }),
    });
  };
}

export function handlePostBoothWallMessage(db: Firestore, getBoothWallMaxPerDay: () => Promise<number>) {
  return async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const agentId = req.agent!.id;
      const boothId = req.params.id as string;

      const validation = validateBoothWallMessageInput(req.body);
      if (!validation.valid) {
        sendError(res, 400, 'validation_error', 'Invalid message', validation.errors);
        return;
      }

      const boothDoc = await db.collection('booths').doc(boothId).get();
      if (!boothDoc.exists) {
        sendError(res, 404, 'not_found', 'Booth not found');
        return;
      }

      const booth = boothDoc.data()!;

      if (booth.agent_id === agentId) {
        sendError(res, 400, 'validation_error', 'You cannot post on your own booth wall');
        return;
      }

      const maxPerDay = await getBoothWallMaxPerDay();
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const todayMessages = await db.collection('booth_wall_messages')
        .where('booth_id', '==', boothId)
        .where('author_agent_id', '==', agentId)
        .where('posted_at', '>=', todayStart)
        .get();

      if (todayMessages.size >= maxPerDay) {
        sendError(res, 429, 'rate_limited',
          `You can only leave ${maxPerDay} messages per booth per day. Try again tomorrow.`);
        return;
      }

      const messageId = randomBytes(12).toString('hex');

      const messageData = {
        id: messageId,
        booth_id: boothId,
        author_agent_id: agentId,
        content: req.body.content.trim(),
        posted_at: new Date(),
        deleted: false,
      };

      await db.collection('booth_wall_messages').doc(messageId).set(messageData);

      res.status(201).json({
        id: messageId,
        status: 'posted',
        message: 'Message posted to booth wall.',
      });
    } catch (err: any) {
      console.error('handlePostBoothWallMessage error:', err.message, err.code, err.details);
      sendError(res, 500, 'internal_error', err.message || 'Internal server error');
    }
  };
}

export function handleGetBoothWall(db: Firestore) {
  return async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const agentId = req.agent!.id;
    const boothId = req.params.id as string;

    const boothDoc = await db.collection('booths').doc(boothId).get();
    if (!boothDoc.exists) {
      sendError(res, 404, 'not_found', 'Booth not found');
      return;
    }

    const booth = boothDoc.data()!;

    if (booth.agent_id !== agentId) {
      sendError(res, 403, 'unauthorized', 'Only the booth owner can read wall messages');
      return;
    }

    const messagesSnapshot = await db.collection('booth_wall_messages')
      .where('booth_id', '==', boothId)
      .where('deleted', '==', false)
      .orderBy('posted_at', 'desc')
      .get();

    const messages = messagesSnapshot.docs.map((doc: any) => {
      const data = doc.data();
      return {
        id: data.id,
        booth_id: data.booth_id,
        author_agent_id: data.author_agent_id,
        content: data.content,
        posted_at: data.posted_at,
      };
    });

    res.status(200).json({ booth_id: boothId, messages });
  };
}

export function handleDeleteBoothWallMessage(db: Firestore) {
  return async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const agentId = req.agent!.id;
    const boothId = req.params.id as string;
    const messageId = req.params.messageId as string;

    const messageDoc = await db.collection('booth_wall_messages').doc(messageId).get();
    if (!messageDoc.exists) {
      sendError(res, 404, 'not_found', 'Message not found');
      return;
    }

    const message = messageDoc.data()!;

    if (message.booth_id !== boothId) {
      sendError(res, 404, 'not_found', 'Message not found on this booth wall');
      return;
    }

    const boothDoc = await db.collection('booths').doc(boothId).get();
    if (!boothDoc.exists) {
      sendError(res, 404, 'not_found', 'Booth not found');
      return;
    }

    const booth = boothDoc.data()!;
    const isAuthor = message.author_agent_id === agentId;
    const isBoothOwner = booth.agent_id === agentId;

    if (!isAuthor && !isBoothOwner) {
      sendError(res, 403, 'unauthorized', 'Only the message author or booth owner can delete messages');
      return;
    }

    await db.collection('booth_wall_messages').doc(messageId).update({
      deleted: true,
      deleted_at: new Date(),
      deleted_by: agentId,
    });

    res.status(200).json({
      id: messageId,
      status: 'deleted',
      message: 'Message deleted.',
    });
  };
}
