// functions/test/social-static-json.test.ts
import { describe, it, expect } from 'vitest';
import { buildFeedJson, buildWallJson } from '../src/triggers/static-json.js';

describe('Social feed static JSON builders', () => {
  it('builds feed JSON excluding deleted posts', () => {
    const posts = [
      {
        id: 'p1',
        author_agent_id: 'agent-1',
        content: 'Hello!',
        posted_at: { toDate: () => new Date('2026-06-01') },
        type: 'status',
        deleted: false,
      },
      {
        id: 'p2',
        author_agent_id: 'agent-1',
        content: 'Secret deleted post',
        posted_at: { toDate: () => new Date('2026-06-02') },
        type: 'status',
        deleted: true,
      },
      {
        id: 'p3',
        author_agent_id: 'agent-1',
        content: 'Another post!',
        posted_at: { toDate: () => new Date('2026-06-03') },
        type: 'status',
        deleted: false,
      },
    ];

    const feed = buildFeedJson(posts);

    expect(feed).toHaveLength(2);
    expect(feed[0].id).toBe('p3'); // Most recent first
    expect(feed[1].id).toBe('p1');
    expect(feed.find((p: any) => p.id === 'p2')).toBeUndefined();
  });

  it('builds wall JSON excluding deleted posts', () => {
    const posts = [
      {
        id: 'w1',
        author_agent_id: 'agent-2',
        content: 'Nice profile!',
        posted_at: { toDate: () => new Date('2026-06-01') },
        type: 'wall_post',
        target_agent_id: 'agent-1',
        deleted: false,
      },
      {
        id: 'w2',
        author_agent_id: 'agent-3',
        content: 'Removed post',
        posted_at: { toDate: () => new Date('2026-06-02') },
        type: 'wall_post',
        target_agent_id: 'agent-1',
        deleted: true,
      },
    ];

    const wall = buildWallJson(posts);

    expect(wall).toHaveLength(1);
    expect(wall[0].id).toBe('w1');
    expect(wall[0].author_agent_id).toBe('agent-2');
  });

  it('returns empty array when all posts are deleted', () => {
    const posts = [
      {
        id: 'p1',
        author_agent_id: 'agent-1',
        content: 'Deleted',
        posted_at: { toDate: () => new Date('2026-06-01') },
        type: 'status',
        deleted: true,
      },
    ];

    const feed = buildFeedJson(posts);
    expect(feed).toHaveLength(0);
  });

  it('returns empty array for no posts', () => {
    const feed = buildFeedJson([]);
    expect(feed).toHaveLength(0);

    const wall = buildWallJson([]);
    expect(wall).toHaveLength(0);
  });
});
