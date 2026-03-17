/**
 * ConferenceSimulator — wires the real Express app with SimulationFirestore.
 *
 * Controls phase advancement, provides helpers for extracting verification
 * tokens, and exposes the Express app for supertest.
 *
 * CRITICAL: Phase gates require SYNCHRONOUS override getters. This reads
 * directly from _store, never via async loadSettings().
 */
import express from 'express';
import { createSimulationFirestore } from './simulation-firestore.js';
import { createAuthMiddleware } from '../../src/middleware/auth.js';
import { createRateLimiter } from '../../src/middleware/rate-limit.js';
import { createPhaseGate } from '../../src/middleware/phase-gate.js';
import { createIdempotencyMiddleware } from '../../src/middleware/idempotency.js';
import { handleRegister } from '../../src/api/register.js';
import { handleVerifyEmail } from '../../src/api/verify-email.js';
import { handleProfile, handleMe } from '../../src/api/profile.js';
import { handleStatus } from '../../src/api/status.js';
import { handleCreateTalk, handleUpdateTalk } from '../../src/api/talks.js';
import {
  handleCreateOrUpdateBooth,
  handlePostBoothWallMessage,
  handleGetBoothWall,
  handleDeleteBoothWallMessage,
} from '../../src/api/booths.js';
import { handleGetNextTalk, handleVote } from '../../src/api/vote.js';
import {
  handlePostStatus,
  handlePostWall,
  handleDeletePost,
  handleDeleteWallPost,
} from '../../src/api/social.js';
import { handleTalkUpload } from '../../src/api/talk-upload.js';
import { handleRecommend, handleGetRecommendations } from '../../src/api/meetings.js';
import { handleManifestoLock, handleManifestoSubmit } from '../../src/api/manifesto.js';
import { handleYearbook } from '../../src/api/yearbook.js';
import { handlePublicStats } from '../../src/api/public-stats.js';
import { handleSaveHandoff, handleGetHandoff } from '../../src/api/handoff.js';
import { loadSettings } from '../../src/config/settings.js';

const ALL_PHASES = [
  'registration', 'cfp', 'booth_setup', 'voting',
  'talk_uploads', 'show_floor', 'matchmaking', 'manifesto', 'yearbook',
] as const;

export class ConferenceSimulator {
  readonly db: ReturnType<typeof createSimulationFirestore>;
  readonly app: express.Express;
  private _openPhases: Set<string> = new Set();

  constructor() {
    this.db = createSimulationFirestore();
    this.app = this.buildApp();
  }

  openPhase(phase: string): void {
    this._openPhases.add(phase);
    this.syncPhasesToStore();
  }

  closePhase(phase: string): void {
    this._openPhases.delete(phase);
    this.syncPhasesToStore();
  }

  setStage(phases: string[]): void {
    this._openPhases.clear();
    for (const p of phases) this._openPhases.add(p);
    this.syncPhasesToStore();
  }

  getOpenPhases(): string[] {
    return [...this._openPhases];
  }

  getVerificationToken(agentId: string): string | undefined {
    return this.db._store['agents']?.[agentId]?.verification_token;
  }

  getAgentIds(): string[] {
    return Object.keys(this.db._store['agents'] || {});
  }

  seedManifesto(content: string): void {
    if (!this.db._store['manifesto']) this.db._store['manifesto'] = {};
    this.db._store['manifesto']['current'] = {
      content,
      version: 1,
      locked_by: null,
      lock_expires: null,
      updated_at: new Date().toISOString(),
    };
  }

  private syncPhasesToStore(): void {
    const overrides: Record<string, { is_open: boolean }> = {};
    for (const phase of ALL_PHASES) {
      overrides[phase] = { is_open: this._openPhases.has(phase) };
    }
    if (!this.db._store['config']) this.db._store['config'] = {};
    this.db._store['config']['settings'] = {
      ...(this.db._store['config']?.['settings'] || {}),
      phase_overrides: overrides,
    };
  }

