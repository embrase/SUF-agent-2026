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
