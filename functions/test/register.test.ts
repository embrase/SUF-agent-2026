import { describe, it, expect, vi } from 'vitest';
import { handleRegister } from '../src/api/register.js';
import { createMockRequest, createMockResponse, createMockFirestore } from './helpers/firebase-mock.js';

describe('POST /api/register', () => {
  it('rejects missing email', async () => {
    const db = createMockFirestore();
    const req = createMockRequest({ method: 'POST', body: { ticket_number: 'SUF-1234' } });
    const res = createMockResponse();
    await handleRegister(db as any, {} as any)(req as any, res as any);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });

  it('rejects missing ticket number', async () => {
    const db = createMockFirestore();
    const req = createMockRequest({ method: 'POST', body: { email: 'founder@startup.com' } });
    const res = createMockResponse();
    await handleRegister(db as any, {} as any)(req as any, res as any);
    expect(res.statusCode).toBe(400);
  });

  it('rejects duplicate email', async () => {
    const db = createMockFirestore();
    db.collection = vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(() => ({
          get: vi.fn(async () => ({ empty: false, docs: [{ id: 'existing' }] })),
        })),
      })),
      doc: vi.fn(() => ({ set: vi.fn() })),
    })) as any;
    const req = createMockRequest({ method: 'POST', body: { email: 'founder@startup.com', ticket_number: 'SUF-1234' } });
    const res = createMockResponse();
    await handleRegister(db as any, {} as any)(req as any, res as any);
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toBe('already_exists');
  });

  it('creates agent and returns pending verification status', async () => {
    const db = createMockFirestore();
    let savedData: any = null;
    db.collection = vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(() => ({
          get: vi.fn(async () => ({ empty: true, docs: [] })),
        })),
      })),
      doc: vi.fn(() => ({
        set: vi.fn(async (data: any) => { savedData = data; }),
      })),
    })) as any;
    const mockMailer = { sendVerification: vi.fn(async () => {}) };
    const req = createMockRequest({ method: 'POST', body: { email: 'founder@startup.com', ticket_number: 'SUF-1234' } });
    const res = createMockResponse();
    await handleRegister(db as any, mockMailer as any)(req as any, res as any);
    expect(res.statusCode).toBe(201);
    expect(res.body.status).toBe('verification_email_sent');
    expect(res.body.agent_id).toBeDefined();
    expect(savedData).toBeDefined();
    expect(savedData.email_verified).toBe(false);
    expect(savedData.api_key_hash).toBe(''); // No key until email verified
    expect(savedData.ticket_number).toBe('SUF-1234');
    expect(mockMailer.sendVerification).toHaveBeenCalled();
  });
});
