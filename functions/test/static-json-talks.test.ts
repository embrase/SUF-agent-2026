// functions/test/static-json-talks.test.ts
import { describe, it, expect } from 'vitest';
import { buildTalkPublicEntry, buildTalkIndex } from '../src/triggers/static-json.js';

describe('Static JSON builders for talks', () => {
  const sampleTalk = {
    id: 'talk-1',
    proposal_id: 'proposal-1',
    agent_id: 'agent-1',
    video_url: 'https://storage.example.com/talk.mp4',
    transcript: 'Full transcript text here...',
    subtitle_file: 'https://example.com/subs.srt',
    language: 'EN',
    duration: 420,
    thumbnail: 'https://example.com/thumb.jpg',
    created_at: { toDate: () => new Date('2026-06-25') },
    updated_at: { toDate: () => new Date('2026-06-25') },
  };

  const sampleProposal = {
    id: 'proposal-1',
    agent_id: 'agent-1',
    title: 'AI Agents in Startups',
    topic: 'How AI agents are changing the startup ecosystem',
    description: 'A deep dive into agent-first companies',
    format: 'deep dive',
    tags: ['AI', 'startups'],
    status: 'talk_uploaded',
    vote_count: 15,
    avg_score: 82.5,
  };

  it('builds a public talk entry with proposal metadata', () => {
    const entry = buildTalkPublicEntry(sampleTalk, sampleProposal);

    expect(entry.id).toBe('talk-1');
    expect(entry.video_url).toBe('https://storage.example.com/talk.mp4');
    expect(entry.title).toBe('AI Agents in Startups');
    expect(entry.agent_id).toBe('agent-1');
    expect(entry.duration).toBe(420);
    expect(entry.language).toBe('EN');
    expect(entry.status).toBe('talk_uploaded');
    expect(entry.vote_count).toBe(15);
    expect(entry.avg_score).toBe(82.5);
  });

  it('builds talk index from multiple entries', () => {
    const talks = [
      { talk: sampleTalk, proposal: sampleProposal },
      {
        talk: { ...sampleTalk, id: 'talk-2', proposal_id: 'proposal-2' },
        proposal: { ...sampleProposal, id: 'proposal-2', title: 'Second Talk', avg_score: 90 },
      },
    ];

    const index = buildTalkIndex(
      talks.map(t => t.talk),
      talks.reduce((acc, t) => ({ ...acc, [t.proposal.id]: t.proposal }), {} as Record<string, any>),
    );

    expect(index).toHaveLength(2);
    expect(index[0].id).toBe('talk-1');
    expect(index[1].id).toBe('talk-2');
  });

  it('handles missing proposal gracefully', () => {
    const entry = buildTalkPublicEntry(sampleTalk, undefined);

    expect(entry.id).toBe('talk-1');
    expect(entry.title).toBe('');
    expect(entry.vote_count).toBe(0);
    expect(entry.avg_score).toBe(0);
  });
});
