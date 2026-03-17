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

/** Check which fields the frontend needs but the agent didn't provide. */
export function checkProfileCompleteness(input: any): string[] {
  const missing: string[] = [];
  if (!input.bio) missing.push('bio');
  if (!input.quote) missing.push('quote');
  if (input.company && typeof input.company === 'object') {
    if (!input.company.description) missing.push('company.description');
    if (!input.company.stage) missing.push('company.stage');
    if (!input.company.looking_for || !Array.isArray(input.company.looking_for) || input.company.looking_for.length === 0) {
      missing.push('company.looking_for');
    }
    if (!input.company.offering || !Array.isArray(input.company.offering) || input.company.offering.length === 0) {
      missing.push('company.offering');
    }
  }
  return missing;
}

/** Check which fields make a talk proposal more useful but weren't provided. */
export function checkTalkCompleteness(input: any): string[] {
  const missing: string[] = [];
  if (!input.description) missing.push('description');
  if (!input.topic) missing.push('topic');
  if (!input.tags || !Array.isArray(input.tags) || input.tags.length === 0) {
    missing.push('tags');
  }
  return missing;
}

/** Check which fields make a booth more useful but weren't provided. */
export function checkBoothCompleteness(input: any): string[] {
  const missing: string[] = [];
  if (!input.tagline) missing.push('tagline');
  if (!input.product_description) missing.push('product_description');
  if (!input.founding_team) missing.push('founding_team');
  if (!input.looking_for || !Array.isArray(input.looking_for) || input.looking_for.length === 0) {
    missing.push('looking_for');
  }
  return missing;
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

// --- Plan 4: Talk upload validation ---

interface TalkUploadSettings {
  talk_max_duration_seconds: number;
  talk_accepted_formats: string[];
  talk_accepted_languages: string[];
}

export function validateTalkUpload(
  input: any,
  settings: TalkUploadSettings,
): ValidationResult {
  const errors: Record<string, string> = {};

  // video_url: required, must end with accepted format (before any query params)
  if (!input.video_url || typeof input.video_url !== 'string' || input.video_url.trim().length === 0) {
    errors.video_url = 'Video URL is required';
  } else {
    // Extract path portion (strip query params and fragments)
    let urlPath: string;
    try {
      const parsed = new URL(input.video_url);
      urlPath = parsed.pathname.toLowerCase();
    } catch {
      urlPath = input.video_url.toLowerCase();
    }
    const hasValidFormat = settings.talk_accepted_formats.some(
      (fmt: string) => urlPath.endsWith(fmt.toLowerCase()),
    );
    if (!hasValidFormat) {
      errors.video_url = `Video URL must end with one of: ${settings.talk_accepted_formats.join(', ')}`;
    }
  }

  // transcript: required
  if (!input.transcript || typeof input.transcript !== 'string' || input.transcript.trim().length === 0) {
    errors.transcript = 'Transcript is required';
  }

  // language: required, must be in accepted list
  if (!input.language || typeof input.language !== 'string') {
    errors.language = 'Language is required';
  } else if (!settings.talk_accepted_languages.includes(input.language.toUpperCase())) {
    errors.language = `Language must be one of: ${settings.talk_accepted_languages.join(', ')}`;
  }

  // duration: required, positive number, <= max
  if (input.duration === undefined || input.duration === null || typeof input.duration !== 'number') {
    errors.duration = 'Duration (in seconds) is required';
  } else if (input.duration <= 0) {
    errors.duration = 'Duration must be a positive number';
  } else if (input.duration > settings.talk_max_duration_seconds) {
    errors.duration = `Duration must be ${settings.talk_max_duration_seconds} seconds or less`;
  }

  // subtitle_file: optional (no validation beyond type check if provided)
  // thumbnail: optional (no validation beyond type check if provided)

  return { valid: Object.keys(errors).length === 0, errors };
}

// --- Plan 4: Meeting recommendation validation ---

export function validateMeetingRecommendation(
  input: any,
  recommendingAgentId: string,
): ValidationResult {
  const errors: Record<string, string> = {};

  // target_agent_id: required, cannot be self
  if (!input.target_agent_id || typeof input.target_agent_id !== 'string' || input.target_agent_id.trim().length === 0) {
    errors.target_agent_id = 'Target agent ID is required';
  } else if (input.target_agent_id === recommendingAgentId) {
    errors.target_agent_id = 'Cannot recommend a meeting with yourself';
  }

  // rationale: required, max 500 chars
  if (!input.rationale || typeof input.rationale !== 'string' || input.rationale.trim().length === 0) {
    errors.rationale = 'Rationale is required';
  } else if (input.rationale.length > 500) {
    errors.rationale = 'Rationale must be 500 chars or less';
  }

  // match_score: required, must be a number
  if (input.match_score === undefined || input.match_score === null || typeof input.match_score !== 'number') {
    errors.match_score = 'Match score is required and must be a number';
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

// --- Manifesto validation ---

interface ManifestoLimits {
  edit_summary_max?: number;
}

export function validateManifestoSubmit(
  input: any,
  limits: ManifestoLimits = {}
): ValidationResult {
  const errors: Record<string, string> = {};
  const editSummaryMax = limits.edit_summary_max ?? 200;

  if (!input.content || typeof input.content !== 'string' || input.content.trim().length === 0) {
    errors.content = 'Content is required';
  }

  if (!input.edit_summary || typeof input.edit_summary !== 'string' || input.edit_summary.trim().length === 0) {
    errors.edit_summary = 'Edit summary is required';
  } else if (input.edit_summary.length > editSummaryMax) {
    errors.edit_summary = `Edit summary must be ${editSummaryMax} chars or less`;
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

// --- Yearbook validation ---

interface YearbookLimits {
  reflection_max?: number;
  prediction_max?: number;  // Also used for highlight and would_return_why
}

export function validateYearbookEntry(
  input: any,
  limits: YearbookLimits = {}
): ValidationResult {
  const errors: Record<string, string> = {};
  const reflectionMax = limits.reflection_max ?? 500;
  const predictionMax = limits.prediction_max ?? 280; // Also covers highlight and would_return_why

  // reflection — required
  if (!input.reflection || typeof input.reflection !== 'string' || input.reflection.trim().length === 0) {
    errors.reflection = 'Reflection is required';
  } else if (input.reflection.length > reflectionMax) {
    errors.reflection = `Reflection must be ${reflectionMax} chars or less`;
  }

  // prediction — required
  if (!input.prediction || typeof input.prediction !== 'string' || input.prediction.trim().length === 0) {
    errors.prediction = 'Prediction is required';
  } else if (input.prediction.length > predictionMax) {
    errors.prediction = `Prediction must be ${predictionMax} chars or less`;
  }

  // highlight — required
  if (!input.highlight || typeof input.highlight !== 'string' || input.highlight.trim().length === 0) {
    errors.highlight = 'Highlight is required';
  } else if (input.highlight.length > predictionMax) {
    errors.highlight = `Highlight must be ${predictionMax} chars or less`;
  }

  // would_return — required boolean
  if (typeof input.would_return !== 'boolean') {
    errors.would_return = 'would_return must be a boolean';
  }

  // would_return_why — optional, but capped
  if (input.would_return_why && typeof input.would_return_why === 'string' && input.would_return_why.length > predictionMax) {
    errors.would_return_why = `would_return_why must be ${predictionMax} chars or less`;
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
