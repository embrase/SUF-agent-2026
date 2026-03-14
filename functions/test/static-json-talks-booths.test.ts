import { describe, it, expect } from 'vitest';
import {
  buildTalkPublicProfile,
  buildTalkIndex,
  buildBoothPublicProfile,
  buildBoothIndex,
} from '../src/triggers/static-json.js';

describe('Static JSON builders: Talks', () => {
  const sampleTalk = {
    id: 'talk-1',
    agent_id: 'agent-1',
    title: 'Why AI Agents Will Change Startups',
    topic: 'The agentic revolution',
    description: 'A deep dive into AI co-founders.',
    format: 'keynote',
    tags: ['ai', 'startups'],
    status: 'submitted',
    vote_count: 42,
    avg_score: 78.5,
    created_at: '2026-05-01T10:00:00Z',
    updated_at: '2026-05-01T10:00:00Z',
  };

  it('includes all public fields in talk profile', () => {
    const pub = buildTalkPublicProfile(sampleTalk);
    expect(pub.id).toBe('talk-1');
    expect(pub.agent_id).toBe('agent-1');
    expect(pub.title).toBe('Why AI Agents Will Change Startups');
    expect(pub.topic).toBe('The agentic revolution');
    expect(pub.description).toBe('A deep dive into AI co-founders.');
    expect(pub.format).toBe('keynote');
    expect(pub.tags).toEqual(['ai', 'startups']);
    expect(pub.status).toBe('submitted');
    expect(pub.vote_count).toBe(42);
    expect(pub.avg_score).toBe(78.5);
  });

  it('builds talk index from multiple proposals', () => {
    const talks = [
      { ...sampleTalk, id: 't1', title: 'Talk One' },
      { ...sampleTalk, id: 't2', title: 'Talk Two' },
    ];
    const index = buildTalkIndex(talks);
    expect(index).toHaveLength(2);
    expect(index[0].id).toBe('t1');
    expect(index[1].id).toBe('t2');
  });
});

describe('Static JSON builders: Booths', () => {
  const sampleBooth = {
    id: 'booth-1',
    agent_id: 'agent-1',
    company_name: 'Acme Corp',
    tagline: 'Building the future',
    logo_url: 'https://acme.com/logo.png',
    urls: [{ label: 'Website', url: 'https://acme.com' }],
    product_description: 'AI tools for startups.',
    pricing: 'Free + $99/mo',
    founding_team: 'Jane (CEO), John (CTO)',
    looking_for: ['customers', 'partners'],
    demo_video_url: 'https://youtube.com/watch?v=demo',
    created_at: '2026-05-01T10:00:00Z',
    updated_at: '2026-05-01T10:00:00Z',
  };

  it('includes all public fields in booth profile', () => {
    const pub = buildBoothPublicProfile(sampleBooth);
    expect(pub.id).toBe('booth-1');
    expect(pub.agent_id).toBe('agent-1');
    expect(pub.company_name).toBe('Acme Corp');
    expect(pub.tagline).toBe('Building the future');
    expect(pub.product_description).toBe('AI tools for startups.');
    expect(pub.urls).toEqual([{ label: 'Website', url: 'https://acme.com' }]);
    expect(pub.looking_for).toEqual(['customers', 'partners']);
  });

  it('builds booth index from multiple booths', () => {
    const booths = [
      { ...sampleBooth, id: 'b1', company_name: 'One' },
      { ...sampleBooth, id: 'b2', company_name: 'Two' },
    ];
    const index = buildBoothIndex(booths);
    expect(index).toHaveLength(2);
    expect(index[0].id).toBe('b1');
    expect(index[1].company_name).toBe('Two');
  });
});
