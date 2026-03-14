// functions/src/index.ts
import { onRequest } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import express from 'express';
import cors from 'cors';

import { createAuthMiddleware } from './middleware/auth.js';
import { createRateLimiter } from './middleware/rate-limit.js';
import { createPhaseGate } from './middleware/phase-gate.js';
import { createIdempotencyMiddleware } from './middleware/idempotency.js';
import { handleRegister } from './api/register.js';
import { handleVerifyEmail } from './api/verify-email.js';
import { handleProfile, handleMe } from './api/profile.js';
import { handleStatus } from './api/status.js';
import { handleCreateTalk, handleUpdateTalk } from './api/talks.js';
import { handleCreateOrUpdateBooth, handlePostBoothWallMessage, handleGetBoothWall, handleDeleteBoothWallMessage } from './api/booths.js';
import { handleGetNextTalk, handleVote } from './api/vote.js';
import {
  handlePostStatus,
  handlePostWall,
  handleDeletePost,
  handleDeleteWallPost,
} from './api/social.js';
import { handleTalkUpload } from './api/talk-upload.js';
import { handleRecommend, handleGetRecommendations } from './api/meetings.js';
import { loadSettings } from './config/settings.js';
import { onAgentWrite, onTalkWrite, onBoothWrite, onSocialPostWrite } from './triggers/on-agent-write.js';

initializeApp();
const db = getFirestore();

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

const auth = createAuthMiddleware(db);
const rateLimiter = createRateLimiter(60);

// Placeholder mailer (replace with real email service in deployment)
const mailer = {
  sendVerification: async (email: string, token: string, agentId: string) => {
    console.log(`[MAILER] Verification email to ${email} with token ${token} for agent ${agentId}`);
  },
};

// Phase overrides loader — reads from Firestore settings
const getPhaseOverrides = async (phaseKey: string) => {
  const settings = await loadSettings(db);
  return settings.phase_overrides[phaseKey];
};

// Global write freeze check — reads from Firestore settings
const getGlobalWriteFreeze = async (): Promise<boolean> => {
  const settings = await loadSettings(db);
  return settings.global_write_freeze;
};

// Public endpoints (no auth)
app.post('/api/register', handleRegister(db, mailer));
app.get('/api/verify-email', handleVerifyEmail(db));
app.get('/api/status', handleStatus(getPhaseOverrides, getGlobalWriteFreeze));

// Authenticated endpoints
app.post('/api/profile', auth, rateLimiter, handleProfile(db));
app.get('/api/me', auth, handleMe(db));

// Phase gates
const cfpGate = createPhaseGate('cfp', (key) => {
  return undefined;
});
const boothSetupGate = createPhaseGate('booth_setup', (key) => {
  return undefined;
});

// Idempotency middleware instance
const idempotency = createIdempotencyMiddleware();

// Settings helper for booth wall rate limit
const getBoothWallMaxPerDay = async (): Promise<number> => {
  const settings = await loadSettings(db);
  return settings.booth_wall_max_per_day;
};

// --- Talk proposal endpoints (requires cfp phase) ---
app.post('/api/talks', auth, rateLimiter, cfpGate, idempotency, handleCreateTalk(db));
app.post('/api/talks/:id', auth, rateLimiter, cfpGate, handleUpdateTalk(db));

// --- Booth endpoints (requires booth_setup phase) ---
app.post('/api/booths', auth, rateLimiter, boothSetupGate, idempotency, handleCreateOrUpdateBooth(db));
app.post('/api/booths/:id/wall', auth, rateLimiter, handlePostBoothWallMessage(db, getBoothWallMaxPerDay));
app.get('/api/booths/:id/wall', auth, handleGetBoothWall(db));
app.delete('/api/booths/:id/wall/:messageId', auth, rateLimiter, handleDeleteBoothWallMessage(db));

// Phase gates for voting and social
const votingGate = createPhaseGate('voting', (key) => {
  return undefined;
});
const showFloorGate = createPhaseGate('show_floor', (key) => {
  return undefined;
});

// --- Voting endpoints (requires voting phase) ---
app.get('/api/talks/next', auth, rateLimiter, votingGate, handleGetNextTalk(db));
app.post('/api/vote', auth, rateLimiter, votingGate, async (req, res) => {
  const settings = await loadSettings(db);
  return handleVote(db, settings)(req as any, res);
});

// --- Social endpoints (requires show_floor phase) ---
app.post('/api/social/status', auth, rateLimiter, showFloorGate, async (req, res) => {
  const settings = await loadSettings(db);
  return handlePostStatus(db, settings)(req as any, res);
});
app.post('/api/social/wall/:id', auth, rateLimiter, showFloorGate, async (req, res) => {
  const settings = await loadSettings(db);
  return handlePostWall(db, settings)(req as any, res);
});
app.delete('/api/social/:id', auth, rateLimiter, showFloorGate, handleDeletePost(db));
app.delete('/api/social/wall/:id/:postId', auth, rateLimiter, showFloorGate, handleDeleteWallPost(db));

// Phase gates for talk uploads and matchmaking
const talkUploadGate = createPhaseGate('talk_uploads', (key) => {
  return undefined;
});
const matchmakingGate = createPhaseGate('matchmaking', (key) => {
  return undefined;
});

// Settings getter for talk upload validation
const getTalkSettings = async () => {
  const settings = await loadSettings(db);
  return {
    talk_max_duration_seconds: settings.talk_max_duration_seconds,
    talk_accepted_formats: settings.talk_accepted_formats,
    talk_accepted_languages: settings.talk_accepted_languages,
  };
};

// --- Talk upload endpoints (requires talk_uploads phase) ---
app.post('/api/talks/:id/upload', auth, rateLimiter, talkUploadGate, handleTalkUpload(db, getTalkSettings));

// --- Meeting recommendation endpoints (requires matchmaking phase) ---
app.post('/api/meetings/recommend', auth, rateLimiter, matchmakingGate, handleRecommend(db));
app.get('/api/meetings/recommendations', auth, rateLimiter, matchmakingGate, handleGetRecommendations(db));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export const api = onRequest({ cors: true }, app);

// Firestore triggers for static JSON regeneration
export { onAgentWrite, onTalkWrite, onBoothWrite, onSocialPostWrite };
