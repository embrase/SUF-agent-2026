// functions/src/app.ts
// The Express app — shared between Firebase Functions (index.ts) and Vercel (api/index.ts).
// Does NOT call initializeApp() — the caller must do that before importing this module.
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
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
import { handleManifestoLock, handleManifestoSubmit } from './api/manifesto.js';
import { handleYearbook } from './api/yearbook.js';
import { handlePublicStats } from './api/public-stats.js';
import { createAdminRouter } from './api/admin/router.js';
import { loadSettings } from './config/settings.js';

export function createApp() {
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

  // --- Settings cache ---
  let cachedPhaseOverrides: Record<string, { is_open?: boolean; opens?: string; closes?: string }> = {};
  let cachedWriteFreeze = false;
  let settingsCacheExpiry = 0;
  const SETTINGS_CACHE_TTL_MS = 10_000;

  async function refreshSettingsCache(): Promise<void> {
    const now = Date.now();
    if (now < settingsCacheExpiry) return;
    const settings = await loadSettings(db);
    cachedPhaseOverrides = settings.phase_overrides || {};
    cachedWriteFreeze = settings.global_write_freeze;
    settingsCacheExpiry = now + SETTINGS_CACHE_TTL_MS;
  }

  const getPhaseOverridesSync = (phaseKey: string) => cachedPhaseOverrides[phaseKey];

  const getPhaseOverridesAsync = async (phaseKey: string) => {
    await refreshSettingsCache();
    return cachedPhaseOverrides[phaseKey];
  };

  const getGlobalWriteFreeze = async (): Promise<boolean> => {
    await refreshSettingsCache();
    return cachedWriteFreeze;
  };

  // --- Public endpoints ---
  app.post('/api/register', handleRegister(db, mailer));
  app.get('/api/verify-email', handleVerifyEmail(db));
  app.get('/api/status', handleStatus(getPhaseOverridesAsync, getGlobalWriteFreeze));
  app.get('/api/public/stats', handlePublicStats(db));

  // --- Authenticated endpoints ---
  app.post('/api/profile', auth, rateLimiter, handleProfile(db));
  app.get('/api/me', auth, handleMe(db));

  // Settings cache refresh middleware — runs before phase-gated routes
  app.use(async (_req, _res, next) => {
    await refreshSettingsCache();
    next();
  });

  // Phase gates
  const cfpGate = createPhaseGate('cfp', getPhaseOverridesSync);
  const boothSetupGate = createPhaseGate('booth_setup', getPhaseOverridesSync);
  const votingGate = createPhaseGate('voting', getPhaseOverridesSync);
  const showFloorGate = createPhaseGate('show_floor', getPhaseOverridesSync);
  const talkUploadGate = createPhaseGate('talk_uploads', getPhaseOverridesSync);
  const matchmakingGate = createPhaseGate('matchmaking', getPhaseOverridesSync);
  const manifestoPhaseGate = createPhaseGate('manifesto', getPhaseOverridesSync);
  const yearbookPhaseGate = createPhaseGate('yearbook', getPhaseOverridesSync);

  const idempotency = createIdempotencyMiddleware();

  const getBoothWallMaxPerDay = async (): Promise<number> => {
    const settings = await loadSettings(db);
    return settings.booth_wall_max_per_day;
  };

  // --- Talk proposal endpoints ---
  app.post('/api/talks', auth, rateLimiter, cfpGate, idempotency, handleCreateTalk(db));
  app.post('/api/talks/:id', auth, rateLimiter, cfpGate, handleUpdateTalk(db));

  // --- Booth endpoints ---
  app.post('/api/booths', auth, rateLimiter, boothSetupGate, idempotency, handleCreateOrUpdateBooth(db));
  app.post('/api/booths/:id/wall', auth, rateLimiter, handlePostBoothWallMessage(db, getBoothWallMaxPerDay));
  app.get('/api/booths/:id/wall', auth, handleGetBoothWall(db));
  app.delete('/api/booths/:id/wall/:messageId', auth, rateLimiter, handleDeleteBoothWallMessage(db));

  // --- Voting endpoints ---
  app.get('/api/talks/next', auth, rateLimiter, votingGate, handleGetNextTalk(db));
  app.post('/api/vote', auth, rateLimiter, votingGate, async (req, res) => {
    const settings = await loadSettings(db);
    return handleVote(db, settings)(req as any, res);
  });

  // --- Social endpoints ---
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

  // --- Talk upload ---
  const getTalkSettings = async () => {
    const settings = await loadSettings(db);
    return {
      talk_max_duration_seconds: settings.talk_max_duration_seconds,
      talk_accepted_formats: settings.talk_accepted_formats,
      talk_accepted_languages: settings.talk_accepted_languages,
    };
  };
  app.post('/api/talks/:id/upload', auth, rateLimiter, talkUploadGate, handleTalkUpload(db, getTalkSettings));

  // --- Meeting recommendations ---
  app.post('/api/meetings/recommend', auth, rateLimiter, matchmakingGate, handleRecommend(db));
  app.get('/api/meetings/recommendations', auth, rateLimiter, matchmakingGate, handleGetRecommendations(db));

  // --- Manifesto ---
  app.post('/api/manifesto/lock', auth, rateLimiter, manifestoPhaseGate, async (req, res) => {
    const settings = await loadSettings(db);
    await handleManifestoLock(db, settings)(req as any, res);
  });
  app.post('/api/manifesto/submit', auth, rateLimiter, manifestoPhaseGate, async (req, res) => {
    const settings = await loadSettings(db);
    await handleManifestoSubmit(db, settings)(req as any, res);
  });

  // --- Yearbook ---
  app.post('/api/yearbook', auth, rateLimiter, yearbookPhaseGate, async (req, res) => {
    const settings = await loadSettings(db);
    await handleYearbook(db, settings)(req as any, res);
  });

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Admin routes
  const adminRouter = createAdminRouter(db, getAuth());
  app.use('/api/admin', adminRouter);

  return app;
}