  private buildApp(): express.Express {
    const app = express();
    app.use(express.json());

    const db = this.db as any;
    const auth = createAuthMiddleware(db);
    const rateLimiter = createRateLimiter(600); // High limit for simulation

    const mailer = { sendVerification: async () => {} };

    // SYNC phase override getter — reads directly from _store
    const getPhaseOverridesSync = (phaseKey: string) => {
      return this.db._store['config']?.['settings']?.phase_overrides?.[phaseKey];
    };

    // ASYNC getter for handleStatus
    const getPhaseOverridesAsync = async (phaseKey: string) => {
      await loadSettings(db);
      return this.db._store['config']?.['settings']?.phase_overrides?.[phaseKey];
    };

    const getGlobalWriteFreeze = async (): Promise<boolean> => {
      const settings = await loadSettings(db);
      return settings.global_write_freeze;
    };

    // Public endpoints
    app.post('/api/register', handleRegister(db, mailer));
    app.get('/api/verify-email', handleVerifyEmail(db));
    app.get('/api/status', handleStatus(getPhaseOverridesAsync, getGlobalWriteFreeze));
    app.get('/api/public/stats', handlePublicStats(db));

    // Authenticated endpoints
    app.post('/api/profile', auth, rateLimiter, handleProfile(db));
    app.get('/api/me', auth, handleMe(db));
    app.post('/api/handoff', auth, rateLimiter, handleSaveHandoff(db));
    app.get('/api/handoff', auth, handleGetHandoff(db));

    // Phase gates — sync getter
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

    // Talk proposals
    app.post('/api/talks', auth, rateLimiter, cfpGate, idempotency, handleCreateTalk(db));
    app.post('/api/talks/:id', auth, rateLimiter, cfpGate, handleUpdateTalk(db));

    // Booths
    app.post('/api/booths', auth, rateLimiter, boothSetupGate, idempotency, handleCreateOrUpdateBooth(db));
    app.post('/api/booths/:id/wall', auth, rateLimiter, handlePostBoothWallMessage(db, getBoothWallMaxPerDay));
    app.get('/api/booths/:id/wall', auth, handleGetBoothWall(db));
    app.delete('/api/booths/:id/wall/:messageId', auth, rateLimiter, handleDeleteBoothWallMessage(db));

    // Voting
    app.get('/api/talks/next', auth, rateLimiter, votingGate, handleGetNextTalk(db));
    app.post('/api/vote', auth, rateLimiter, votingGate, async (req, res) => {
      const settings = await loadSettings(db);
      return handleVote(db, settings)(req as any, res);
    });

    // Social
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

    // Talk uploads
    const getTalkSettings = async () => {
      const settings = await loadSettings(db);
      return {
        talk_max_duration_seconds: settings.talk_max_duration_seconds,
        talk_accepted_formats: settings.talk_accepted_formats,
        talk_accepted_languages: settings.talk_accepted_languages,
      };
    };
    app.post('/api/talks/:id/upload', auth, rateLimiter, talkUploadGate, handleTalkUpload(db, getTalkSettings));

    // Meetings
    app.post('/api/meetings/recommend', auth, rateLimiter, matchmakingGate, handleRecommend(db));
    app.get('/api/meetings/recommendations', auth, rateLimiter, matchmakingGate, handleGetRecommendations(db));

    // Manifesto
    app.post('/api/manifesto/lock', auth, rateLimiter, manifestoPhaseGate, async (req, res) => {
      const settings = await loadSettings(db);
      await handleManifestoLock(db, settings)(req as any, res);
    });
    app.post('/api/manifesto/submit', auth, rateLimiter, manifestoPhaseGate, async (req, res) => {
      const settings = await loadSettings(db);
      await handleManifestoSubmit(db, settings)(req as any, res);
    });

    // Yearbook
    app.post('/api/yearbook', auth, rateLimiter, yearbookPhaseGate, async (req, res) => {
      const settings = await loadSettings(db);
      await handleYearbook(db, settings)(req as any, res);
    });

    app.get('/api/health', (_req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    return app;
  }
}
