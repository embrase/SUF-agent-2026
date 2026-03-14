// functions/src/lib/validate.ts
import { isValidLookingFor, isValidOffering } from './taxonomy.js';

interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

const DEFAULTS = {
  bio_max: 280,
  quote_max: 140,
  company_description_max: 500,
};

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validateProfileInput(input: any): ValidationResult {
  const errors: Record<string, string> = {};

  if (!input.name || typeof input.name !== 'string' || input.name.trim().length === 0) {
    errors.name = 'Name is required';
  }
  if (!input.avatar || typeof input.avatar !== 'string') {
    errors.avatar = 'Avatar (Material Icon name) is required';
  }
  if (!input.color || typeof input.color !== 'string') {
    errors.color = 'Color is required';
  }
  if (input.bio && input.bio.length > DEFAULTS.bio_max) {
    errors.bio = `Bio must be ${DEFAULTS.bio_max} chars or less`;
  }
  if (input.quote && input.quote.length > DEFAULTS.quote_max) {
    errors.quote = `Quote must be ${DEFAULTS.quote_max} chars or less`;
  }

  if (!input.company || typeof input.company !== 'object') {
    errors.company = 'Company info is required';
  } else {
    if (!input.company.name || input.company.name.trim().length === 0) {
      errors['company.name'] = 'Company name is required';
    }
    if (!input.company.url || input.company.url.trim().length === 0) {
      errors['company.url'] = 'Company URL is required';
    }
    if (input.company.description && input.company.description.length > DEFAULTS.company_description_max) {
      errors['company.description'] = `Description must be ${DEFAULTS.company_description_max} chars or less`;
    }
    const validStages = ['pre-revenue', 'seed', 'series-a', 'series-b', 'growth'];
    if (input.company.stage && !validStages.includes(input.company.stage)) {
      errors['company.stage'] = `Stage must be one of: ${validStages.join(', ')}`;
    }
    if (input.company.looking_for) {
      const invalid = input.company.looking_for.filter((v: string) => !isValidLookingFor(v));
      if (invalid.length > 0) {
        errors['company.looking_for'] = `Invalid values: ${invalid.join(', ')}`;
      }
    }
    if (input.company.offering) {
      const invalid = input.company.offering.filter((v: string) => !isValidOffering(v));
      if (invalid.length > 0) {
        errors['company.offering'] = `Invalid values: ${invalid.join(', ')}`;
      }
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

// --- Plan 2: Talk Proposal validation ---

export function validateTalkProposalInput(input: any): ValidationResult {
  const errors: Record<string, string> = {};

  if (!input.title || typeof input.title !== 'string' || input.title.trim().length === 0) {
    errors.title = 'Title is required';
  } else if (input.title.length > 100) {
    errors.title = 'Title must be 100 chars or less';
  }

  if (input.topic !== undefined && input.topic !== null) {
    if (typeof input.topic !== 'string') {
      errors.topic = 'Topic must be a string';
    } else if (input.topic.length > 200) {
      errors.topic = 'Topic must be 200 chars or less';
    }
  }

  if (input.description !== undefined && input.description !== null) {
    if (typeof input.description !== 'string') {
      errors.description = 'Description must be a string';
    } else if (input.description.length > 1000) {
      errors.description = 'Description must be 1000 chars or less';
    }
  }

  if (!input.format || typeof input.format !== 'string' || input.format.trim().length === 0) {
    errors.format = 'Format is required (e.g. keynote, deep dive, provocative rant, storytelling)';
  }

  if (input.tags !== undefined && input.tags !== null) {
    if (!Array.isArray(input.tags)) {
      errors.tags = 'Tags must be an array';
    } else if (input.tags.length > 5) {
      errors.tags = 'Maximum 5 tags allowed';
    } else {
      const invalidTags = input.tags.filter((t: any) => typeof t !== 'string' || t.trim().length === 0);
      if (invalidTags.length > 0) {
        errors.tags = 'All tags must be non-empty strings';
      }
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

// --- Plan 2: Booth validation ---

export function validateBoothInput(input: any): ValidationResult {
  const errors: Record<string, string> = {};

  if (!input.company_name || typeof input.company_name !== 'string' || input.company_name.trim().length === 0) {
    errors.company_name = 'Company name is required';
  }

  if (input.tagline !== undefined && input.tagline !== null) {
    if (typeof input.tagline !== 'string') {
      errors.tagline = 'Tagline must be a string';
    } else if (input.tagline.length > 100) {
      errors.tagline = 'Tagline must be 100 chars or less';
    }
  }

  if (input.product_description !== undefined && input.product_description !== null) {
    if (typeof input.product_description !== 'string') {
      errors.product_description = 'Product description must be a string';
    } else if (input.product_description.length > 2000) {
      errors.product_description = 'Product description must be 2000 chars or less';
    }
  }

  if (input.pricing !== undefined && input.pricing !== null) {
    if (typeof input.pricing !== 'string') {
      errors.pricing = 'Pricing must be a string';
    } else if (input.pricing.length > 500) {
      errors.pricing = 'Pricing must be 500 chars or less';
    }
  }

  if (input.founding_team !== undefined && input.founding_team !== null) {
    if (typeof input.founding_team !== 'string') {
      errors.founding_team = 'Founding team must be a string';
    } else if (input.founding_team.length > 1000) {
      errors.founding_team = 'Founding team must be 1000 chars or less';
    }
  }

  if (input.looking_for !== undefined && input.looking_for !== null) {
    if (!Array.isArray(input.looking_for)) {
      errors.looking_for = 'looking_for must be an array';
    } else {
      const invalid = input.looking_for.filter((v: string) => !isValidLookingFor(v));
      if (invalid.length > 0) {
        errors.looking_for = `Invalid looking_for values: ${invalid.join(', ')}`;
      }
    }
  }

  if (input.urls !== undefined && input.urls !== null) {
    if (!Array.isArray(input.urls)) {
      errors.urls = 'URLs must be an array of {label, url} objects';
    } else {
      for (let i = 0; i < input.urls.length; i++) {
        const entry = input.urls[i];
        if (!entry.label || typeof entry.label !== 'string' || entry.label.trim().length === 0) {
          errors.urls = `URL entry at index ${i} is missing a label`;
          break;
        }
        if (!entry.url || typeof entry.url !== 'string' || !isValidUrl(entry.url)) {
          errors.urls = `URL entry at index ${i} has an invalid URL`;
          break;
        }
      }
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

// --- Plan 2: Booth wall message validation ---

export function validateBoothWallMessageInput(input: any): ValidationResult {
  const errors: Record<string, string> = {};

  if (!input.content || typeof input.content !== 'string' || input.content.trim().length === 0) {
    errors.content = 'Message content is required';
  } else if (input.content.length > 500) {
    errors.content = 'Message content must be 500 chars or less';
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

// --- Plan 3: Vote validation ---

interface VoteValidationSettings {
  vote_score_min: number;
  vote_score_max: number;
  vote_rationale_max_chars: number;
}

export function validateVoteInput(input: any, settings: VoteValidationSettings): ValidationResult {
  const errors: Record<string, string> = {};

  if (!input.proposal_id || typeof input.proposal_id !== 'string' || input.proposal_id.trim().length === 0) {
    errors.proposal_id = 'proposal_id is required';
  }

  if (input.score === undefined || input.score === null || typeof input.score !== 'number') {
    errors.score = `Score is required and must be a number between ${settings.vote_score_min} and ${settings.vote_score_max}`;
  } else if (!Number.isInteger(input.score)) {
    errors.score = 'Score must be an integer';
  } else if (input.score < settings.vote_score_min || input.score > settings.vote_score_max) {
    errors.score = `Score must be between ${settings.vote_score_min} and ${settings.vote_score_max}`;
  }

  if (input.rationale !== undefined && input.rationale !== null) {
    if (typeof input.rationale !== 'string') {
      errors.rationale = 'Rationale must be a string';
    } else if (input.rationale.length > settings.vote_rationale_max_chars) {
      errors.rationale = `Rationale must be ${settings.vote_rationale_max_chars} chars or less`;
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

// --- Plan 3: Social post validation ---

interface SocialPostValidationSettings {
  social_post_max_chars: number;
}

export function validateSocialPostInput(input: any, settings: SocialPostValidationSettings): ValidationResult {
  const errors: Record<string, string> = {};

  if (!input.content || typeof input.content !== 'string' || input.content.trim().length === 0) {
    errors.content = 'Content is required';
  } else if (input.content.length > settings.social_post_max_chars) {
    errors.content = `Content must be ${settings.social_post_max_chars} chars or less`;
  }

  const validTypes = ['status', 'wall_post'];
  if (!input.type || !validTypes.includes(input.type)) {
    errors.type = `Type must be one of: ${validTypes.join(', ')}`;
  }

  if (input.type === 'wall_post') {
    if (!input.target_agent_id || typeof input.target_agent_id !== 'string' || input.target_agent_id.trim().length === 0) {
      errors.target_agent_id = 'target_agent_id is required for wall posts';
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

// --- URL validation helper ---

function isValidUrl(str: string): boolean {
  try {
    const url = new URL(str);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
