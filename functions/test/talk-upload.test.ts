// functions/test/talk-upload.test.ts
import { describe, it, expect, vi } from 'vitest';
import { handleTalkUpload } from '../src/api/talk-upload.js';
import { createMockResponse } from './helpers/firebase-mock.js';

describe('POST /api/talks/:id/upload', () => {
  const validBody = {
    video_url: 'https://storage.example.com/my-talk.mp4',
    transcript: 'Hello everyone. Today I want to talk about AI agents and the future of startups.',
    language: 'EN',
    duration: 420,
  };

  const mockSettings = {
    talk_max_duration_seconds: 480,
    talk_accepted_formats: ['.mp4', '.mov', '.avi'],
    talk_accepted_languages: ['EN', 'FR'],
  };

  function createHandler(overrides: {
    proposalExists?: boolean;
    proposalAgentId?: string;
    proposalStatus?: string;
  } = {}) {
    const {
      proposalExists = true,
      proposalAgentId = 'agent-1',
      proposalStatus = 'submitted',
    } = overrides;

    const proposalData = {
      id: 'proposal-1',
      agent_id: proposalAgentId,
      title: 'AI Agents in Startups',
      status: proposalStatus,
    };

    const updateFn = vi.fn();

    const db = {
      collection: vi.fn((name: string) => {
        if (name === 'talks') {
          return {
            doc: vi.fn((id: string) => ({
              get: vi.fn(async () => ({
                exists: id === 'proposal-1' ? proposalExists : false,
                data: () => id === 'proposal-1' ? proposalData : undefined,
                id,
              })),
              update: updateFn,
            })),
          };
        }
        return { doc: vi.fn() };
      }),
    } as any;

    const getSettings = vi.fn(async () => mockSettings);

    return { db, updateFn, getSettings };
  }

  it('rejects upload when proposal does not exist', async () => {
    const { db, getSettings } = createHandler({ proposalExists: false });
    const req = {
      agent: { id: 'agent-1' },
      params: { id: 'proposal-nonexistent' },
      body: validBody,
    } as any;
    const res = createMockResponse();

    await handleTalkUpload(db, getSettings)(req, res as any);

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('not_found');
  });

  it('rejects upload when agent does not own the proposal', async () => {
    const { db, getSettings } = createHandler({ proposalAgentId: 'agent-other' });
    const req = {
      agent: { id: 'agent-1' },
      params: { id: 'proposal-1' },
      body: validBody,
    } as any;
    const res = createMockResponse();

    await handleTalkUpload(db, getSettings)(req, res as any);

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('unauthorized');
  });

  it('rejects upload with invalid video format', async () => {
    const { db, getSettings } = createHandler();
    const req = {
      agent: { id: 'agent-1' },
      params: { id: 'proposal-1' },
      body: { ...validBody, video_url: 'https://example.com/talk.wmv' },
    } as any;
    const res = createMockResponse();

    await handleTalkUpload(db, getSettings)(req, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('validation_error');
    expect(res.body.details).toHaveProperty('video_url');
  });

  it('rejects upload with duration exceeding max', async () => {
    const { db, getSettings } = createHandler();
    const req = {
      agent: { id: 'agent-1' },
      params: { id: 'proposal-1' },
      body: { ...validBody, duration: 600 },
    } as any;
    const res = createMockResponse();

    await handleTalkUpload(db, getSettings)(req, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('validation_error');
    expect(res.body.details).toHaveProperty('duration');
  });

  it('rejects upload with missing transcript', async () => {
    const { db, getSettings } = createHandler();
    const req = {
      agent: { id: 'agent-1' },
      params: { id: 'proposal-1' },
      body: { ...validBody, transcript: '' },
    } as any;
    const res = createMockResponse();

    await handleTalkUpload(db, getSettings)(req, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('validation_error');
    expect(res.body.details).toHaveProperty('transcript');
  });

  it('rejects upload with invalid language', async () => {
    const { db, getSettings } = createHandler();
    const req = {
      agent: { id: 'agent-1' },
      params: { id: 'proposal-1' },
      body: { ...validBody, language: 'DE' },
    } as any;
    const res = createMockResponse();

    await handleTalkUpload(db, getSettings)(req, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('validation_error');
    expect(res.body.details).toHaveProperty('language');
  });

  it('successfully uploads talk by merging into proposal doc', async () => {
    const { db, updateFn, getSettings } = createHandler();
    const req = {
      agent: { id: 'agent-1' },
      params: { id: 'proposal-1' },
      body: validBody,
    } as any;
    const res = createMockResponse();

    await handleTalkUpload(db, getSettings)(req, res as any);

    expect(res.statusCode).toBe(201);
    expect(res.body.status).toBe('talk_uploaded');
    expect(res.body.talk_id).toBe('proposal-1');
    expect(res.body.proposal_id).toBe('proposal-1');

    // Upload data merged into the proposal doc via update
    expect(updateFn).toHaveBeenCalledTimes(1);
    const updateArgs = updateFn.mock.calls[0][0];
    expect(updateArgs.status).toBe('talk_uploaded');
    expect(updateArgs.video_url).toBe(validBody.video_url);
    expect(updateArgs.transcript).toBe(validBody.transcript);
    expect(updateArgs.language).toBe('EN');
    expect(updateArgs.duration).toBe(420);
  });

  it('includes optional subtitle_file when provided', async () => {
    const { db, updateFn, getSettings } = createHandler();
    const req = {
      agent: { id: 'agent-1' },
      params: { id: 'proposal-1' },
      body: { ...validBody, subtitle_file: 'https://example.com/subs.srt' },
    } as any;
    const res = createMockResponse();

    await handleTalkUpload(db, getSettings)(req, res as any);

    expect(res.statusCode).toBe(201);
    const updateArgs = updateFn.mock.calls[0][0];
    expect(updateArgs.subtitle_file).toBe('https://example.com/subs.srt');
  });

  it('includes optional thumbnail when provided', async () => {
    const { db, updateFn, getSettings } = createHandler();
    const req = {
      agent: { id: 'agent-1' },
      params: { id: 'proposal-1' },
      body: { ...validBody, thumbnail: 'https://example.com/thumb.jpg' },
    } as any;
    const res = createMockResponse();

    await handleTalkUpload(db, getSettings)(req, res as any);

    expect(res.statusCode).toBe(201);
    const updateArgs = updateFn.mock.calls[0][0];
    expect(updateArgs.thumbnail).toBe('https://example.com/thumb.jpg');
  });

  it('allows re-upload (idempotent update)', async () => {
    const { db, updateFn, getSettings } = createHandler({ proposalStatus: 'talk_uploaded' });
    const req = {
      agent: { id: 'agent-1' },
      params: { id: 'proposal-1' },
      body: { ...validBody, video_url: 'https://storage.example.com/updated-talk.mp4' },
    } as any;
    const res = createMockResponse();

    await handleTalkUpload(db, getSettings)(req, res as any);

    expect(res.statusCode).toBe(201);
    const updateArgs = updateFn.mock.calls[0][0];
    expect(updateArgs.video_url).toBe('https://storage.example.com/updated-talk.mp4');
  });

  it('allows upload regardless of proposal vote outcome', async () => {
    const { db, getSettings } = createHandler({ proposalStatus: 'accepted' });
    const req = {
      agent: { id: 'agent-1' },
      params: { id: 'proposal-1' },
      body: validBody,
    } as any;
    const res = createMockResponse();

    await handleTalkUpload(db, getSettings)(req, res as any);

    expect(res.statusCode).toBe(201);
  });
});
