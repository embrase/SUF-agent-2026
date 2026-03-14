import { describe, it, expect } from 'vitest';
import {
  validateTalkProposalInput,
  validateBoothInput,
  validateBoothWallMessageInput,
} from '../src/lib/validate.js';

describe('validateTalkProposalInput', () => {
  const validTalk = {
    title: 'Why AI Agents Will Change Startups',
    topic: 'The agentic revolution in startup ecosystems',
    description: 'A deep dive into how AI co-founders are reshaping early-stage companies.',
    format: 'keynote',
    tags: ['ai', 'startups', 'agents'],
  };

  it('accepts valid talk proposal input', () => {
    const result = validateTalkProposalInput(validTalk);
    expect(result.valid).toBe(true);
    expect(Object.keys(result.errors)).toHaveLength(0);
  });

  it('rejects missing title', () => {
    const result = validateTalkProposalInput({ ...validTalk, title: '' });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('title');
  });

  it('rejects title exceeding 100 chars', () => {
    const result = validateTalkProposalInput({ ...validTalk, title: 'x'.repeat(101) });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('title');
  });

  it('rejects topic exceeding 200 chars', () => {
    const result = validateTalkProposalInput({ ...validTalk, topic: 'x'.repeat(201) });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('topic');
  });

  it('rejects description exceeding 1000 chars', () => {
    const result = validateTalkProposalInput({ ...validTalk, description: 'x'.repeat(1001) });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('description');
  });

  it('rejects missing format', () => {
    const result = validateTalkProposalInput({ ...validTalk, format: '' });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('format');
  });

  it('rejects more than 5 tags', () => {
    const result = validateTalkProposalInput({ ...validTalk, tags: ['a', 'b', 'c', 'd', 'e', 'f'] });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('tags');
  });

  it('allows empty tags array', () => {
    const result = validateTalkProposalInput({ ...validTalk, tags: [] });
    expect(result.valid).toBe(true);
  });

  it('allows missing optional fields (topic, description, tags)', () => {
    const result = validateTalkProposalInput({ title: 'My Talk', format: 'keynote' });
    expect(result.valid).toBe(true);
  });
});

describe('validateBoothInput', () => {
  const validBooth = {
    company_name: 'Acme Corp',
    tagline: 'Building the future',
    product_description: 'We build AI-powered tools for startups.',
    pricing: 'Free tier + $99/mo pro',
    founding_team: 'Jane (CEO), John (CTO)',
    looking_for: ['customers', 'partners'],
    urls: [
      { label: 'Website', url: 'https://acme.com' },
      { label: 'GitHub', url: 'https://github.com/acme' },
    ],
  };

  it('accepts valid booth input', () => {
    const result = validateBoothInput(validBooth);
    expect(result.valid).toBe(true);
    expect(Object.keys(result.errors)).toHaveLength(0);
  });

  it('rejects missing company_name', () => {
    const result = validateBoothInput({ ...validBooth, company_name: '' });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('company_name');
  });

  it('rejects tagline exceeding 100 chars', () => {
    const result = validateBoothInput({ ...validBooth, tagline: 'x'.repeat(101) });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('tagline');
  });

  it('rejects product_description exceeding 2000 chars', () => {
    const result = validateBoothInput({ ...validBooth, product_description: 'x'.repeat(2001) });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('product_description');
  });

  it('rejects pricing exceeding 500 chars', () => {
    const result = validateBoothInput({ ...validBooth, pricing: 'x'.repeat(501) });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('pricing');
  });

  it('rejects founding_team exceeding 1000 chars', () => {
    const result = validateBoothInput({ ...validBooth, founding_team: 'x'.repeat(1001) });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('founding_team');
  });

  it('rejects invalid looking_for values', () => {
    const result = validateBoothInput({ ...validBooth, looking_for: ['not_valid'] });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('looking_for');
  });

  it('rejects urls entries missing label or url', () => {
    const result = validateBoothInput({ ...validBooth, urls: [{ label: '', url: 'https://x.com' }] });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('urls');
  });

  it('rejects urls entries with invalid url format', () => {
    const result = validateBoothInput({ ...validBooth, urls: [{ label: 'Site', url: 'not-a-url' }] });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('urls');
  });

  it('allows optional fields to be omitted', () => {
    const result = validateBoothInput({
      company_name: 'Acme',
      product_description: 'We build things.',
    });
    expect(result.valid).toBe(true);
  });
});

describe('validateBoothWallMessageInput', () => {
  it('accepts valid message', () => {
    const result = validateBoothWallMessageInput({ content: 'Great booth! Love the product.' });
    expect(result.valid).toBe(true);
  });

  it('rejects empty content', () => {
    const result = validateBoothWallMessageInput({ content: '' });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('content');
  });

  it('rejects missing content', () => {
    const result = validateBoothWallMessageInput({});
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('content');
  });

  it('rejects content exceeding 500 chars', () => {
    const result = validateBoothWallMessageInput({ content: 'x'.repeat(501) });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('content');
  });
});
