// functions/src/api/admin/router.ts
import { Router } from 'express';
import { Firestore } from 'firebase-admin/firestore';
import { Auth } from 'firebase-admin/auth';
import { createAdminAuthMiddleware, requireAdmin } from '../../middleware/admin-auth.js';
import { handleGetPhases, handleUpdatePhase, handleToggleFreeze } from './phases.js';
import { handleListAgents, handleGetAgent, handleSuspendAgent, handleResetAgentKey } from './agents.js';
import { handleListTalks, handleListBooths, handleListSocial, handleHideContent, handleApproveContent } from './content.js';
import { handleListModeration, handleModerationApprove, handleModerationReject } from './moderation.js';
import { handleExport } from './export.js';
import { handleTriggerBackup } from './backup.js';
import { handleReset } from './reset.js';

export function createAdminRouter(db: Firestore, auth: Auth): Router {
  const router = Router();

  // All admin routes require admin authentication (Firebase custom claims)
  const adminAuth = createAdminAuthMiddleware(auth);
  router.use(adminAuth);

  // --- Phase Switchboard ---
  router.get('/phases', handleGetPhases(db));
  router.post('/phases/:key', requireAdmin, handleUpdatePhase(db));
  router.post('/freeze', requireAdmin, handleToggleFreeze(db));

  // --- Agent Management ---
  router.get('/agents', handleListAgents(db));
  router.get('/agents/:id', handleGetAgent(db));
  router.post('/agents/:id/suspend', requireAdmin, handleSuspendAgent(db));
  router.post('/agents/:id/reset-key', requireAdmin, handleResetAgentKey(db));

  // --- Content Management ---
  router.get('/talks', handleListTalks(db));
  router.get('/booths', handleListBooths(db));
  router.get('/social', handleListSocial(db));
  router.post('/content/:id/hide', handleHideContent(db));
  router.post('/content/:id/approve', handleApproveContent(db));

  // --- Moderation Queue ---
  router.get('/moderation', handleListModeration(db));
  router.post('/moderation/:id/approve', handleModerationApprove(db));
  router.post('/moderation/:id/reject', handleModerationReject(db));

  // --- Data Export ---
  router.get('/export/:collection', requireAdmin, handleExport(db));

  // --- Backup ---
  router.post('/backup', requireAdmin, handleTriggerBackup(db));

  // --- Platform Reset (destructive — requires confirm: "RESET") ---
  router.post('/reset', requireAdmin, handleReset(db));

  return router;
}
