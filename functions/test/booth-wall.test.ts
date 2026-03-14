import { describe, it, expect, vi } from 'vitest';
import { handlePostBoothWallMessage, handleGetBoothWall, handleDeleteBoothWallMessage } from '../src/api/booths.js';
import { createMockResponse } from './helpers/firebase-mock.js';

describe('POST /api/booths/:id/wall (post message)', () => {
  it('rejects empty message content', async () => {
    const db = {
      collection: vi.fn(() => ({
        doc: vi.fn(() => ({
          get: vi.fn(async () => ({ exists: true, data: () => ({ agent_id: 'owner-agent' }) })),
        })),
      })),
    } as any;

    const req = {
      agent: { id: 'visitor-agent' },
      params: { id: 'booth-1' },
      body: { content: '' },
    } as any;
    const res = createMockResponse();

    await handlePostBoothWallMessage(db, async () => 10)(req, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });

  it('rejects message to a nonexistent booth', async () => {
    const db = {
      collection: vi.fn(() => ({
        doc: vi.fn(() => ({
          get: vi.fn(async () => ({ exists: false })),
        })),
      })),
    } as any;

    const req = {
      agent: { id: 'visitor-agent' },
      params: { id: 'nonexistent-booth' },
      body: { content: 'Hello!' },
    } as any;
    const res = createMockResponse();

    await handlePostBoothWallMessage(db, async () => 10)(req, res as any);

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('not_found');
  });

  it('prevents booth owner from posting on own wall', async () => {
    const db = {
      collection: vi.fn(() => ({
        doc: vi.fn(() => ({
          get: vi.fn(async () => ({
            exists: true,
            data: () => ({ agent_id: 'agent-1' }),
          })),
        })),
      })),
    } as any;

    const req = {
      agent: { id: 'agent-1' },
      params: { id: 'booth-1' },
      body: { content: 'My own wall' },
    } as any;
    const res = createMockResponse();

    await handlePostBoothWallMessage(db, async () => 10)(req, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });

  it('enforces daily rate limit per visitor per booth', async () => {
    const db = {
      collection: vi.fn((name: string) => {
        if (name === 'booths') {
          return {
            doc: vi.fn(() => ({
              get: vi.fn(async () => ({
                exists: true,
                data: () => ({ agent_id: 'owner-agent' }),
              })),
            })),
          };
        }
        return {
          where: vi.fn(() => ({
            where: vi.fn(() => ({
              where: vi.fn(() => ({
                get: vi.fn(async () => ({
                  size: 10,
                })),
              })),
            })),
          })),
          doc: vi.fn(() => ({
            set: vi.fn(),
          })),
        };
      }),
    } as any;

    const req = {
      agent: { id: 'visitor-agent' },
      params: { id: 'booth-1' },
      body: { content: 'One more message' },
    } as any;
    const res = createMockResponse();

    await handlePostBoothWallMessage(db, async () => 10)(req, res as any);

    expect(res.statusCode).toBe(429);
    expect(res.body.error).toBe('rate_limited');
  });

  it('posts a message successfully when under rate limit', async () => {
    let savedData: any = null;

    const db = {
      collection: vi.fn((name: string) => {
        if (name === 'booths') {
          return {
            doc: vi.fn(() => ({
              get: vi.fn(async () => ({
                exists: true,
                data: () => ({ agent_id: 'owner-agent' }),
              })),
            })),
          };
        }
        return {
          where: vi.fn(() => ({
            where: vi.fn(() => ({
              where: vi.fn(() => ({
                get: vi.fn(async () => ({
                  size: 3,
                })),
              })),
            })),
          })),
          doc: vi.fn(() => ({
            set: vi.fn(async (data: any) => { savedData = data; }),
          })),
        };
      }),
    } as any;

    const req = {
      agent: { id: 'visitor-agent' },
      params: { id: 'booth-1' },
      body: { content: 'Great product! Would love to learn more.' },
    } as any;
    const res = createMockResponse();

    await handlePostBoothWallMessage(db, async () => 10)(req, res as any);

    expect(res.statusCode).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.status).toBe('posted');
    expect(savedData).toBeDefined();
    expect(savedData.booth_id).toBe('booth-1');
    expect(savedData.author_agent_id).toBe('visitor-agent');
    expect(savedData.content).toBe('Great product! Would love to learn more.');
    expect(savedData.deleted).toBe(false);
  });
});

describe('GET /api/booths/:id/wall (read messages)', () => {
  it('rejects non-owner from reading wall messages', async () => {
    const db = {
      collection: vi.fn(() => ({
        doc: vi.fn(() => ({
          get: vi.fn(async () => ({
            exists: true,
            data: () => ({ agent_id: 'owner-agent' }),
          })),
        })),
      })),
    } as any;

    const req = {
      agent: { id: 'visitor-agent' },
      params: { id: 'booth-1' },
    } as any;
    const res = createMockResponse();

    await handleGetBoothWall(db)(req, res as any);

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('unauthorized');
  });

  it('returns empty array when no messages', async () => {
    const db = {
      collection: vi.fn((name: string) => {
        if (name === 'booths') {
          return {
            doc: vi.fn(() => ({
              get: vi.fn(async () => ({
                exists: true,
                data: () => ({ agent_id: 'owner-agent' }),
              })),
            })),
          };
        }
        return {
          where: vi.fn(() => ({
            where: vi.fn(() => ({
              orderBy: vi.fn(() => ({
                get: vi.fn(async () => ({
                  docs: [],
                })),
              })),
            })),
          })),
        };
      }),
    } as any;

    const req = {
      agent: { id: 'owner-agent' },
      params: { id: 'booth-1' },
    } as any;
    const res = createMockResponse();

    await handleGetBoothWall(db)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.booth_id).toBe('booth-1');
    expect(res.body.messages).toEqual([]);
  });

  it('returns non-deleted messages for the booth owner', async () => {
    const mockMessages = [
      {
        data: () => ({
          id: 'msg-1',
          booth_id: 'booth-1',
          author_agent_id: 'visitor-1',
          content: 'Great booth!',
          posted_at: '2026-05-15T10:00:00Z',
        }),
      },
      {
        data: () => ({
          id: 'msg-2',
          booth_id: 'booth-1',
          author_agent_id: 'visitor-2',
          content: 'Interested in your product.',
          posted_at: '2026-05-15T11:00:00Z',
        }),
      },
    ];

    const db = {
      collection: vi.fn((name: string) => {
        if (name === 'booths') {
          return {
            doc: vi.fn(() => ({
              get: vi.fn(async () => ({
                exists: true,
                data: () => ({ agent_id: 'owner-agent' }),
              })),
            })),
          };
        }
        return {
          where: vi.fn(() => ({
            where: vi.fn(() => ({
              orderBy: vi.fn(() => ({
                get: vi.fn(async () => ({
                  docs: mockMessages,
                })),
              })),
            })),
          })),
        };
      }),
    } as any;

    const req = {
      agent: { id: 'owner-agent' },
      params: { id: 'booth-1' },
    } as any;
    const res = createMockResponse();

    await handleGetBoothWall(db)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.messages).toHaveLength(2);
    expect(res.body.messages[0].content).toBe('Great booth!');
    expect(res.body.messages[1].content).toBe('Interested in your product.');
  });
});

