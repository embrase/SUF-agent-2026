import { describe, it, expect, vi } from 'vitest';
import { handleCreateTalk, handleUpdateTalk } from '../src/api/talks.js';
import { createMockResponse } from './helpers/firebase-mock.js';

describe('POST /api/talks (create)', () => {
  it('rejects invalid talk proposal input', async () => {
    const db = { collection: vi.fn() } as any;
    const req = {
      agent: { id: 'agent-1' },
      body: { title: '', format: '' },
    } as any;
    const res = createMockResponse();

    await handleCreateTalk(db)(req, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('validation_error');
    expect(res.body.details).toHaveProperty('title');
    expect(res.body.details).toHaveProperty('format');
  });

  it('rejects agent that already has a talk proposal', async () => {
    const db = {
      collection: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => ({
            get: vi.fn(async () => ({
              empty: false,
              docs: [{ id: 'existing-talk', data: () => ({ id: 'existing-talk' }) }],
            })),
          })),
        })),
        doc: vi.fn(),
      })),
    } as any;

    const req = {
      agent: { id: 'agent-1' },
      body: {
        title: 'My Talk',
        format: 'keynote',
        topic: 'AI',
        description: 'About AI',
        tags: ['ai'],
      },
    } as any;
    const res = createMockResponse();

    await handleCreateTalk(db)(req, res as any);

    expect(res.statusCode).toBe(409);
    expect(res.body.error).toBe('already_exists');
  });

  it('creates a talk proposal with valid input', async () => {
    let savedId = '';
    let savedData: any = null;

    const mockDoc = vi.fn((id: string) => ({
      set: vi.fn(async (data: any) => {
        savedId = id;
        savedData = data;
      }),
      get: vi.fn(async () => ({ exists: false })),
    }));

    const db = {
      collection: vi.fn((name: string) => {
        if (name === 'talks') {
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
        title: 'Why AI Agents Will Change Startups',
        topic: 'The agentic revolution',
        description: 'A deep dive into AI co-founders.',
        format: 'keynote',
        tags: ['ai', 'startups'],
      },
    } as any;
    const res = createMockResponse();

    await handleCreateTalk(db)(req, res as any);

    expect(res.statusCode).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.status).toBe('submitted');
    expect(savedData).toBeDefined();
    expect(savedData.agent_id).toBe('agent-1');
    expect(savedData.title).toBe('Why AI Agents Will Change Startups');
    expect(savedData.status).toBe('submitted');
    expect(savedData.vote_count).toBe(0);
    expect(savedData.avg_score).toBe(0);
  });
});

describe('POST /api/talks/:id (update)', () => {
  it('rejects update to a talk the agent does not own', async () => {
    const db = {
      collection: vi.fn(() => ({
        doc: vi.fn(() => ({
          get: vi.fn(async () => ({
            exists: true,
            data: () => ({ agent_id: 'other-agent', status: 'submitted' }),
          })),
        })),
      })),
    } as any;

    const req = {
      agent: { id: 'agent-1' },
      params: { id: 'talk-123' },
      body: { title: 'Updated Title' },
    } as any;
    const res = createMockResponse();

    await handleUpdateTalk(db)(req, res as any);

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('unauthorized');
  });

  it('rejects update to a talk that does not exist', async () => {
    const db = {
      collection: vi.fn(() => ({
        doc: vi.fn(() => ({
          get: vi.fn(async () => ({
            exists: false,
          })),
        })),
      })),
    } as any;

    const req = {
      agent: { id: 'agent-1' },
      params: { id: 'nonexistent' },
      body: { title: 'Updated Title' },
    } as any;
    const res = createMockResponse();

    await handleUpdateTalk(db)(req, res as any);

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('not_found');
  });

  it('updates an existing talk proposal owned by the agent', async () => {
    const updateFn = vi.fn();
    const db = {
      collection: vi.fn(() => ({
        doc: vi.fn(() => ({
          get: vi.fn(async () => ({
            exists: true,
            data: () => ({
              agent_id: 'agent-1',
              title: 'Original Title',
              topic: 'Original Topic',
              description: 'Original description',
              format: 'keynote',
              tags: ['ai'],
              status: 'submitted',
            }),
          })),
          update: updateFn,
        })),
      })),
    } as any;

    const req = {
      agent: { id: 'agent-1' },
      params: { id: 'talk-123' },
      body: {
        title: 'Updated Title',
        format: 'deep dive',
      },
    } as any;
    const res = createMockResponse();

    await handleUpdateTalk(db)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('updated');
    expect(updateFn).toHaveBeenCalled();
    const updatedFields = updateFn.mock.calls[0][0];
    expect(updatedFields.title).toBe('Updated Title');
    expect(updatedFields.format).toBe('deep dive');
  });

  it('rejects update with invalid fields', async () => {
    const db = {
      collection: vi.fn(() => ({
        doc: vi.fn(() => ({
          get: vi.fn(async () => ({
            exists: true,
            data: () => ({
              agent_id: 'agent-1',
              title: 'Original Title',
              format: 'keynote',
              status: 'submitted',
            }),
          })),
        })),
      })),
    } as any;

    const req = {
      agent: { id: 'agent-1' },
      params: { id: 'talk-123' },
      body: {
        title: 'x'.repeat(101),
        format: 'keynote',
      },
    } as any;
    const res = createMockResponse();

    await handleUpdateTalk(db)(req, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });
});
