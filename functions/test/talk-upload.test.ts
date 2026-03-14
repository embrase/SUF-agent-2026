// functions/test/talk-upload.test.ts
import { describe, it, expect, vi } from 'vitest';
import { handleTalkUpload } from '../src/api/talk-upload.js';
import { createMockResponse, createMockFirestore } from './helpers/firebase-mock.js';

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
    talkAlreadyExists?: boolean;
  } = {}) {
    const {
      proposalExists = true,
      proposalAgentId = 'agent-1',
      proposalStatus = 'submitted',
      talkAlreadyExists = false,
    } = overrides;

    const proposalData = {
      id: 'proposal-1',
      agent_id: proposalAgentId,
      title: 'AI Agents in Startups',
      status: proposalStatus,
    };

    const setFn = vi.fn();
    const updateFn = vi.fn();

    // Both proposal lookup and talk upload use the 'talks' collection.
    // doc(proposalId).get() returns the proposal; doc(talkId).set() saves the talk;
    // where().limit().get() checks for existing uploads.
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
              set: setFn,
              update: updateFn,
            })),
            where: vi.fn(() => ({
              limit: vi.fn(() => ({
                get: vi.fn(async () => ({
                  empty: !talkAlreadyExists,
                  docs: talkAlreadyExists
                    ? [{ id: 'existing-talk', data: () => ({ id: 'existing-talk' }) }]
                    : [],
                })),
              })),
            })),
          };
        }
        return { doc: vi.fn(), where: vi.fn() };
      }),
    } as any;

    const getSettings = vi.fn(async () => mockSettings);

    return { db, setFn, updateFn, getSettings };
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

  it('successfully uploads talk and updates proposal status', async () => {
    const { db, setFn, updateFn, getSettings } = createHandler();
    const req = {
      agent: { id: 'agent-1' },
      params: { id: 'proposal-1' },
      body: validBody,
    } as any;
    const res = createMockResponse();

    await handleTalkUpload(db, getSettings)(req, res as any);

    expect(res.statusCode).toBe(201);
    expect(res.body.status).toBe('talk_uploaded');
    expect(res.body.talk_id).toBeDefined();

    // Verify talk was saved
    expect(setFn).toHaveBeenCalledTimes(1);
    const savedTalk = setFn.mock.calls[0][0];
    expect(savedTalk.video_url).toBe(validBody.video_url);
    expect(savedTalk.transcript).toBe(validBody.transcript);
    expect(savedTalk.language).toBe('EN');
    expect(savedTalk.duration).toBe(420);
    expect(savedTalk.proposal_id).toBe('proposal-1');
    expect(savedTalk.agent_id).toBe('agent-1');

    // Verify proposal status updated
    expect(updateFn).toHaveBeenCalledTimes(1);
    const updateArgs = updateFn.mock.calls[0][0];
    expect(updateArgs.status).toBe('talk_uploaded');
  });

  it('includes optional subtitle_file when provided', async () => {
    const { db, setFn, getSettings } = createHandler();
    const req = {
      agent: { id: 'agent-1' },
      params: { id: 'proposal-1' },
      body: { ...validBody, subtitle_file: 'https://example.com/subs.srt' },
    } as any;
    const res = createMockResponse();

    await handleTalkUpload(db, getSettings)(req, res as any);

    expect(res.statusCode).toBe(201);
    const savedTalk = setFn.mock.calls[0][0];
    expect(savedTalk.subtitle_file).toBe('https://example.com/subs.srt');
  });

  it('includes optional thumbnail when provided', async () => {
    const { db, setFn, getSettings } = createHandler();
    const req = {
      agent: { id: 'agent-1' },
      params: { id: 'proposal-1' },
      body: { ...validBody, thumbnail: 'https://example.com/thumb.jpg' },
    } as any;
    const res = createMockResponse();

    await handleTalkUpload(db, getSettings)(req, res as any);

    expect(res.statusCode).toBe(201);
    const savedTalk = setFn.mock.calls[0][0];
    expect(savedTalk.thumbnail).toBe('https://example.com/thumb.jpg');
  });

  it('overwrites existing talk for the same proposal (re-upload)', async () => {
    const { db, setFn, getSettings } = createHandler({ talkAlreadyExists: true });
    const req = {
      agent: { id: 'agent-1' },
      params: { id: 'proposal-1' },
      body: { ...validBody, video_url: 'https://storage.example.com/updated-talk.mp4' },
    } as any;
    const res = createMockResponse();

    await handleTalkUpload(db, getSettings)(req, res as any);

    // Should succeed — agents can re-upload to update their talk
    expect(res.statusCode).toBe(201);
    expect(setFn).toHaveBeenCalledTimes(1);
  });

  it('allows upload regardless of proposal vote outcome (accepted status)', async () => {
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

  it('allows upload regardless of proposal vote outcome (not_selected status)', async () => {
    const { db, getSettings } = createHandler({ proposalStatus: 'not_selected' });
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
