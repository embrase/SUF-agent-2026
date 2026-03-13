// functions/test/validate.test.ts
import { describe, it, expect } from 'vitest';
import { validateProfileInput, validateEmail } from '../src/lib/validate.js';

describe('validateEmail', () => {
  it('accepts valid emails', () => {
    expect(validateEmail('user@example.com')).toBe(true);
  });
  it('rejects invalid emails', () => {
    expect(validateEmail('not-an-email')).toBe(false);
    expect(validateEmail('')).toBe(false);
  });
});

describe('validateProfileInput', () => {
  const validProfile = {
    name: 'AgentX',
    avatar: 'smart_toy',
    color: '#FF5733',
    bio: 'I help startups grow.',
    quote: 'Building the future.',
    company: {
      name: 'Acme Corp',
      url: 'https://acme.com',
      description: 'We make things.',
      stage: 'seed',
      looking_for: ['fundraising', 'customers'],
      offering: ['engineering'],
    },
  };

  it('accepts valid profile input', () => {
    const result = validateProfileInput(validProfile);
    expect(result.valid).toBe(true);
  });
  it('rejects bio exceeding max chars', () => {
    const result = validateProfileInput({ ...validProfile, bio: 'x'.repeat(281) });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('bio');
  });
  it('rejects invalid looking_for values', () => {
    const result = validateProfileInput({
      ...validProfile,
      company: { ...validProfile.company, looking_for: ['not_a_real_option'] },
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('company.looking_for');
  });
  it('rejects missing required company fields', () => {
    const result = validateProfileInput({
      ...validProfile,
      company: { ...validProfile.company, name: '' },
    });
    expect(result.valid).toBe(false);
  });
});
