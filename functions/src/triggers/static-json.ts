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
