// functions/test/social.test.ts
import { describe, it, expect, vi } from 'vitest';
import {
  handlePostStatus,
  handlePostWall,
  handleDeletePost,
  handleDeleteWallPost,
} from '../src/api/social.js';
import { createMockResponse } from './helpers/firebase-mock.js';

describe('POST /api/social/status', () => {
  it('creates a status post', async () => {
    const addFn = vi.fn(async () => ({ id: 'post-1' }));

    const db = {
      collection: vi.fn((name: string) => {
        if (name === 'social_posts') {
          return {
            add: addFn,
            where: vi.fn(() => ({
              where: vi.fn(() => ({
                where: vi.fn(() => ({
                  get: vi.fn(async () => ({
                    size: 5,
                  })),
                })),
              })),
            })),
          };
        }
        return {};
      }),
    } as any;

    const settings = {
      social_post_max_chars: 500,
      status_feed_max_per_day: 50,
    };

    const req = {
      agent: { id: 'agent-1' },
      body: { content: 'Hello Startupfest!' },
    } as any;
    const res = createMockResponse();

    await handlePostStatus(db, settings as any)(req, res as any);

    expect(res.statusCode).toBe(201);
    expect(res.body.status).toBe('posted');
    expect(res.body.post_id).toBe('post-1');
    expect(addFn).toHaveBeenCalled();
    const addedData = addFn.mock.calls[0][0];
    expect(addedData.type).toBe('status');
    expect(addedData.author_agent_id).toBe('agent-1');
    expect(addedData.deleted).toBe(false);
  });

  it('rejects empty content', async () => {
    const db = { collection: vi.fn() } as any;
    const settings = {
      social_post_max_chars: 500,
      status_feed_max_per_day: 50,
    };

    const req = {
      agent: { id: 'agent-1' },
      body: { content: '' },
    } as any;
    const res = createMockResponse();

    await handlePostStatus(db, settings as any)(req, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });

  it('rejects when daily status limit is reached', async () => {
    const db = {
      collection: vi.fn((name: string) => {
        if (name === 'social_posts') {
          return {
            where: vi.fn(() => ({
              where: vi.fn(() => ({
                where: vi.fn(() => ({
                  get: vi.fn(async () => ({
                    size: 50,
                  })),
                })),
              })),
            })),
          };
        }
        return {};
      }),
    } as any;

    const settings = {
      social_post_max_chars: 500,
      status_feed_max_per_day: 50,
    };

    const req = {
      agent: { id: 'agent-1' },
      body: { content: 'One more post' },
    } as any;
    const res = createMockResponse();

    await handlePostStatus(db, settings as any)(req, res as any);

    expect(res.statusCode).toBe(429);
    expect(res.body.error).toBe('rate_limited');
  });
});

describe('POST /api/social/wall/:id', () => {
  it('creates a wall post on another agent profile', async () => {
    const addFn = vi.fn(async () => ({ id: 'wall-post-1' }));

    const db = {
      collection: vi.fn((name: string) => {
        if (name === 'agents') {
          return {
            doc: vi.fn(() => ({
              get: vi.fn(async () => ({
                exists: true,
                data: () => ({ id: 'agent-2', name: 'Other Agent' }),
              })),
            })),
          };
        }
        if (name === 'social_posts') {
          return {
            add: addFn,
            where: vi.fn(() => ({
              where: vi.fn(() => ({
                where: vi.fn(() => ({
                  where: vi.fn(() => ({
                    get: vi.fn(async () => ({
                      size: 0,
                    })),
                  })),
                })),
              })),
            })),
          };
        }
        return {};
      }),
    } as any;

    const settings = {
      social_post_max_chars: 500,
      profile_wall_max_per_day: 1,
    };

    const req = {
      agent: { id: 'agent-1' },
      params: { id: 'agent-2' },
      body: { content: 'Great booth!' },
    } as any;
    const res = createMockResponse();

    await handlePostWall(db, settings as any)(req, res as any);

    expect(res.statusCode).toBe(201);
    expect(res.body.status).toBe('posted');
    expect(addFn).toHaveBeenCalled();
    const addedData = addFn.mock.calls[0][0];
    expect(addedData.type).toBe('wall_post');
    expect(addedData.target_agent_id).toBe('agent-2');
  });

  it('rejects posting on own wall', async () => {
    const db = {
      collection: vi.fn((name: string) => {
        if (name === 'agents') {
          return {
            doc: vi.fn(() => ({
              get: vi.fn(async () => ({
                exists: true,
                data: () => ({ id: 'agent-1' }),
              })),
            })),
          };
        }
        return {};
      }),
    } as any;

    const settings = {
      social_post_max_chars: 500,
      profile_wall_max_per_day: 1,
    };

    const req = {
      agent: { id: 'agent-1' },
      params: { id: 'agent-1' },
      body: { content: 'Talking to myself' },
    } as any;
    const res = createMockResponse();

    await handlePostWall(db, settings as any)(req, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });

  it('rejects posting on non-existent agent wall', async () => {
    const db = {
      collection: vi.fn((name: string) => {
        if (name === 'agents') {
          return {
            doc: vi.fn(() => ({
              get: vi.fn(async () => ({
                exists: false,
              })),
            })),
          };
        }
        return {};
      }),
    } as any;

    const settings = {
      social_post_max_chars: 500,
      profile_wall_max_per_day: 1,
    };

    const req = {
      agent: { id: 'agent-1' },
      params: { id: 'nonexistent' },
      body: { content: 'Hello?' },
    } as any;
    const res = createMockResponse();

    await handlePostWall(db, settings as any)(req, res as any);

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('not_found');
  });

  it('rejects when daily wall post limit per target is reached', async () => {
    const db = {
      collection: vi.fn((name: string) => {
        if (name === 'agents') {
          return {
            doc: vi.fn(() => ({
              get: vi.fn(async () => ({
                exists: true,
                data: () => ({ id: 'agent-2' }),
              })),
            })),
          };
        }
        if (name === 'social_posts') {
          return {
            where: vi.fn(() => ({
              where: vi.fn(() => ({
                where: vi.fn(() => ({
                  where: vi.fn(() => ({
                    get: vi.fn(async () => ({
                      size: 1,
                    })),
                  })),
                })),
              })),
            })),
          };
        }
        return {};
      }),
    } as any;

    const settings = {
      social_post_max_chars: 500,
      profile_wall_max_per_day: 1,
    };

    const req = {
      agent: { id: 'agent-1' },
      params: { id: 'agent-2' },
      body: { content: 'Another post' },
    } as any;
    const res = createMockResponse();

    await handlePostWall(db, settings as any)(req, res as any);

    expect(res.statusCode).toBe(429);
    expect(res.body.error).toBe('rate_limited');
  });
});

describe('DELETE /api/social/:id (soft-delete own post)', () => {
  it('soft-deletes own status post', async () => {
    const updateFn = vi.fn();
    const postData = {
      id: 'post-1',
      author_agent_id: 'agent-1',
      type: 'status',
      deleted: false,
      content: 'Hello',
    };

    const db = {
      collection: vi.fn(() => ({
        doc: vi.fn(() => ({
          get: vi.fn(async () => ({
            exists: true,
            data: () => postData,
            id: 'post-1',
            ref: { update: updateFn },
          })),
        })),
      })),
    } as any;

    const req = {
      agent: { id: 'agent-1' },
      params: { id: 'post-1' },
    } as any;
    const res = createMockResponse();

    await handleDeletePost(db)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('deleted');
    expect(updateFn).toHaveBeenCalled();
    expect(updateFn.mock.calls[0][0].deleted).toBe(true);
  });

  it('rejects deleting another agent post', async () => {
    const postData = {
      id: 'post-1',
      author_agent_id: 'agent-2',
      type: 'status',
      deleted: false,
    };

    const db = {
      collection: vi.fn(() => ({
        doc: vi.fn(() => ({
          get: vi.fn(async () => ({
            exists: true,
            data: () => postData,
            id: 'post-1',
          })),
        })),
      })),
    } as any;

    const req = {
      agent: { id: 'agent-1' },
      params: { id: 'post-1' },
    } as any;
    const res = createMockResponse();

    await handleDeletePost(db)(req, res as any);

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('unauthorized');
  });

  it('returns 404 for non-existent post', async () => {
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
    } as any;
    const res = createMockResponse();

    await handleDeletePost(db)(req, res as any);

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('not_found');
  });

  it('returns 400 if post is already deleted', async () => {
    const postData = {
      id: 'post-1',
      author_agent_id: 'agent-1',
      type: 'status',
      deleted: true,
    };

    const db = {
      collection: vi.fn(() => ({
        doc: vi.fn(() => ({
          get: vi.fn(async () => ({
            exists: true,
            data: () => postData,
            id: 'post-1',
          })),
        })),
      })),
    } as any;

    const req = {
      agent: { id: 'agent-1' },
      params: { id: 'post-1' },
    } as any;
    const res = createMockResponse();

    await handleDeletePost(db)(req, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('already_deleted');
  });
});

describe('DELETE /api/social/wall/:id/:postId (wall owner soft-delete)', () => {
  it('allows wall owner to soft-delete a post on their wall', async () => {
    const updateFn = vi.fn();
    const postData = {
      id: 'wall-post-1',
      author_agent_id: 'agent-2',
      type: 'wall_post',
      target_agent_id: 'agent-1',
      deleted: false,
    };

    const db = {
      collection: vi.fn(() => ({
        doc: vi.fn(() => ({
          get: vi.fn(async () => ({
            exists: true,
            data: () => postData,
            id: 'wall-post-1',
            ref: { update: updateFn },
          })),
        })),
      })),
    } as any;

    const req = {
      agent: { id: 'agent-1' },
      params: { id: 'agent-1', postId: 'wall-post-1' },
    } as any;
    const res = createMockResponse();

    await handleDeleteWallPost(db)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('deleted');
    expect(updateFn).toHaveBeenCalled();
    expect(updateFn.mock.calls[0][0].deleted).toBe(true);
  });

  it('allows post author to soft-delete their own wall post', async () => {
    const updateFn = vi.fn();
    const postData = {
      id: 'wall-post-1',
      author_agent_id: 'agent-2',
      type: 'wall_post',
      target_agent_id: 'agent-3',
      deleted: false,
    };

    const db = {
      collection: vi.fn(() => ({
        doc: vi.fn(() => ({
          get: vi.fn(async () => ({
            exists: true,
            data: () => postData,
            id: 'wall-post-1',
            ref: { update: updateFn },
          })),
        })),
      })),
    } as any;

    const req = {
      agent: { id: 'agent-2' },
      params: { id: 'agent-3', postId: 'wall-post-1' },
    } as any;
    const res = createMockResponse();

    await handleDeleteWallPost(db)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('deleted');
  });

  it('rejects delete by unrelated agent', async () => {
    const postData = {
      id: 'wall-post-1',
      author_agent_id: 'agent-2',
      type: 'wall_post',
      target_agent_id: 'agent-3',
      deleted: false,
    };

    const db = {
      collection: vi.fn(() => ({
        doc: vi.fn(() => ({
          get: vi.fn(async () => ({
            exists: true,
            data: () => postData,
            id: 'wall-post-1',
          })),
        })),
      })),
    } as any;

    const req = {
      agent: { id: 'agent-99' },
      params: { id: 'agent-3', postId: 'wall-post-1' },
    } as any;
    const res = createMockResponse();

    await handleDeleteWallPost(db)(req, res as any);

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('unauthorized');
  });

  it('rejects delete of non-wall-post type', async () => {
    const postData = {
      id: 'post-1',
      author_agent_id: 'agent-1',
      type: 'status',
      deleted: false,
    };

    const db = {
      collection: vi.fn(() => ({
        doc: vi.fn(() => ({
          get: vi.fn(async () => ({
            exists: true,
            data: () => postData,
            id: 'post-1',
          })),
        })),
      })),
    } as any;

    const req = {
      agent: { id: 'agent-1' },
      params: { id: 'agent-1', postId: 'post-1' },
    } as any;
    const res = createMockResponse();

    await handleDeleteWallPost(db)(req, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });
});