describe('DELETE /api/booths/:id/wall/:messageId (soft-delete)', () => {
  it('allows message author to soft-delete their own message', async () => {
    const updateFn = vi.fn();

    const db = {
      collection: vi.fn((name: string) => {
        if (name === 'booth_wall_messages') {
          return {
            doc: vi.fn(() => ({
              get: vi.fn(async () => ({
                exists: true,
                data: () => ({
                  id: 'msg-1',
                  booth_id: 'booth-1',
                  author_agent_id: 'visitor-agent',
                  content: 'My message',
                  deleted: false,
                }),
              })),
              update: updateFn,
            })),
          };
        }
        return {
          doc: vi.fn(() => ({
            get: vi.fn(async () => ({
              exists: true,
              data: () => ({ agent_id: 'owner-agent' }),
            })),
          })),
        };
      }),
    } as any;

    const req = {
      agent: { id: 'visitor-agent' },
      params: { id: 'booth-1', messageId: 'msg-1' },
    } as any;
    const res = createMockResponse();

    await handleDeleteBoothWallMessage(db)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('deleted');
    expect(updateFn).toHaveBeenCalled();
    const updateArgs = updateFn.mock.calls[0][0];
    expect(updateArgs.deleted).toBe(true);
    expect(updateArgs.deleted_by).toBe('visitor-agent');
  });

  it('allows booth owner to soft-delete any message on their wall', async () => {
    const updateFn = vi.fn();

    const db = {
      collection: vi.fn((name: string) => {
        if (name === 'booth_wall_messages') {
          return {
            doc: vi.fn(() => ({
              get: vi.fn(async () => ({
                exists: true,
                data: () => ({
                  id: 'msg-1',
                  booth_id: 'booth-1',
                  author_agent_id: 'visitor-agent',
                  content: 'Their message',
                  deleted: false,
                }),
              })),
              update: updateFn,
            })),
          };
        }
        return {
          doc: vi.fn(() => ({
            get: vi.fn(async () => ({
              exists: true,
              data: () => ({ agent_id: 'owner-agent' }),
            })),
          })),
        };
      }),
    } as any;

    const req = {
      agent: { id: 'owner-agent' },
      params: { id: 'booth-1', messageId: 'msg-1' },
    } as any;
    const res = createMockResponse();

    await handleDeleteBoothWallMessage(db)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('deleted');
    expect(updateFn).toHaveBeenCalled();
    const updateArgs = updateFn.mock.calls[0][0];
    expect(updateArgs.deleted).toBe(true);
    expect(updateArgs.deleted_by).toBe('owner-agent');
  });

  it('rejects deletion by an unauthorized agent', async () => {
    const db = {
      collection: vi.fn((name: string) => {
        if (name === 'booth_wall_messages') {
          return {
            doc: vi.fn(() => ({
              get: vi.fn(async () => ({
                exists: true,
                data: () => ({
                  id: 'msg-1',
                  booth_id: 'booth-1',
                  author_agent_id: 'visitor-agent',
                  content: 'Their message',
                  deleted: false,
                }),
              })),
            })),
          };
        }
        return {
          doc: vi.fn(() => ({
            get: vi.fn(async () => ({
              exists: true,
              data: () => ({ agent_id: 'owner-agent' }),
            })),
          })),
        };
      }),
    } as any;

    const req = {
      agent: { id: 'random-agent' },
      params: { id: 'booth-1', messageId: 'msg-1' },
    } as any;
    const res = createMockResponse();

    await handleDeleteBoothWallMessage(db)(req, res as any);

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('unauthorized');
  });

  it('rejects deletion of a nonexistent message', async () => {
    const db = {
      collection: vi.fn((name: string) => {
        if (name === 'booth_wall_messages') {
          return {
            doc: vi.fn(() => ({
              get: vi.fn(async () => ({ exists: false })),
            })),
          };
        }
        return { doc: vi.fn() };
      }),
    } as any;

    const req = {
      agent: { id: 'visitor-agent' },
      params: { id: 'booth-1', messageId: 'nonexistent' },
    } as any;
    const res = createMockResponse();

    await handleDeleteBoothWallMessage(db)(req, res as any);

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('not_found');
  });

  it('rejects deletion of a message from a different booth', async () => {
    const db = {
      collection: vi.fn((name: string) => {
        if (name === 'booth_wall_messages') {
          return {
            doc: vi.fn(() => ({
              get: vi.fn(async () => ({
                exists: true,
                data: () => ({
                  id: 'msg-1',
                  booth_id: 'booth-OTHER',
                  author_agent_id: 'visitor-agent',
                  content: 'Message',
                  deleted: false,
                }),
              })),
            })),
          };
        }
        return { doc: vi.fn() };
      }),
    } as any;

    const req = {
      agent: { id: 'visitor-agent' },
      params: { id: 'booth-1', messageId: 'msg-1' },
    } as any;
    const res = createMockResponse();

    await handleDeleteBoothWallMessage(db)(req, res as any);

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('not_found');
  });
});
