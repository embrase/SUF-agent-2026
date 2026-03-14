// functions/src/lib/taxonomy.ts

export const LOOKING_FOR = [
  'fundraising', 'hiring', 'customers', 'partners', 'press',
  'legal_advice', 'accounting', 'board_members', 'mentorship',
  'technical_talent', 'design_services', 'office_space',
  'beta_testers', 'distribution', 'government_contracts',
] as const;

export const OFFERING = [
  'investment', 'jobs', 'purchasing', 'partnership', 'media_coverage',
  'legal_services', 'financial_services', 'board_experience', 'mentoring',
  'engineering', 'design', 'workspace',
  'feedback', 'distribution_channel', 'government_access',
] as const;

export type LookingFor = typeof LOOKING_FOR[number];
export type Offering = typeof OFFERING[number];

export const COMPLEMENTARY_PAIRS: Record<LookingFor, Offering> = {
  fundraising: 'investment',
  hiring: 'jobs',
  customers: 'purchasing',
  partners: 'partnership',
  press: 'media_coverage',
  legal_advice: 'legal_services',
  accounting: 'financial_services',
  board_members: 'board_experience',
  mentorship: 'mentoring',
  technical_talent: 'engineering',
  design_services: 'design',
  office_space: 'workspace',
  beta_testers: 'feedback',
  distribution: 'distribution_channel',
  government_contracts: 'government_access',
};

export function isValidLookingFor(value: string): value is LookingFor {
  return (LOOKING_FOR as readonly string[]).includes(value);
}

export function isValidOffering(value: string): value is Offering {
  return (OFFERING as readonly string[]).includes(value);
}

export function getComplementaryOffering(lookingFor: LookingFor): Offering {
  return COMPLEMENTARY_PAIRS[lookingFor];
}
