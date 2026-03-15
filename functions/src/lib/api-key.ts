import { randomBytes, createHash } from 'crypto';

export function generateApiKey(): string {
  return randomBytes(36).toString('base64url');
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function verifyApiKey(key: string, hash: string): boolean {
  return hashApiKey(key) === hash;
}
