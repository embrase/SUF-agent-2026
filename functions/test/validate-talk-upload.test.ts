// functions/test/validate-talk-upload.test.ts
import { describe, it, expect } from 'vitest';
import { validateTalkUpload } from '../src/lib/validate.js';

describe('validateTalkUpload', () => {
  const validUpload = {
    video_url: 'https://storage.example.com/talk.mp4',
    transcript: 'Hello, this is my talk about AI agents and startups...',
    language: 'EN',
    duration: 300,
  };

  const settings = {
    talk_max_duration_seconds: 480,
    talk_accepted_formats: ['.mp4', '.mov', '.avi'],
    talk_accepted_languages: ['EN', 'FR'],
  };

  it('accepts valid upload input', () => {
    const result = validateTalkUpload(validUpload, settings);
    expect(result.valid).toBe(true);
    expect(Object.keys(result.errors)).toHaveLength(0);
  });

  it('rejects missing video_url', () => {
    const result = validateTalkUpload({ ...validUpload, video_url: '' }, settings);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('video_url');
  });

  it('rejects missing transcript', () => {
    const result = validateTalkUpload({ ...validUpload, transcript: '' }, settings);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('transcript');
  });

  it('rejects duration exceeding max', () => {
    const result = validateTalkUpload({ ...validUpload, duration: 600 }, settings);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('duration');
  });

  it('rejects zero duration', () => {
    const result = validateTalkUpload({ ...validUpload, duration: 0 }, settings);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('duration');
  });

  it('rejects negative duration', () => {
    const result = validateTalkUpload({ ...validUpload, duration: -10 }, settings);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('duration');
  });

  it('rejects invalid language', () => {
    const result = validateTalkUpload({ ...validUpload, language: 'DE' }, settings);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('language');
  });

  it('rejects invalid video format', () => {
    const result = validateTalkUpload(
      { ...validUpload, video_url: 'https://example.com/talk.wmv' },
      settings,
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('video_url');
  });

  it('accepts .mov format', () => {
    const result = validateTalkUpload(
      { ...validUpload, video_url: 'https://example.com/talk.mov' },
      settings,
    );
    expect(result.valid).toBe(true);
  });

  it('accepts .avi format', () => {
    const result = validateTalkUpload(
      { ...validUpload, video_url: 'https://example.com/talk.avi' },
      settings,
    );
    expect(result.valid).toBe(true);
  });

  it('accepts optional subtitle_file when provided', () => {
    const result = validateTalkUpload(
      { ...validUpload, subtitle_file: 'https://example.com/subs.srt' },
      settings,
    );
    expect(result.valid).toBe(true);
  });

  it('accepts upload without subtitle_file', () => {
    const result = validateTalkUpload(validUpload, settings);
    expect(result.valid).toBe(true);
  });

  it('accepts duration at exact max', () => {
    const result = validateTalkUpload({ ...validUpload, duration: 480 }, settings);
    expect(result.valid).toBe(true);
  });

  it('handles video_url with query params', () => {
    const result = validateTalkUpload(
      { ...validUpload, video_url: 'https://storage.example.com/talk.mp4?token=abc123' },
      settings,
    );
    expect(result.valid).toBe(true);
  });
});
