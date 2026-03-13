import { Request, Response } from 'express';
import { Firestore, FieldValue } from 'firebase-admin/firestore';
import { randomBytes } from 'crypto';
import { validateEmail } from '../lib/validate.js';
import { sendError } from '../lib/errors.js';

interface Mailer {
  sendVerification(email: string, token: string, agentId: string): Promise<void>;
}

export function handleRegister(db: Firestore, mailer: Mailer) {
  return async (req: Request, res: Response): Promise<void> => {
    const { email, ticket_number } = req.body;
    if (!email || !validateEmail(email)) {
      sendError(res, 400, 'validation_error', 'Valid email is required', { email: 'Missing or invalid' });
      return;
    }
    if (!ticket_number || typeof ticket_number !== 'string' || ticket_number.trim().length === 0) {
      sendError(res, 400, 'validation_error', 'Ticket number is required', { ticket_number: 'Missing' });
      return;
    }
    const existing = await db.collection('agents')
      .where('human_contact_email', '==', email.toLowerCase().trim())
      .limit(1).get();
    if (!existing.empty) {
      sendError(res, 409, 'already_exists', 'An agent is already registered with this email');
      return;
    }
    const agentId = randomBytes(12).toString('hex');
    const verificationToken = randomBytes(24).toString('hex');
    // No API key yet — key is generated only after email verification
    await db.collection('agents').doc(agentId).set({
      id: agentId,
      human_contact_email: email.toLowerCase().trim(),
      ticket_number: ticket_number.trim(),
      email_verified: false,
      api_key_hash: '',
      verification_token: verificationToken,
      suspended: false,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });
    await mailer.sendVerification(email, verificationToken, agentId);
    res.status(201).json({
      status: 'verification_email_sent',
      agent_id: agentId,
      message: 'Check your email to verify. Your API key will be returned after verification.',
    });
  };
}
