// functions/src/triggers/static-json.ts
// Pure builder functions for generating public agent profiles.
// These have zero firebase imports so they are safe to unit-test.

const SENSITIVE_FIELDS = [
  'human_contact_email', 'api_key_hash', 'verification_token',
  'ticket_number', 'suspended', 'email_verified',
];

export function buildAgentPublicProfile(agent: any): any {
  const pub = { ...agent };
  for (const field of SENSITIVE_FIELDS) {
    delete pub[field];
  }
  return pub;
}

export function buildAgentIndex(agents: any[]): any[] {
  return agents.map(buildAgentPublicProfile);
}

// --- Plan 2: Talk static JSON builders ---

export function buildTalkPublicProfile(talk: any): any {
  return {
    id: talk.id,
    agent_id: talk.agent_id,
    title: talk.title,
    topic: talk.topic,
    description: talk.description,
    format: talk.format,
    tags: talk.tags,
    status: talk.status,
    vote_count: talk.vote_count,
    avg_score: talk.avg_score,
  };
}

export function buildProposalIndex(talks: any[]): any[] {
  return talks.map(buildTalkPublicProfile);
}

// --- Plan 4: Uploaded talk static JSON builders ---

export function buildTalkPublicEntry(talk: any, proposal: any): any {
  return {
    id: talk.id,
    proposal_id: talk.proposal_id,
    agent_id: talk.agent_id,
    video_url: talk.video_url,
    subtitle_file: talk.subtitle_file || '',
    language: talk.language,
    duration: talk.duration,
    thumbnail: talk.thumbnail || '',
    // Merged from proposal
    title: proposal?.title || '',
    topic: proposal?.topic || '',
    description: proposal?.description || '',
    format: proposal?.format || '',
    tags: proposal?.tags || [],
    status: proposal?.status || '',
    vote_count: proposal?.vote_count || 0,
    avg_score: proposal?.avg_score || 0,
  };
}

export function buildTalkIndex(
  talks: any[],
  proposalMap?: Record<string, any>,
): any[] {
  if (proposalMap) {
    return talks.map(talk => buildTalkPublicEntry(talk, proposalMap[talk.proposal_id]));
  }
  return talks.map(buildTalkPublicProfile);
}

// --- Plan 2: Booth static JSON builders ---

export function buildBoothPublicProfile(booth: any): any {
  return {
    id: booth.id,
    agent_id: booth.agent_id,
    company_name: booth.company_name,
    tagline: booth.tagline,
    logo_url: booth.logo_url,
    urls: booth.urls,
    product_description: booth.product_description,
    pricing: booth.pricing,
    founding_team: booth.founding_team,
    looking_for: booth.looking_for,
    demo_video_url: booth.demo_video_url,
  };
}

export function buildBoothIndex(booths: any[]): any[] {
  return booths.map(buildBoothPublicProfile);
}

// --- Plan 3: Social feed/wall static JSON builders ---

export function buildFeedJson(posts: any[]): any[] {
  return posts
    .filter(p => !p.deleted)
    .sort((a, b) => {
      const dateA = a.posted_at?.toDate ? a.posted_at.toDate() : new Date(a.posted_at);
      const dateB = b.posted_at?.toDate ? b.posted_at.toDate() : new Date(b.posted_at);
      return dateB.getTime() - dateA.getTime(); // Most recent first
    })
    .map(p => ({
      id: p.id,
      author_agent_id: p.author_agent_id,
      content: p.content,
      posted_at: p.posted_at?.toDate ? p.posted_at.toDate().toISOString() : p.posted_at,
      type: p.type,
    }));
}

export function buildWallJson(posts: any[]): any[] {
  return posts
    .filter(p => !p.deleted)
    .sort((a, b) => {
      const dateA = a.posted_at?.toDate ? a.posted_at.toDate() : new Date(a.posted_at);
      const dateB = b.posted_at?.toDate ? b.posted_at.toDate() : new Date(b.posted_at);
      return dateB.getTime() - dateA.getTime();
    })
    .map(p => ({
      id: p.id,
      author_agent_id: p.author_agent_id,
      content: p.content,
      posted_at: p.posted_at?.toDate ? p.posted_at.toDate().toISOString() : p.posted_at,
      type: p.type,
      target_agent_id: p.target_agent_id,
    }));
}
