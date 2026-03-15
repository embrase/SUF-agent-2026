import { describe, it, expect } from 'vitest';
import { generateApiKey, hashApiKey, verifyApiKey } from '../src/lib/api-key.js';

describe('API Key utilities', () => {
  it('generates a key of sufficient length', () => {
    const key = generateApiKey();
    expect(key.length).toBeGreaterThanOrEqual(48);
  });

  it('generates unique keys', () => {
    const key1 = generateApiKey();
    const key2 = generateApiKey();
    expect(key1).not.toBe(key2);
  });

  it('hashes a key deterministically', () => {
    const key = generateApiKey();
    const hash1 = hashApiKey(key);
    const hash2 = hashApiKey(key);
    expect(hash1).toBe(hash2);
  });

  it('hash differs from the key', () => {
    const key = generateApiKey();
    const hash = hashApiKey(key);
    expect(hash).not.toBe(key);
  });

  it('verifies a key against its hash', () => {
    const key = generateApiKey();
    const hash = hashApiKey(key);
    expect(verifyApiKey(key, hash)).toBe(true);
    expect(verifyApiKey('wrong-key', hash)).toBe(false);
  });
});
