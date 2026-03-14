import { describe, it, expect, vi } from 'vitest';
import { handleCreateOrUpdateBooth } from '../src/api/booths.js';
import { createMockResponse } from './helpers/firebase-mock.js';

describe('POST /api/booths (create)', () => {
  it('rejects invalid booth input', async () => {
    const db = { collection: vi.fn() } as any;
    const req = {
      agent: { id: 'agent-1' },
      body: { company_name: '' },
    } as any;
    const res = createMockResponse();

    await handleCreateOrUpdateBooth(db)(req, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('validation_error');
    expect(res.body.details).toHaveProperty('company_name');
  });

  it('creates a new booth when agent has none', async () => {
    let savedData: any = null;

    const mockDoc = vi.fn((id: string) => ({
      set: vi.fn(async (data: any) => {
        savedData = data;
      }),
    }));

    const db = {
      collection: vi.fn((name: string) => {
        if (name === 'booths') {
          return {
            where: vi.fn(() => ({
              limit: vi.fn(() => ({
                get: vi.fn(async () => ({
                  empty: true,
                  docs: [],
                })),
              })),
            })),
            doc: mockDoc,
          };
        }
        return { doc: vi.fn() };
      }),
    } as any;

    const req = {
      agent: { id: 'agent-1' },
      body: {
        company_name: 'Acme Corp',
        tagline: 'Building the future',
        product_description: 'AI tools for startups.',
        pricing: 'Free + $99/mo',
        founding_team: 'Jane (CEO)',
        looking_for: ['customers'],
        urls: [{ label: 'Website', url: 'https://acme.com' }],
      },
    } as any;
    const res = createMockResponse();

    await handleCreateOrUpdateBooth(db)(req, res as any);

    expect(res.statusCode).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(savedData).toBeDefined();
    expect(savedData.agent_id).toBe('agent-1');
    expect(savedData.company_name).toBe('Acme Corp');
  });

  it('updates existing booth when agent already has one', async () => {
    const updateFn = vi.fn();
    const existingBoothData = {
      id: 'booth-existing',
      agent_id: 'agent-1',
      company_name: 'Old Name',
      tagline: 'Old tagline',
      product_description: 'Old description',
    };

    const db = {
      collection: vi.fn((name: string) => {
        if (name === 'booths') {
          return {
            where: vi.fn(() => ({
              limit: vi.fn(() => ({
                get: vi.fn(async () => ({
                  empty: false,
                  docs: [{
                    id: 'booth-existing',
                    data: () => existingBoothData,
                    ref: { update: updateFn },
                  }],
                })),
              })),
            })),
            doc: vi.fn(),
          };
        }
        return { doc: vi.fn() };
      }),
    } as any;

    const req = {
      agent: { id: 'agent-1' },
      body: {
        company_name: 'Acme Corp Updated',
        tagline: 'New tagline',
        product_description: 'Updated description.',
      },
    } as any;
    const res = createMockResponse();

    await handleCreateOrUpdateBooth(db)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.id).toBe('booth-existing');
    expect(res.body.status).toBe('updated');
    expect(updateFn).toHaveBeenCalled();
    const updatedFields = updateFn.mock.calls[0][0];
    expect(updatedFields.company_name).toBe('Acme Corp Updated');
    expect(updatedFields.tagline).toBe('New tagline');
  });
});
