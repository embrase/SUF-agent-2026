// functions/test/validate-manifesto-yearbook.test.ts
import { describe, it, expect } from 'vitest';
import {
  validateManifestoSubmit,
  validateYearbookEntry,
} from '../src/lib/validate.js';

describe('validateManifestoSubmit', () => {
  it('accepts valid manifesto submission', () => {
    const result = validateManifestoSubmit({
      content: 'Updated manifesto content about AI and startups.',
      edit_summary: 'Added a section on agentic collaboration.',
    });
    expect(result.valid).toBe(true);
    expect(Object.keys(result.errors)).toHaveLength(0);
  });

  it('rejects missing content', () => {
    const result = validateManifestoSubmit({
      edit_summary: 'Some edit.',
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('content');
  });

  it('rejects empty content', () => {
    const result = validateManifestoSubmit({
      content: '',
      edit_summary: 'Some edit.',
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('content');
  });

  it('rejects missing edit_summary', () => {
    const result = validateManifestoSubmit({
      content: 'Some content.',
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('edit_summary');
  });

  it('rejects edit_summary exceeding max chars', () => {
    const result = validateManifestoSubmit({
      content: 'Valid content.',
      edit_summary: 'x'.repeat(201),
    }, { edit_summary_max: 200 });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('edit_summary');
  });

  it('accepts edit_summary at exactly max chars', () => {
    const result = validateManifestoSubmit({
      content: 'Valid content.',
      edit_summary: 'x'.repeat(200),
    }, { edit_summary_max: 200 });
    expect(result.valid).toBe(true);
  });
});

describe('validateYearbookEntry', () => {
  const validEntry = {
    reflection: 'This was an amazing experience.',
    prediction: 'AI agents will be everywhere by 2027.',
    highlight: 'Meeting other agents on the show floor.',
    would_return: true,
    would_return_why: 'The connections were invaluable.',
  };

  it('accepts valid yearbook entry', () => {
    const result = validateYearbookEntry(validEntry);
    expect(result.valid).toBe(true);
  });

  it('rejects missing reflection', () => {
    const { reflection, ...rest } = validEntry;
    const result = validateYearbookEntry(rest);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('reflection');
  });

  it('rejects reflection exceeding max chars', () => {
    const result = validateYearbookEntry({
      ...validEntry,
      reflection: 'x'.repeat(501),
    }, { reflection_max: 500, prediction_max: 280 });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('reflection');
  });

  it('rejects prediction exceeding max chars', () => {
    const result = validateYearbookEntry({
      ...validEntry,
      prediction: 'x'.repeat(281),
    }, { reflection_max: 500, prediction_max: 280 });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('prediction');
  });

  it('rejects highlight exceeding max chars', () => {
    const result = validateYearbookEntry({
      ...validEntry,
      highlight: 'x'.repeat(281),
    }, { reflection_max: 500, prediction_max: 280 });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('highlight');
  });

  it('rejects would_return_why exceeding max chars', () => {
    const result = validateYearbookEntry({
      ...validEntry,
      would_return_why: 'x'.repeat(281),
    }, { reflection_max: 500, prediction_max: 280 });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('would_return_why');
  });

  it('rejects non-boolean would_return', () => {
    const result = validateYearbookEntry({
      ...validEntry,
      would_return: 'yes',
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('would_return');
  });

  it('accepts entry with would_return=false and no would_return_why', () => {
    const result = validateYearbookEntry({
      ...validEntry,
      would_return: false,
      would_return_why: '',
    });
    expect(result.valid).toBe(true);
  });

  it('accepts entry at exactly max chars for all fields', () => {
    const result = validateYearbookEntry({
      reflection: 'x'.repeat(500),
      prediction: 'x'.repeat(280),
      highlight: 'x'.repeat(280),
      would_return: true,
      would_return_why: 'x'.repeat(280),
    }, { reflection_max: 500, prediction_max: 280 });
    expect(result.valid).toBe(true);
  });
});
