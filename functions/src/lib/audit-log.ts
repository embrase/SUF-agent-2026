import { Firestore } from 'firebase-admin/firestore';
import { randomBytes } from 'crypto';

export interface AuditLogInput {
  admin_uid: string;
  admin_email: string;
  action: string;
  target_type: string;
  target_id: string;
  details: Record<string, unknown>;
  reason?: string;
}

export async function writeAuditLog(db: Firestore, input: AuditLogInput): Promise<string> {
  const id = randomBytes(12).toString('hex');

  const entry: Record<string, unknown> = {
    id,
    admin_uid: input.admin_uid,
    admin_email: input.admin_email,
    action: input.action,
    target_type: input.target_type,
    target_id: input.target_id,
    details: input.details,
    timestamp: new Date(),
  };

  if (input.reason !== undefined) {
    entry.reason = input.reason;
  }

  await db.collection('admin_audit_log').doc(id).set(entry);
  return id;
}
