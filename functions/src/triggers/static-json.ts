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

export function buildTalkIndex(talks: any[]): any[] {
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
