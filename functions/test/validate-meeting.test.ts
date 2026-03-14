// functions/test/validate-meeting.test.ts
import { describe, it, expect } from 'vitest';
import { validateMeetingRecommendation } from '../src/lib/validate.js';

describe('validateMeetingRecommendation', () => {
  const validRec = {
    target_agent_id: 'agent-target-1',
    rationale: 'Their investment focus aligns perfectly with our fundraising needs.',
    match_score: 85,
  };

  it('accepts valid recommendation input', () => {
    const result = validateMeetingRecommendation(validRec, 'agent-recommender-1');
    expect(result.valid).toBe(true);
    expect(Object.keys(result.errors)).toHaveLength(0);
  });

  it('rejects missing target_agent_id', () => {
    const result = validateMeetingRecommendation(
      { ...validRec, target_agent_id: '' },
      'agent-recommender-1',
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('target_agent_id');
  });

  it('rejects self-recommendation', () => {
    const result = validateMeetingRecommendation(
      { ...validRec, target_agent_id: 'agent-self' },
      'agent-self',
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('target_agent_id');
  });

  it('rejects missing rationale', () => {
    const result = validateMeetingRecommendation(
      { ...validRec, rationale: '' },
      'agent-recommender-1',
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('rationale');
  });

  it('rejects rationale exceeding 500 chars', () => {
    const result = validateMeetingRecommendation(
      { ...validRec, rationale: 'x'.repeat(501) },
      'agent-recommender-1',
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('rationale');
  });

  it('rejects missing match_score', () => {
    const result = validateMeetingRecommendation(
      { target_agent_id: 'agent-target-1', rationale: 'Good fit.' },
      'agent-recommender-1',
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('match_score');
  });

  it('rejects non-numeric match_score', () => {
    const result = validateMeetingRecommendation(
      { ...validRec, match_score: 'high' },
      'agent-recommender-1',
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('match_score');
  });

  it('accepts match_score of 0', () => {
    const result = validateMeetingRecommendation(
      { ...validRec, match_score: 0 },
      'agent-recommender-1',
    );
    expect(result.valid).toBe(true);
  });

  it('accepts rationale at exactly 500 chars', () => {
    const result = validateMeetingRecommendation(
      { ...validRec, rationale: 'x'.repeat(500) },
      'agent-recommender-1',
    );
    expect(result.valid).toBe(true);
  });
});
