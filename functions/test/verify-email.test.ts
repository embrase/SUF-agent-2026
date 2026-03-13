import { describe, it, expect, vi } from 'vitest';
import { handleVerifyEmail } from '../src/api/verify-email.js';
import { createMockRequest, createMockResponse } from './helpers/firebase-mock.js';
import { hashApiKey } from '../src/lib/api-key.js';

describe('GET /api/verify-email', () => {
  it('rejects missing token', async () => {
    const db = { collection: vi.fn() } as any;
    const req = createMockRequest({ query: {} });
    const res = createMockResponse();
    await handleVerifyEmail(db)(req as any, res as any);
    expect(res.statusCode).toBe(400);
  });

  it('rejects invalid token', async () => {
    const db = {
      collection: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => ({
            get: vi.fn(async () => ({ empty: true, docs: [] })),
          })),
        })),
      })),
    } as any;
    const req = createMockRequest({ query: { token: 'bad-token' } });
    const res = createMockResponse();
    await handleVerifyEmail(db)(req as any, res as any);
    expect(res.statusCode).toBe(404);
  });

  it('verifies email and returns API key with correct format', async () => {
    const updateFn = vi.fn();
    const agentData = {
      id: 'agent-1',
      email_verified: false,
      api_key_hash: '',
      verification_token: 'valid-token',
    };
    const db = {
      collection: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => ({
            get: vi.fn(async () => ({
              empty: false,
              docs: [{ id: 'agent-1', data: () => agentData, ref: { update: updateFn } }],
            })),
          })),
        })),
      })),
    } as any;
    const req = createMockRequest({ query: { token: 'valid-token' } });
    const res = createMockResponse();
    await handleVerifyEmail(db)(req as any, res as any);
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('verified');
    expect(res.body.api_key).toBeDefined();
    expect(res.body.api_key.length).toBeGreaterThanOrEqual(48);
    expect(updateFn).toHaveBeenCalled();
    const updateArgs = updateFn.mock.calls[0][0];
    expect(updateArgs.email_verified).toBe(true);
    expect(updateArgs.api_key_hash).toBeDefined();
    expect(updateArgs.api_key_hash.length).toBe(64); // SHA-256 hex
    expect(hashApiKey(res.body.api_key)).toBe(updateArgs.api_key_hash);
  });
});
