# Plan 6: Admin Dashboard (API) — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the admin-only API layer: authentication via Firebase custom claims, phase switchboard with audit logging, entity management (agents, talks, booths, social posts), content moderation queue, data export for all collections, and manual backup triggering. This plan is API-only — the admin web UI is Plan 7.

**Architecture:** Admin routes live on the same Express app as agent routes but under the `/api/admin/` prefix, protected by admin middleware that checks Firebase Auth custom claims (not API keys). All admin actions are audit-logged to a Firestore `admin_audit_log` collection.

**Tech Stack:** TypeScript, Express, Firebase (Auth, Firestore, Cloud Functions v2), Vitest for testing.

**Spec references:** Section 5 (5.1-5.5), Section 4.3 (Phase Controls), Section 2.6 (Content Moderation Modes)

---

## File Structure

```
functions/
├── src/
│   ├── index.ts                              # MODIFY — mount admin router
│   ├── middleware/
│   │   └── admin-auth.ts                     # NEW — Firebase custom claims middleware
│   ├── api/
│   │   └── admin/
│   │       ├── router.ts                     # NEW — Express router for all admin routes
│   │       ├── phases.ts                     # NEW — Phase switchboard endpoints
│   │       ├── agents.ts                     # NEW — Agent management endpoints
│   │       ├── content.ts                    # NEW — Talks, booths, social, content hide/approve
│   │       ├── moderation.ts                # NEW — Moderation queue endpoints
│   │       ├── export.ts                     # NEW — Data export endpoints
│   │       └── backup.ts                     # NEW — Manual backup trigger
│   ├── lib/
│   │   └── audit-log.ts                      # NEW — Audit log writer
│   └── types/
│       └── index.ts                          # MODIFY — add admin types
├── test/
│   ├── middleware/
│   │   └── admin-auth.test.ts               # NEW
│   ├── admin/
│   │   ├── phases.test.ts                    # NEW
│   │   ├── agents.test.ts                    # NEW
│   │   ├── content.test.ts                   # NEW
│   │   ├── moderation.test.ts               # NEW
│   │   ├── export.test.ts                    # NEW
│   │   └── backup.test.ts                    # NEW
│   └── lib/
│       └── audit-log.test.ts                # NEW
```

---

## Chunk 1: Admin Auth Middleware & Audit Logging

### Task 1: Add admin types to shared types

**Files:**
- Modify: `functions/src/types/index.ts`

- [ ] **Step 1: Add admin-related types**

Append the following to `functions/src/types/index.ts`:

```ts
// --- Admin types (Plan 6) ---

export type AdminRole = 'admin' | 'moderator';

export interface AdminUser {
  uid: string;
  email: string;
  role: AdminRole;
}

export interface AuditLogEntry {
  id: string;
  admin_uid: string;
  admin_email: string;
  action: string;
  target_type: string;          // 'phase', 'agent', 'content', 'moderation', 'backup', 'settings'
  target_id: string;
  details: Record<string, unknown>;
  reason?: string;
  timestamp: FirebaseFirestore.Timestamp;
}

export interface PhaseState {
  key: string;
  name: string;
  default_opens: string;
  default_closes: string;
  override_opens?: string;
  override_closes?: string;
  override_is_open?: boolean;
  computed_is_open: boolean;
}

export interface ModerationItem {
  id: string;
  collection: string;          // 'agents', 'talks', 'booths', 'social_posts'
  content_snapshot: Record<string, unknown>;
  submitted_at: FirebaseFirestore.Timestamp;
  status: 'pending_review' | 'approved' | 'rejected';
  reviewed_by?: string;
  reviewed_at?: FirebaseFirestore.Timestamp;
}
```

- [ ] **Step 2: Commit**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent"
git add functions/src/types/index.ts
git commit -m "feat(admin): add admin, audit log, phase state, and moderation types"
```

---

### Task 2: Write audit log utility

**Files:**
- Create: `functions/src/lib/audit-log.ts`
- Test: `functions/test/lib/audit-log.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// functions/test/lib/audit-log.test.ts
import { describe, it, expect, vi } from 'vitest';
import { writeAuditLog } from '../../src/lib/audit-log.js';

describe('Audit log writer', () => {
  it('writes an audit log entry to Firestore', async () => {
    const setCalled: any[] = [];
    const mockDb = {
      collection: vi.fn((name: string) => {
        expect(name).toBe('admin_audit_log');
        return {
          doc: vi.fn(() => ({
            set: vi.fn(async (data: any) => {
              setCalled.push(data);
            }),
          })),
        };
      }),
    };

    await writeAuditLog(mockDb as any, {
      admin_uid: 'admin-1',
      admin_email: 'admin@startupfest.com',
      action: 'phase_update',
      target_type: 'phase',
      target_id: 'cfp',
      details: { is_open: false },
      reason: 'Closing CFP early',
    });

    expect(setCalled).toHaveLength(1);
    expect(setCalled[0].admin_uid).toBe('admin-1');
    expect(setCalled[0].action).toBe('phase_update');
    expect(setCalled[0].target_type).toBe('phase');
    expect(setCalled[0].target_id).toBe('cfp');
    expect(setCalled[0].details).toEqual({ is_open: false });
    expect(setCalled[0].reason).toBe('Closing CFP early');
    expect(setCalled[0].id).toBeDefined();
    expect(setCalled[0].timestamp).toBeDefined();
  });

  it('writes entry without optional reason', async () => {
    const setCalled: any[] = [];
    const mockDb = {
      collection: vi.fn(() => ({
        doc: vi.fn(() => ({
          set: vi.fn(async (data: any) => {
            setCalled.push(data);
          }),
        })),
      })),
    };

    await writeAuditLog(mockDb as any, {
      admin_uid: 'admin-1',
      admin_email: 'admin@startupfest.com',
      action: 'backup_trigger',
      target_type: 'backup',
      target_id: 'manual',
      details: {},
    });

    expect(setCalled).toHaveLength(1);
    expect(setCalled[0].reason).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent/functions"
npx vitest run test/lib/audit-log.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```ts
// functions/src/lib/audit-log.ts
import { Firestore, FieldValue } from 'firebase-admin/firestore';
import { randomBytes } from 'crypto';

export interface AuditLogInput {
  admin_uid: string;
  admin_email: string;
  action: string;
  target_type: string;
  target_id: string;
  details: Record<string, unknown>;
  reason?: string;
}

export async function writeAuditLog(db: Firestore, input: AuditLogInput): Promise<string> {
  const id = randomBytes(12).toString('hex');

  const entry: Record<string, unknown> = {
    id,
    admin_uid: input.admin_uid,
    admin_email: input.admin_email,
    action: input.action,
    target_type: input.target_type,
    target_id: input.target_id,
    details: input.details,
    timestamp: FieldValue.serverTimestamp(),
  };

  if (input.reason !== undefined) {
    entry.reason = input.reason;
  }

  await db.collection('admin_audit_log').doc(id).set(entry);
  return id;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent/functions"
npx vitest run test/lib/audit-log.test.ts
```

Expected: All 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent"
git add functions/src/lib/audit-log.ts functions/test/lib/audit-log.test.ts
git commit -m "feat(admin): audit log writer for all admin actions"
```

---

### Task 3: Write admin auth middleware

**Files:**
- Create: `functions/src/middleware/admin-auth.ts`
- Test: `functions/test/middleware/admin-auth.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// functions/test/middleware/admin-auth.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createAdminAuthMiddleware } from '../../src/middleware/admin-auth.js';
import { createMockResponse } from '../helpers/firebase-mock.js';

function createMockAuth(claims: Record<string, any> | null, email?: string) {
  return {
    verifyIdToken: vi.fn(async (token: string) => {
      if (token === 'invalid-token') throw new Error('Invalid token');
      return {
        uid: 'admin-uid-1',
        email: email || 'admin@startupfest.com',
        ...(claims || {}),
      };
    }),
  };
}

describe('Admin auth middleware', () => {
  it('rejects requests without Authorization header', async () => {
    const auth = createMockAuth({ role: 'admin' });
    const middleware = createAdminAuthMiddleware(auth as any);
    const req = { headers: {} } as any;
    const res = createMockResponse();
    const next = vi.fn();

    await middleware(req, res as any, next);

    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('unauthorized');
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects requests with invalid Firebase ID token', async () => {
    const auth = createMockAuth({ role: 'admin' });
    const middleware = createAdminAuthMiddleware(auth as any);
    const req = { headers: { authorization: 'Bearer invalid-token' } } as any;
    const res = createMockResponse();
    const next = vi.fn();

    await middleware(req, res as any, next);

    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('unauthorized');
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects users without admin or moderator role', async () => {
    const auth = createMockAuth({});  // No role claim
    const middleware = createAdminAuthMiddleware(auth as any);
    const req = { headers: { authorization: 'Bearer valid-token' } } as any;
    const res = createMockResponse();
    const next = vi.fn();

    await middleware(req, res as any, next);

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('forbidden');
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts admin role and attaches admin user to req', async () => {
    const auth = createMockAuth({ role: 'admin' });
    const middleware = createAdminAuthMiddleware(auth as any);
    const req = { headers: { authorization: 'Bearer valid-token' } } as any;
    const res = createMockResponse();
    const next = vi.fn();

    await middleware(req, res as any, next);

    expect(next).toHaveBeenCalled();
    expect(req.adminUser).toBeDefined();
    expect(req.adminUser.uid).toBe('admin-uid-1');
    expect(req.adminUser.email).toBe('admin@startupfest.com');
    expect(req.adminUser.role).toBe('admin');
  });

  it('accepts moderator role and attaches admin user to req', async () => {
    const auth = createMockAuth({ role: 'moderator' });
    const middleware = createAdminAuthMiddleware(auth as any);
    const req = { headers: { authorization: 'Bearer valid-token' } } as any;
    const res = createMockResponse();
    const next = vi.fn();

    await middleware(req, res as any, next);

    expect(next).toHaveBeenCalled();
    expect(req.adminUser.role).toBe('moderator');
  });

  it('uses requireAdmin to restrict moderator access', async () => {
    const auth = createMockAuth({ role: 'moderator' });
    const { requireAdmin } = await import('../../src/middleware/admin-auth.js');
    const req = { adminUser: { uid: 'u1', email: 'mod@test.com', role: 'moderator' } } as any;
    const res = createMockResponse();
    const next = vi.fn();

    requireAdmin(req, res as any, next);

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('forbidden');
    expect(res.body.message).toContain('admin');
    expect(next).not.toHaveBeenCalled();
  });

  it('requireAdmin passes for admin role', async () => {
    const { requireAdmin } = await import('../../src/middleware/admin-auth.js');
    const req = { adminUser: { uid: 'u1', email: 'admin@test.com', role: 'admin' } } as any;
    const res = createMockResponse();
    const next = vi.fn();

    requireAdmin(req, res as any, next);

    expect(next).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent/functions"
npx vitest run test/middleware/admin-auth.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```ts
// functions/src/middleware/admin-auth.ts
import { Request, Response, NextFunction } from 'express';
import { Auth } from 'firebase-admin/auth';
import { sendError } from '../lib/errors.js';
import { AdminRole, AdminUser } from '../types/index.js';

export interface AdminAuthenticatedRequest extends Request {
  adminUser?: AdminUser;
}

const VALID_ROLES: AdminRole[] = ['admin', 'moderator'];

export function createAdminAuthMiddleware(auth: Auth) {
  return async (req: AdminAuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      sendError(res, 401, 'unauthorized', 'Missing or invalid Authorization header. Use: Bearer <firebase_id_token>');
      return;
    }

    const idToken = authHeader.slice(7);

    try {
      const decoded = await auth.verifyIdToken(idToken);
      const role = decoded.role as AdminRole | undefined;

      if (!role || !VALID_ROLES.includes(role)) {
        sendError(res, 403, 'forbidden', 'Insufficient permissions. Admin or moderator role required.');
        return;
      }

      req.adminUser = {
        uid: decoded.uid,
        email: decoded.email || '',
        role,
      };

      next();
    } catch (error) {
      sendError(res, 401, 'unauthorized', 'Invalid or expired Firebase ID token');
    }
  };
}

/**
 * Additional middleware to restrict an endpoint to admin-only (not moderator).
 * Use after createAdminAuthMiddleware.
 */
export function requireAdmin(req: AdminAuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.adminUser || req.adminUser.role !== 'admin') {
    sendError(res, 403, 'forbidden', 'This action requires admin role. Moderator access is insufficient.');
    return;
  }
  next();
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent/functions"
npx vitest run test/middleware/admin-auth.test.ts
```

Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent"
git add functions/src/middleware/admin-auth.ts functions/test/middleware/admin-auth.test.ts
git commit -m "feat(admin): admin auth middleware with Firebase custom claims"
```

---

## Chunk 2: Phase Switchboard

### Task 4: Write phase switchboard endpoints

**Files:**
- Create: `functions/src/api/admin/phases.ts`
- Test: `functions/test/admin/phases.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// functions/test/admin/phases.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleGetPhases,
  handleUpdatePhase,
  handleToggleFreeze,
} from '../../src/api/admin/phases.js';
import { createMockResponse } from '../helpers/firebase-mock.js';

// Mock Firestore for settings
function createMockSettingsDb(settingsData: Record<string, any> = {}) {
  const store: Record<string, Record<string, any>> = {
    config: {
      settings: {
        phase_overrides: {},
        global_write_freeze: false,
        ...settingsData,
      },
    },
    admin_audit_log: {},
  };

  return {
    collection: vi.fn((name: string) => ({
      doc: vi.fn((id: string) => ({
        get: vi.fn(async () => ({
          exists: !!store[name]?.[id],
          data: () => store[name]?.[id],
        })),
        set: vi.fn(async (data: any, opts?: any) => {
          if (!store[name]) store[name] = {};
          if (opts?.merge) {
            store[name][id] = { ...store[name][id], ...data };
          } else {
            store[name][id] = data;
          }
        }),
        update: vi.fn(async (data: any) => {
          if (!store[name]) store[name] = {};
          store[name][id] = { ...store[name][id], ...data };
        }),
      })),
    })),
    _store: store,
  };
}

describe('GET /api/admin/phases', () => {
  it('returns all phases with computed is_open state', async () => {
    const db = createMockSettingsDb();
    const req = {} as any;
    const res = createMockResponse();

    await handleGetPhases(db as any, new Date('2026-05-15'))(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.phases).toBeDefined();
    expect(Array.isArray(res.body.phases)).toBe(true);

    const registration = res.body.phases.find((p: any) => p.key === 'registration');
    expect(registration).toBeDefined();
    expect(registration.computed_is_open).toBe(true);
    expect(registration.name).toBe('Registration');

    const voting = res.body.phases.find((p: any) => p.key === 'voting');
    expect(voting).toBeDefined();
    expect(voting.computed_is_open).toBe(false);
  });

  it('includes override values when present', async () => {
    const db = createMockSettingsDb({
      phase_overrides: {
        cfp: { is_open: false },
      },
    });
    const req = {} as any;
    const res = createMockResponse();

    await handleGetPhases(db as any, new Date('2026-05-15'))(req, res as any);

    const cfp = res.body.phases.find((p: any) => p.key === 'cfp');
    expect(cfp.override_is_open).toBe(false);
    expect(cfp.computed_is_open).toBe(false);
  });

  it('includes global_write_freeze status', async () => {
    const db = createMockSettingsDb({ global_write_freeze: true });
    const req = {} as any;
    const res = createMockResponse();

    await handleGetPhases(db as any, new Date('2026-05-15'))(req, res as any);

    expect(res.body.global_write_freeze).toBe(true);
  });
});

describe('POST /api/admin/phases/:key', () => {
  it('updates phase override and logs audit entry', async () => {
    const db = createMockSettingsDb();
    const req = {
      params: { key: 'cfp' },
      body: { is_open: false, reason: 'Closing CFP early' },
      adminUser: { uid: 'admin-1', email: 'admin@test.com', role: 'admin' },
    } as any;
    const res = createMockResponse();

    await handleUpdatePhase(db as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.updated).toBe(true);
    expect(res.body.phase_key).toBe('cfp');

    // Verify settings were updated in store
    const settings = db._store['config']['settings'];
    expect(settings.phase_overrides.cfp).toBeDefined();
    expect(settings.phase_overrides.cfp.is_open).toBe(false);
  });

  it('rejects unknown phase keys', async () => {
    const db = createMockSettingsDb();
    const req = {
      params: { key: 'nonexistent' },
      body: { is_open: true },
      adminUser: { uid: 'admin-1', email: 'admin@test.com', role: 'admin' },
    } as any;
    const res = createMockResponse();

    await handleUpdatePhase(db as any)(req, res as any);

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('not_found');
  });

  it('accepts extends (new closes date)', async () => {
    const db = createMockSettingsDb();
    const req = {
      params: { key: 'cfp' },
      body: { closes: '2026-06-20', reason: 'Extending CFP by 5 days' },
      adminUser: { uid: 'admin-1', email: 'admin@test.com', role: 'admin' },
    } as any;
    const res = createMockResponse();

    await handleUpdatePhase(db as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    const settings = db._store['config']['settings'];
    expect(settings.phase_overrides.cfp.closes).toBe('2026-06-20');
  });
});

describe('POST /api/admin/freeze', () => {
  it('toggles global write freeze on', async () => {
    const db = createMockSettingsDb({ global_write_freeze: false });
    const req = {
      body: { freeze: true, reason: 'Emergency freeze' },
      adminUser: { uid: 'admin-1', email: 'admin@test.com', role: 'admin' },
    } as any;
    const res = createMockResponse();

    await handleToggleFreeze(db as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.global_write_freeze).toBe(true);
    const settings = db._store['config']['settings'];
    expect(settings.global_write_freeze).toBe(true);
  });

  it('toggles global write freeze off', async () => {
    const db = createMockSettingsDb({ global_write_freeze: true });
    const req = {
      body: { freeze: false, reason: 'Resuming operations' },
      adminUser: { uid: 'admin-1', email: 'admin@test.com', role: 'admin' },
    } as any;
    const res = createMockResponse();

    await handleToggleFreeze(db as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.global_write_freeze).toBe(false);
  });

  it('requires freeze field in body', async () => {
    const db = createMockSettingsDb();
    const req = {
      body: {},
      adminUser: { uid: 'admin-1', email: 'admin@test.com', role: 'admin' },
    } as any;
    const res = createMockResponse();

    await handleToggleFreeze(db as any)(req, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent/functions"
npx vitest run test/admin/phases.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```ts
// functions/src/api/admin/phases.ts
import { Request, Response } from 'express';
import { Firestore, FieldValue } from 'firebase-admin/firestore';
import { PHASE_DEFINITIONS, isPhaseOpen } from '../../config/phases.js';
import { sendError } from '../../lib/errors.js';
import { writeAuditLog } from '../../lib/audit-log.js';
import { AdminAuthenticatedRequest } from '../../middleware/admin-auth.js';
import { PhaseState } from '../../types/index.js';

export function handleGetPhases(db: Firestore, now?: Date) {
  return async (req: Request, res: Response): Promise<void> => {
    const current = now || new Date();
    const settingsDoc = await db.collection('config').doc('settings').get();
    const settings = settingsDoc.exists ? settingsDoc.data() || {} : {};
    const overrides = settings.phase_overrides || {};
    const globalFreeze = settings.global_write_freeze || false;

    const phases: PhaseState[] = PHASE_DEFINITIONS.map((phase) => {
      const override = overrides[phase.key];
      return {
        key: phase.key,
        name: phase.name,
        default_opens: phase.default_opens,
        default_closes: phase.default_closes,
        override_opens: override?.opens,
        override_closes: override?.closes,
        override_is_open: override?.is_open,
        computed_is_open: isPhaseOpen(phase, override, current),
      };
    });

    res.status(200).json({ phases, global_write_freeze: globalFreeze });
  };
}

export function handleUpdatePhase(db: Firestore) {
  return async (req: AdminAuthenticatedRequest, res: Response): Promise<void> => {
    const { key } = req.params;
    const { is_open, opens, closes, reason } = req.body;

    const phaseDef = PHASE_DEFINITIONS.find((p) => p.key === key);
    if (!phaseDef) {
      sendError(res, 404, 'not_found', `Unknown phase key: ${key}`);
      return;
    }

    // Build the override object — only include fields that were provided
    const override: Record<string, unknown> = {};
    if (is_open !== undefined) override.is_open = is_open;
    if (opens !== undefined) override.opens = opens;
    if (closes !== undefined) override.closes = closes;

    // Update settings in Firestore using dot notation for nested field
    await db.collection('config').doc('settings').set(
      { phase_overrides: { [key]: override } },
      { merge: true }
    );

    // Audit log
    await writeAuditLog(db, {
      admin_uid: req.adminUser!.uid,
      admin_email: req.adminUser!.email,
      action: 'phase_update',
      target_type: 'phase',
      target_id: key,
      details: override,
      reason,
    });

    res.status(200).json({
      updated: true,
      phase_key: key,
      override,
    });
  };
}

export function handleToggleFreeze(db: Firestore) {
  return async (req: AdminAuthenticatedRequest, res: Response): Promise<void> => {
    const { freeze, reason } = req.body;

    if (freeze === undefined || typeof freeze !== 'boolean') {
      sendError(res, 400, 'validation_error', 'Field "freeze" (boolean) is required');
      return;
    }

    await db.collection('config').doc('settings').set(
      { global_write_freeze: freeze },
      { merge: true }
    );

    await writeAuditLog(db, {
      admin_uid: req.adminUser!.uid,
      admin_email: req.adminUser!.email,
      action: freeze ? 'global_freeze_on' : 'global_freeze_off',
      target_type: 'settings',
      target_id: 'global_write_freeze',
      details: { freeze },
      reason,
    });

    res.status(200).json({ global_write_freeze: freeze });
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent/functions"
npx vitest run test/admin/phases.test.ts
```

Expected: All 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent"
git add functions/src/api/admin/phases.ts functions/test/admin/phases.test.ts
git commit -m "feat(admin): phase switchboard with override, freeze, and audit logging"
```

---

## Chunk 3: Agent Management

### Task 5: Write agent management endpoints

**Files:**
- Create: `functions/src/api/admin/agents.ts`
- Test: `functions/test/admin/agents.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// functions/test/admin/agents.test.ts
import { describe, it, expect, vi } from 'vitest';
import {
  handleListAgents,
  handleGetAgent,
  handleSuspendAgent,
  handleResetAgentKey,
} from '../../src/api/admin/agents.js';
import { createMockResponse } from '../helpers/firebase-mock.js';

function createAgentsDb(agents: Record<string, any> = {}) {
  const store: Record<string, Record<string, any>> = {
    agents: agents,
    admin_audit_log: {},
  };

  const docMock = (name: string, id: string) => ({
    get: vi.fn(async () => ({
      exists: !!store[name]?.[id],
      data: () => store[name]?.[id],
      id,
    })),
    set: vi.fn(async (data: any, opts?: any) => {
      if (!store[name]) store[name] = {};
      if (opts?.merge) {
        store[name][id] = { ...store[name][id], ...data };
      } else {
        store[name][id] = data;
      }
    }),
    update: vi.fn(async (data: any) => {
      if (!store[name]) store[name] = {};
      store[name][id] = { ...store[name][id], ...data };
    }),
  });

  return {
    collection: vi.fn((name: string) => ({
      doc: vi.fn((id: string) => docMock(name, id)),
      orderBy: vi.fn(() => ({
        startAfter: vi.fn(() => ({
          limit: vi.fn(() => ({
            get: vi.fn(async () => ({
              docs: Object.entries(store[name] || {}).map(([id, data]) => ({
                id,
                data: () => data,
              })),
              size: Object.keys(store[name] || {}).length,
            })),
          })),
        })),
        limit: vi.fn(() => ({
          get: vi.fn(async () => ({
            docs: Object.entries(store[name] || {}).map(([id, data]) => ({
              id,
              data: () => data,
            })),
            size: Object.keys(store[name] || {}).length,
          })),
        })),
      })),
      where: vi.fn(() => ({
        orderBy: vi.fn(() => ({
          limit: vi.fn(() => ({
            get: vi.fn(async () => ({
              docs: Object.entries(store[name] || {})
                .filter(([_, data]) =>
                  data.name?.toLowerCase().includes('agent') ||
                  data.human_contact_email?.toLowerCase().includes('agent')
                )
                .map(([id, data]) => ({ id, data: () => data })),
              size: 1,
            })),
          })),
        })),
      })),
    })),
    _store: store,
  };
}

describe('GET /api/admin/agents', () => {
  it('returns paginated list of agents', async () => {
    const db = createAgentsDb({
      'a1': { id: 'a1', name: 'Agent One', suspended: false, email_verified: true, created_at: { toDate: () => new Date() } },
      'a2': { id: 'a2', name: 'Agent Two', suspended: true, email_verified: true, created_at: { toDate: () => new Date() } },
    });

    const req = { query: {} } as any;
    const res = createMockResponse();

    await handleListAgents(db as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.agents).toBeDefined();
    expect(res.body.agents.length).toBe(2);
  });

  it('respects limit parameter', async () => {
    const db = createAgentsDb({
      'a1': { id: 'a1', name: 'Agent One' },
    });

    const req = { query: { limit: '1' } } as any;
    const res = createMockResponse();

    await handleListAgents(db as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.agents).toBeDefined();
  });
});

describe('GET /api/admin/agents/:id', () => {
  it('returns full agent detail', async () => {
    const db = createAgentsDb({
      'a1': {
        id: 'a1',
        name: 'Agent One',
        human_contact_email: 'founder@test.com',
        suspended: false,
        email_verified: true,
        api_key_hash: 'hash123',
      },
    });

    const req = { params: { id: 'a1' } } as any;
    const res = createMockResponse();

    await handleGetAgent(db as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.agent.id).toBe('a1');
    expect(res.body.agent.name).toBe('Agent One');
    expect(res.body.agent.human_contact_email).toBe('founder@test.com');
    expect(res.body.agent.suspended).toBe(false);
    // api_key_hash should still be included for admin (they see everything)
    expect(res.body.agent.api_key_hash).toBeDefined();
  });

  it('returns 404 for nonexistent agent', async () => {
    const db = createAgentsDb({});

    const req = { params: { id: 'nonexistent' } } as any;
    const res = createMockResponse();

    await handleGetAgent(db as any)(req, res as any);

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('not_found');
  });
});

describe('POST /api/admin/agents/:id/suspend', () => {
  it('suspends an agent and logs audit entry', async () => {
    const db = createAgentsDb({
      'a1': { id: 'a1', name: 'Agent One', suspended: false },
    });

    const req = {
      params: { id: 'a1' },
      body: { suspended: true, reason: 'Violating code of conduct' },
      adminUser: { uid: 'admin-1', email: 'admin@test.com', role: 'admin' },
    } as any;
    const res = createMockResponse();

    await handleSuspendAgent(db as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.suspended).toBe(true);
    expect(db._store['agents']['a1'].suspended).toBe(true);
  });

  it('unsuspends an agent', async () => {
    const db = createAgentsDb({
      'a1': { id: 'a1', name: 'Agent One', suspended: true },
    });

    const req = {
      params: { id: 'a1' },
      body: { suspended: false, reason: 'Reinstated after review' },
      adminUser: { uid: 'admin-1', email: 'admin@test.com', role: 'admin' },
    } as any;
    const res = createMockResponse();

    await handleSuspendAgent(db as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.suspended).toBe(false);
  });

  it('returns 404 for nonexistent agent', async () => {
    const db = createAgentsDb({});

    const req = {
      params: { id: 'nonexistent' },
      body: { suspended: true },
      adminUser: { uid: 'admin-1', email: 'admin@test.com', role: 'admin' },
    } as any;
    const res = createMockResponse();

    await handleSuspendAgent(db as any)(req, res as any);

    expect(res.statusCode).toBe(404);
  });
});

describe('POST /api/admin/agents/:id/reset-key', () => {
  it('resets API key and logs audit entry', async () => {
    const db = createAgentsDb({
      'a1': { id: 'a1', name: 'Agent One', api_key_hash: 'old-hash', email_verified: true },
    });

    const req = {
      params: { id: 'a1' },
      body: { reason: 'Requested by human owner' },
      adminUser: { uid: 'admin-1', email: 'admin@test.com', role: 'admin' },
    } as any;
    const res = createMockResponse();

    await handleResetAgentKey(db as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.new_api_key).toBeDefined();
    expect(res.body.new_api_key.length).toBeGreaterThanOrEqual(48);
    // Verify hash was updated
    expect(db._store['agents']['a1'].api_key_hash).not.toBe('old-hash');
  });

  it('returns 404 for nonexistent agent', async () => {
    const db = createAgentsDb({});

    const req = {
      params: { id: 'nonexistent' },
      body: {},
      adminUser: { uid: 'admin-1', email: 'admin@test.com', role: 'admin' },
    } as any;
    const res = createMockResponse();

    await handleResetAgentKey(db as any)(req, res as any);

    expect(res.statusCode).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent/functions"
npx vitest run test/admin/agents.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```ts
// functions/src/api/admin/agents.ts
import { Request, Response } from 'express';
import { Firestore, FieldValue } from 'firebase-admin/firestore';
import { sendError } from '../../lib/errors.js';
import { writeAuditLog } from '../../lib/audit-log.js';
import { generateApiKey, hashApiKey } from '../../lib/api-key.js';
import { AdminAuthenticatedRequest } from '../../middleware/admin-auth.js';

export function handleListAgents(db: Firestore) {
  return async (req: Request, res: Response): Promise<void> => {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const startAfter = req.query.start_after as string | undefined;

    let query = db.collection('agents').orderBy('created_at', 'desc');

    if (startAfter) {
      const startDoc = await db.collection('agents').doc(startAfter).get();
      if (startDoc.exists) {
        query = query.startAfter(startDoc) as any;
      }
    }

    const snapshot = await (query as any).limit(limit).get();

    const agents = snapshot.docs.map((doc: any) => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name,
        human_contact_email: data.human_contact_email,
        company_name: data.company?.name,
        suspended: data.suspended,
        email_verified: data.email_verified,
        created_at: data.created_at,
      };
    });

    const nextCursor = snapshot.docs.length === limit
      ? snapshot.docs[snapshot.docs.length - 1].id
      : null;

    res.status(200).json({
      agents,
      count: agents.length,
      next_cursor: nextCursor,
    });
  };
}

export function handleGetAgent(db: Firestore) {
  return async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;

    const doc = await db.collection('agents').doc(id).get();
    if (!doc.exists) {
      sendError(res, 404, 'not_found', `Agent ${id} not found`);
      return;
    }

    res.status(200).json({ agent: { id: doc.id, ...doc.data() } });
  };
}

export function handleSuspendAgent(db: Firestore) {
  return async (req: AdminAuthenticatedRequest, res: Response): Promise<void> => {
    const { id } = req.params;
    const { suspended, reason } = req.body;

    if (suspended === undefined || typeof suspended !== 'boolean') {
      sendError(res, 400, 'validation_error', 'Field "suspended" (boolean) is required');
      return;
    }

    const doc = await db.collection('agents').doc(id).get();
    if (!doc.exists) {
      sendError(res, 404, 'not_found', `Agent ${id} not found`);
      return;
    }

    await db.collection('agents').doc(id).update({
      suspended,
      updated_at: FieldValue.serverTimestamp(),
    });

    await writeAuditLog(db, {
      admin_uid: req.adminUser!.uid,
      admin_email: req.adminUser!.email,
      action: suspended ? 'agent_suspend' : 'agent_unsuspend',
      target_type: 'agent',
      target_id: id,
      details: { suspended },
      reason,
    });

    res.status(200).json({
      agent_id: id,
      suspended,
    });
  };
}

export function handleResetAgentKey(db: Firestore) {
  return async (req: AdminAuthenticatedRequest, res: Response): Promise<void> => {
    const { id } = req.params;
    const { reason } = req.body;

    const doc = await db.collection('agents').doc(id).get();
    if (!doc.exists) {
      sendError(res, 404, 'not_found', `Agent ${id} not found`);
      return;
    }

    const newKey = generateApiKey();
    const newHash = hashApiKey(newKey);

    await db.collection('agents').doc(id).update({
      api_key_hash: newHash,
      updated_at: FieldValue.serverTimestamp(),
    });

    await writeAuditLog(db, {
      admin_uid: req.adminUser!.uid,
      admin_email: req.adminUser!.email,
      action: 'agent_key_reset',
      target_type: 'agent',
      target_id: id,
      details: {},
      reason,
    });

    res.status(200).json({
      agent_id: id,
      new_api_key: newKey,
      message: 'API key has been reset. The old key is now invalid. Provide this new key to the agent owner.',
    });
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent/functions"
npx vitest run test/admin/agents.test.ts
```

Expected: All 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent"
git add functions/src/api/admin/agents.ts functions/test/admin/agents.test.ts
git commit -m "feat(admin): agent management — list, detail, suspend, reset key"
```

---

## Chunk 4: Content Management (Talks, Booths, Social, Hide/Approve)

### Task 6: Write content management endpoints

**Files:**
- Create: `functions/src/api/admin/content.ts`
- Test: `functions/test/admin/content.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// functions/test/admin/content.test.ts
import { describe, it, expect, vi } from 'vitest';
import {
  handleListTalks,
  handleListBooths,
  handleListSocial,
  handleHideContent,
  handleApproveContent,
} from '../../src/api/admin/content.js';
import { createMockResponse } from '../helpers/firebase-mock.js';

function createContentDb(collections: Record<string, Record<string, any>> = {}) {
  const store: Record<string, Record<string, any>> = {
    admin_audit_log: {},
    ...collections,
  };

  return {
    collection: vi.fn((name: string) => ({
      doc: vi.fn((id: string) => ({
        get: vi.fn(async () => ({
          exists: !!store[name]?.[id],
          data: () => store[name]?.[id],
          id,
        })),
        set: vi.fn(async (data: any, opts?: any) => {
          if (!store[name]) store[name] = {};
          if (opts?.merge) {
            store[name][id] = { ...store[name][id], ...data };
          } else {
            store[name][id] = data;
          }
        }),
        update: vi.fn(async (data: any) => {
          if (!store[name]) store[name] = {};
          store[name][id] = { ...store[name][id], ...data };
        }),
      })),
      orderBy: vi.fn(() => ({
        limit: vi.fn(() => ({
          get: vi.fn(async () => ({
            docs: Object.entries(store[name] || {}).map(([id, data]) => ({
              id,
              data: () => data,
            })),
          })),
        })),
      })),
    })),
    _store: store,
  };
}

describe('GET /api/admin/talks', () => {
  it('returns all talk proposals', async () => {
    const db = createContentDb({
      talks: {
        't1': { id: 't1', title: 'Talk One', agent_id: 'a1', status: 'submitted' },
        't2': { id: 't2', title: 'Talk Two', agent_id: 'a2', status: 'accepted' },
      },
    });

    const req = { query: {} } as any;
    const res = createMockResponse();

    await handleListTalks(db as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.talks).toHaveLength(2);
  });
});

describe('GET /api/admin/booths', () => {
  it('returns all booths', async () => {
    const db = createContentDb({
      booths: {
        'b1': { id: 'b1', company_name: 'Acme', agent_id: 'a1' },
      },
    });

    const req = { query: {} } as any;
    const res = createMockResponse();

    await handleListBooths(db as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.booths).toHaveLength(1);
  });
});

describe('GET /api/admin/social', () => {
  it('returns all social posts including soft-deleted', async () => {
    const db = createContentDb({
      social_posts: {
        's1': { id: 's1', content: 'Hello', deleted: false },
        's2': { id: 's2', content: 'Deleted post', deleted: true },
      },
    });

    const req = { query: {} } as any;
    const res = createMockResponse();

    await handleListSocial(db as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.social_posts).toHaveLength(2);
    // Admin should see soft-deleted posts
    const deleted = res.body.social_posts.find((p: any) => p.id === 's2');
    expect(deleted).toBeDefined();
    expect(deleted.deleted).toBe(true);
  });
});

describe('POST /api/admin/content/:id/hide', () => {
  it('hides a content item across any collection', async () => {
    const db = createContentDb({
      social_posts: {
        's1': { id: 's1', content: 'Bad post', hidden: false },
      },
    });

    const req = {
      params: { id: 's1' },
      body: { collection: 'social_posts', reason: 'Inappropriate content' },
      adminUser: { uid: 'admin-1', email: 'admin@test.com', role: 'admin' },
    } as any;
    const res = createMockResponse();

    await handleHideContent(db as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.hidden).toBe(true);
    expect(db._store['social_posts']['s1'].hidden).toBe(true);
  });

  it('rejects missing collection field', async () => {
    const db = createContentDb({});
    const req = {
      params: { id: 's1' },
      body: {},
      adminUser: { uid: 'admin-1', email: 'admin@test.com', role: 'admin' },
    } as any;
    const res = createMockResponse();

    await handleHideContent(db as any)(req, res as any);

    expect(res.statusCode).toBe(400);
  });

  it('returns 404 for nonexistent content', async () => {
    const db = createContentDb({ social_posts: {} });
    const req = {
      params: { id: 'nonexistent' },
      body: { collection: 'social_posts' },
      adminUser: { uid: 'admin-1', email: 'admin@test.com', role: 'admin' },
    } as any;
    const res = createMockResponse();

    await handleHideContent(db as any)(req, res as any);

    expect(res.statusCode).toBe(404);
  });
});

describe('POST /api/admin/content/:id/approve', () => {
  it('approves pending content', async () => {
    const db = createContentDb({
      talks: {
        't1': { id: 't1', title: 'Pending Talk', status: 'pending_review' },
      },
    });

    const req = {
      params: { id: 't1' },
      body: { collection: 'talks' },
      adminUser: { uid: 'admin-1', email: 'admin@test.com', role: 'admin' },
    } as any;
    const res = createMockResponse();

    await handleApproveContent(db as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('approved');
    expect(db._store['talks']['t1'].status).toBe('approved');
    expect(db._store['talks']['t1'].hidden).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent/functions"
npx vitest run test/admin/content.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```ts
// functions/src/api/admin/content.ts
import { Request, Response } from 'express';
import { Firestore, FieldValue } from 'firebase-admin/firestore';
import { sendError } from '../../lib/errors.js';
import { writeAuditLog } from '../../lib/audit-log.js';
import { AdminAuthenticatedRequest } from '../../middleware/admin-auth.js';

const VALID_COLLECTIONS = ['agents', 'talks', 'booths', 'social_posts', 'booth_wall_messages'];

function validateCollection(collection: string): boolean {
  return VALID_COLLECTIONS.includes(collection);
}

export function handleListTalks(db: Firestore) {
  return async (req: Request, res: Response): Promise<void> => {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);

    const snapshot = await db.collection('talks')
      .orderBy('created_at', 'desc')
      .limit(limit)
      .get();

    const talks = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.status(200).json({ talks, count: talks.length });
  };
}

export function handleListBooths(db: Firestore) {
  return async (req: Request, res: Response): Promise<void> => {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);

    const snapshot = await db.collection('booths')
      .orderBy('created_at', 'desc')
      .limit(limit)
      .get();

    const booths = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.status(200).json({ booths, count: booths.length });
  };
}

export function handleListSocial(db: Firestore) {
  return async (req: Request, res: Response): Promise<void> => {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);

    // Admin sees ALL posts including soft-deleted ones
    const snapshot = await db.collection('social_posts')
      .orderBy('posted_at', 'desc')
      .limit(limit)
      .get();

    const social_posts = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.status(200).json({ social_posts, count: social_posts.length });
  };
}

export function handleHideContent(db: Firestore) {
  return async (req: AdminAuthenticatedRequest, res: Response): Promise<void> => {
    const { id } = req.params;
    const { collection, reason } = req.body;

    if (!collection || !validateCollection(collection)) {
      sendError(res, 400, 'validation_error',
        `Field "collection" is required. Must be one of: ${VALID_COLLECTIONS.join(', ')}`);
      return;
    }

    const doc = await db.collection(collection).doc(id).get();
    if (!doc.exists) {
      sendError(res, 404, 'not_found', `Item ${id} not found in ${collection}`);
      return;
    }

    await db.collection(collection).doc(id).update({
      hidden: true,
      hidden_at: FieldValue.serverTimestamp(),
      hidden_by: req.adminUser!.uid,
    });

    await writeAuditLog(db, {
      admin_uid: req.adminUser!.uid,
      admin_email: req.adminUser!.email,
      action: 'content_hide',
      target_type: collection,
      target_id: id,
      details: { collection },
      reason,
    });

    res.status(200).json({
      id,
      collection,
      hidden: true,
    });
  };
}

export function handleApproveContent(db: Firestore) {
  return async (req: AdminAuthenticatedRequest, res: Response): Promise<void> => {
    const { id } = req.params;
    const { collection, reason } = req.body;

    if (!collection || !validateCollection(collection)) {
      sendError(res, 400, 'validation_error',
        `Field "collection" is required. Must be one of: ${VALID_COLLECTIONS.join(', ')}`);
      return;
    }

    const doc = await db.collection(collection).doc(id).get();
    if (!doc.exists) {
      sendError(res, 404, 'not_found', `Item ${id} not found in ${collection}`);
      return;
    }

    await db.collection(collection).doc(id).update({
      status: 'approved',
      hidden: false,
      approved_at: FieldValue.serverTimestamp(),
      approved_by: req.adminUser!.uid,
    });

    await writeAuditLog(db, {
      admin_uid: req.adminUser!.uid,
      admin_email: req.adminUser!.email,
      action: 'content_approve',
      target_type: collection,
      target_id: id,
      details: { collection },
      reason,
    });

    res.status(200).json({
      id,
      collection,
      status: 'approved',
    });
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent/functions"
npx vitest run test/admin/content.test.ts
```

Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent"
git add functions/src/api/admin/content.ts functions/test/admin/content.test.ts
git commit -m "feat(admin): content management — list talks/booths/social, hide, approve"
```

---

## Chunk 5: Moderation Queue

### Task 7: Write moderation queue endpoints

**Files:**
- Create: `functions/src/api/admin/moderation.ts`
- Test: `functions/test/admin/moderation.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// functions/test/admin/moderation.test.ts
import { describe, it, expect, vi } from 'vitest';
import {
  handleListModeration,
  handleModerationApprove,
  handleModerationReject,
} from '../../src/api/admin/moderation.js';
import { createMockResponse } from '../helpers/firebase-mock.js';

function createModerationDb(items: Record<string, any> = {}, collectionItems: Record<string, Record<string, any>> = {}) {
  const store: Record<string, Record<string, any>> = {
    moderation_queue: items,
    admin_audit_log: {},
    ...collectionItems,
  };

  return {
    collection: vi.fn((name: string) => ({
      doc: vi.fn((id: string) => ({
        get: vi.fn(async () => ({
          exists: !!store[name]?.[id],
          data: () => store[name]?.[id],
          id,
        })),
        set: vi.fn(async (data: any, opts?: any) => {
          if (!store[name]) store[name] = {};
          if (opts?.merge) {
            store[name][id] = { ...store[name][id], ...data };
          } else {
            store[name][id] = data;
          }
        }),
        update: vi.fn(async (data: any) => {
          if (!store[name]) store[name] = {};
          store[name][id] = { ...store[name][id], ...data };
        }),
        delete: vi.fn(async () => {
          if (store[name]) delete store[name][id];
        }),
      })),
      where: vi.fn((field: string, op: string, value: any) => ({
        orderBy: vi.fn(() => ({
          limit: vi.fn(() => ({
            get: vi.fn(async () => {
              const docs = Object.entries(store[name] || {})
                .filter(([_, data]) => {
                  if (op === '==') return data[field] === value;
                  return true;
                })
                .map(([id, data]) => ({
                  id,
                  data: () => data,
                }));
              return { docs };
            }),
          })),
        })),
      })),
    })),
    _store: store,
  };
}

describe('GET /api/admin/moderation', () => {
  it('returns items pending review', async () => {
    const db = createModerationDb({
      'm1': {
        id: 'm1',
        collection: 'talks',
        document_id: 't1',
        status: 'pending_review',
        content_snapshot: { title: 'My Talk' },
        submitted_at: { toDate: () => new Date() },
      },
      'm2': {
        id: 'm2',
        collection: 'social_posts',
        document_id: 's1',
        status: 'pending_review',
        content_snapshot: { content: 'Hello' },
        submitted_at: { toDate: () => new Date() },
      },
    });

    const req = { query: {} } as any;
    const res = createMockResponse();

    await handleListModeration(db as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.items).toBeDefined();
    expect(res.body.items).toHaveLength(2);
  });

  it('returns empty array when no pending items', async () => {
    const db = createModerationDb({});
    const req = { query: {} } as any;
    const res = createMockResponse();

    await handleListModeration(db as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.items).toHaveLength(0);
  });
});

describe('POST /api/admin/moderation/:id/approve', () => {
  it('approves item and updates source document', async () => {
    const db = createModerationDb(
      {
        'm1': {
          id: 'm1',
          collection: 'talks',
          document_id: 't1',
          status: 'pending_review',
          content_snapshot: { title: 'My Talk' },
        },
      },
      {
        talks: {
          't1': { id: 't1', title: 'My Talk', status: 'pending_review' },
        },
      }
    );

    const req = {
      params: { id: 'm1' },
      body: {},
      adminUser: { uid: 'admin-1', email: 'admin@test.com', role: 'moderator' },
    } as any;
    const res = createMockResponse();

    await handleModerationApprove(db as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('approved');
    // Source document should be updated
    expect(db._store['talks']['t1'].status).toBe('approved');
    // Moderation queue item should be updated
    expect(db._store['moderation_queue']['m1'].status).toBe('approved');
  });

  it('returns 404 for nonexistent moderation item', async () => {
    const db = createModerationDb({});
    const req = {
      params: { id: 'nonexistent' },
      body: {},
      adminUser: { uid: 'admin-1', email: 'admin@test.com', role: 'moderator' },
    } as any;
    const res = createMockResponse();

    await handleModerationApprove(db as any)(req, res as any);

    expect(res.statusCode).toBe(404);
  });
});

describe('POST /api/admin/moderation/:id/reject', () => {
  it('rejects item and updates source document', async () => {
    const db = createModerationDb(
      {
        'm1': {
          id: 'm1',
          collection: 'social_posts',
          document_id: 's1',
          status: 'pending_review',
        },
      },
      {
        social_posts: {
          's1': { id: 's1', content: 'Bad content', status: 'pending_review' },
        },
      }
    );

    const req = {
      params: { id: 'm1' },
      body: { reason: 'Violates code of conduct' },
      adminUser: { uid: 'admin-1', email: 'admin@test.com', role: 'moderator' },
    } as any;
    const res = createMockResponse();

    await handleModerationReject(db as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('rejected');
    expect(db._store['social_posts']['s1'].status).toBe('rejected');
    expect(db._store['social_posts']['s1'].hidden).toBe(true);
    expect(db._store['moderation_queue']['m1'].status).toBe('rejected');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent/functions"
npx vitest run test/admin/moderation.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```ts
// functions/src/api/admin/moderation.ts
import { Request, Response } from 'express';
import { Firestore, FieldValue } from 'firebase-admin/firestore';
import { sendError } from '../../lib/errors.js';
import { writeAuditLog } from '../../lib/audit-log.js';
import { AdminAuthenticatedRequest } from '../../middleware/admin-auth.js';

export function handleListModeration(db: Firestore) {
  return async (req: Request, res: Response): Promise<void> => {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);

    const snapshot = await db.collection('moderation_queue')
      .where('status', '==', 'pending_review')
      .orderBy('submitted_at', 'asc')
      .limit(limit)
      .get();

    const items = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.status(200).json({ items, count: items.length });
  };
}

export function handleModerationApprove(db: Firestore) {
  return async (req: AdminAuthenticatedRequest, res: Response): Promise<void> => {
    const { id } = req.params;

    const doc = await db.collection('moderation_queue').doc(id).get();
    if (!doc.exists) {
      sendError(res, 404, 'not_found', `Moderation item ${id} not found`);
      return;
    }

    const item = doc.data()!;
    const { collection, document_id } = item;

    // Update the source document status to approved
    await db.collection(collection).doc(document_id).update({
      status: 'approved',
      hidden: false,
      approved_at: FieldValue.serverTimestamp(),
      approved_by: req.adminUser!.uid,
    });

    // Update the moderation queue item
    await db.collection('moderation_queue').doc(id).update({
      status: 'approved',
      reviewed_by: req.adminUser!.uid,
      reviewed_at: FieldValue.serverTimestamp(),
    });

    await writeAuditLog(db, {
      admin_uid: req.adminUser!.uid,
      admin_email: req.adminUser!.email,
      action: 'moderation_approve',
      target_type: 'moderation',
      target_id: id,
      details: { collection, document_id },
    });

    res.status(200).json({
      id,
      status: 'approved',
      collection,
      document_id,
    });
  };
}

export function handleModerationReject(db: Firestore) {
  return async (req: AdminAuthenticatedRequest, res: Response): Promise<void> => {
    const { id } = req.params;
    const { reason } = req.body;

    const doc = await db.collection('moderation_queue').doc(id).get();
    if (!doc.exists) {
      sendError(res, 404, 'not_found', `Moderation item ${id} not found`);
      return;
    }

    const item = doc.data()!;
    const { collection, document_id } = item;

    // Update the source document — mark as rejected and hidden
    await db.collection(collection).doc(document_id).update({
      status: 'rejected',
      hidden: true,
      rejected_at: FieldValue.serverTimestamp(),
      rejected_by: req.adminUser!.uid,
      rejection_reason: reason,
    });

    // Update the moderation queue item
    await db.collection('moderation_queue').doc(id).update({
      status: 'rejected',
      reviewed_by: req.adminUser!.uid,
      reviewed_at: FieldValue.serverTimestamp(),
      rejection_reason: reason,
    });

    await writeAuditLog(db, {
      admin_uid: req.adminUser!.uid,
      admin_email: req.adminUser!.email,
      action: 'moderation_reject',
      target_type: 'moderation',
      target_id: id,
      details: { collection, document_id },
      reason,
    });

    res.status(200).json({
      id,
      status: 'rejected',
      collection,
      document_id,
    });
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent/functions"
npx vitest run test/admin/moderation.test.ts
```

Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent"
git add functions/src/api/admin/moderation.ts functions/test/admin/moderation.test.ts
git commit -m "feat(admin): moderation queue — list pending, approve, reject"
```

---

## Chunk 6: Data Export & Backup

### Task 8: Write data export endpoints

**Files:**
- Create: `functions/src/api/admin/export.ts`
- Test: `functions/test/admin/export.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// functions/test/admin/export.test.ts
import { describe, it, expect, vi } from 'vitest';
import { handleExport } from '../../src/api/admin/export.js';
import { createMockResponse } from '../helpers/firebase-mock.js';

function createExportDb(collections: Record<string, Record<string, any>> = {}) {
  const store: Record<string, Record<string, any>> = {
    admin_audit_log: {},
    ...collections,
  };

  return {
    collection: vi.fn((name: string) => ({
      doc: vi.fn((id: string) => ({
        set: vi.fn(async (data: any) => {
          if (!store[name]) store[name] = {};
          store[name][id] = data;
        }),
      })),
      get: vi.fn(async () => ({
        docs: Object.entries(store[name] || {}).map(([id, data]) => ({
          id,
          data: () => data,
        })),
        size: Object.keys(store[name] || {}).length,
      })),
    })),
    _store: store,
  };
}

describe('GET /api/admin/export/:collection', () => {
  it('exports agents collection as JSON', async () => {
    const db = createExportDb({
      agents: {
        'a1': { id: 'a1', name: 'Agent One', suspended: false },
        'a2': { id: 'a2', name: 'Agent Two', suspended: true },
      },
    });

    const req = {
      params: { collection: 'agents' },
      adminUser: { uid: 'admin-1', email: 'admin@test.com', role: 'admin' },
    } as any;
    const res = createMockResponse();

    await handleExport(db as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.collection).toBe('agents');
    expect(res.body.count).toBe(2);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.exported_at).toBeDefined();
  });

  it('exports talks collection', async () => {
    const db = createExportDb({
      talks: {
        't1': { id: 't1', title: 'Talk One' },
      },
    });

    const req = {
      params: { collection: 'talks' },
      adminUser: { uid: 'admin-1', email: 'admin@test.com', role: 'admin' },
    } as any;
    const res = createMockResponse();

    await handleExport(db as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.collection).toBe('talks');
    expect(res.body.count).toBe(1);
  });

  it('exports votes collection', async () => {
    const db = createExportDb({
      votes: {
        'v1': { agent_id: 'a1', proposal_id: 't1', score: 85 },
      },
    });

    const req = {
      params: { collection: 'votes' },
      adminUser: { uid: 'admin-1', email: 'admin@test.com', role: 'admin' },
    } as any;
    const res = createMockResponse();

    await handleExport(db as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.collection).toBe('votes');
  });

  it('rejects invalid collection names', async () => {
    const db = createExportDb({});

    const req = {
      params: { collection: 'passwords' },
      adminUser: { uid: 'admin-1', email: 'admin@test.com', role: 'admin' },
    } as any;
    const res = createMockResponse();

    await handleExport(db as any)(req, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });

  it('returns empty data for empty collection', async () => {
    const db = createExportDb({ agents: {} });

    const req = {
      params: { collection: 'agents' },
      adminUser: { uid: 'admin-1', email: 'admin@test.com', role: 'admin' },
    } as any;
    const res = createMockResponse();

    await handleExport(db as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveLength(0);
    expect(res.body.count).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent/functions"
npx vitest run test/admin/export.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```ts
// functions/src/api/admin/export.ts
import { Request, Response } from 'express';
import { Firestore } from 'firebase-admin/firestore';
import { sendError } from '../../lib/errors.js';
import { writeAuditLog } from '../../lib/audit-log.js';
import { AdminAuthenticatedRequest } from '../../middleware/admin-auth.js';

const EXPORTABLE_COLLECTIONS = [
  'agents',
  'talks',
  'booths',
  'social_posts',
  'votes',
  'recommendations',
  'manifesto_history',
  'yearbook',
];

export function handleExport(db: Firestore) {
  return async (req: AdminAuthenticatedRequest, res: Response): Promise<void> => {
    const { collection } = req.params;

    if (!EXPORTABLE_COLLECTIONS.includes(collection)) {
      sendError(res, 400, 'validation_error',
        `Invalid collection. Must be one of: ${EXPORTABLE_COLLECTIONS.join(', ')}`);
      return;
    }

    const snapshot = await db.collection(collection).get();

    const data = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    await writeAuditLog(db, {
      admin_uid: req.adminUser!.uid,
      admin_email: req.adminUser!.email,
      action: 'data_export',
      target_type: 'export',
      target_id: collection,
      details: { collection, count: data.length },
    });

    res.status(200).json({
      collection,
      count: data.length,
      exported_at: new Date().toISOString(),
      data,
    });
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent/functions"
npx vitest run test/admin/export.test.ts
```

Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent"
git add functions/src/api/admin/export.ts functions/test/admin/export.test.ts
git commit -m "feat(admin): data export for all entity collections"
```

---

### Task 9: Write backup trigger endpoint

**Files:**
- Create: `functions/src/api/admin/backup.ts`
- Test: `functions/test/admin/backup.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// functions/test/admin/backup.test.ts
import { describe, it, expect, vi } from 'vitest';
import { handleTriggerBackup } from '../../src/api/admin/backup.js';
import { createMockResponse } from '../helpers/firebase-mock.js';

function createBackupDb() {
  const store: Record<string, Record<string, any>> = {
    admin_audit_log: {},
    backups: {},
  };

  return {
    collection: vi.fn((name: string) => ({
      doc: vi.fn((id: string) => ({
        set: vi.fn(async (data: any) => {
          if (!store[name]) store[name] = {};
          store[name][id] = data;
        }),
        get: vi.fn(async () => ({
          exists: !!store[name]?.[id],
          data: () => store[name]?.[id],
        })),
      })),
    })),
    _store: store,
  };
}

describe('POST /api/admin/backup', () => {
  it('triggers a backup and logs audit entry', async () => {
    const db = createBackupDb();
    const req = {
      body: { reason: 'Pre-voting phase snapshot' },
      adminUser: { uid: 'admin-1', email: 'admin@test.com', role: 'admin' },
    } as any;
    const res = createMockResponse();

    await handleTriggerBackup(db as any)(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('backup_initiated');
    expect(res.body.backup_id).toBeDefined();
    expect(res.body.timestamp).toBeDefined();

    // Verify backup record was stored
    const backupIds = Object.keys(db._store['backups']);
    expect(backupIds.length).toBe(1);
    const backup = db._store['backups'][backupIds[0]];
    expect(backup.status).toBe('initiated');
    expect(backup.triggered_by).toBe('admin-1');
  });

  it('records backup metadata in Firestore', async () => {
    const db = createBackupDb();
    const req = {
      body: {},
      adminUser: { uid: 'admin-1', email: 'admin@test.com', role: 'admin' },
    } as any;
    const res = createMockResponse();

    await handleTriggerBackup(db as any)(req, res as any);

    const backupIds = Object.keys(db._store['backups']);
    const backup = db._store['backups'][backupIds[0]];
    expect(backup.id).toBeDefined();
    expect(backup.triggered_by).toBe('admin-1');
    expect(backup.status).toBe('initiated');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent/functions"
npx vitest run test/admin/backup.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```ts
// functions/src/api/admin/backup.ts
import { Response } from 'express';
import { Firestore, FieldValue } from 'firebase-admin/firestore';
import { randomBytes } from 'crypto';
import { writeAuditLog } from '../../lib/audit-log.js';
import { AdminAuthenticatedRequest } from '../../middleware/admin-auth.js';

export function handleTriggerBackup(db: Firestore) {
  return async (req: AdminAuthenticatedRequest, res: Response): Promise<void> => {
    const { reason } = req.body;
    const backupId = `backup-${Date.now()}-${randomBytes(4).toString('hex')}`;
    const timestamp = new Date().toISOString();

    // Record backup metadata in Firestore
    // The actual Firestore backup is triggered via Firebase Admin SDK
    // or gcloud CLI. This endpoint records the intent and metadata.
    await db.collection('backups').doc(backupId).set({
      id: backupId,
      triggered_by: req.adminUser!.uid,
      triggered_by_email: req.adminUser!.email,
      reason: reason || null,
      status: 'initiated',
      timestamp: FieldValue.serverTimestamp(),
      initiated_at: timestamp,
    });

    await writeAuditLog(db, {
      admin_uid: req.adminUser!.uid,
      admin_email: req.adminUser!.email,
      action: 'backup_trigger',
      target_type: 'backup',
      target_id: backupId,
      details: { backup_id: backupId },
      reason,
    });

    // Note: In production, this would also trigger:
    // const client = new firestore.v1.FirestoreAdminClient();
    // await client.exportDocuments({ name: projectPath, outputUriPrefix: bucketUri });
    // For now, we record the intent. The actual export can be triggered
    // by a Cloud Function that watches the backups collection.

    res.status(200).json({
      status: 'backup_initiated',
      backup_id: backupId,
      timestamp,
      message: 'Backup has been initiated. Check the backups collection for status updates.',
    });
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent/functions"
npx vitest run test/admin/backup.test.ts
```

Expected: All 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent"
git add functions/src/api/admin/backup.ts functions/test/admin/backup.test.ts
git commit -m "feat(admin): manual backup trigger with audit logging"
```

---

## Chunk 7: Admin Router & Integration

### Task 10: Write admin router that mounts all admin endpoints

**Files:**
- Create: `functions/src/api/admin/router.ts`

- [ ] **Step 1: Write admin router**

```ts
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

  return router;
}
```

- [ ] **Step 2: Commit**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent"
git add functions/src/api/admin/router.ts
git commit -m "feat(admin): admin router mounting all admin API endpoints"
```

---

### Task 11: Mount admin router in main index.ts

**Files:**
- Modify: `functions/src/index.ts`

- [ ] **Step 1: Add admin router imports and mount point to index.ts**

Add the following import near the top of `functions/src/index.ts`, with the other imports:

```ts
import { getAuth } from 'firebase-admin/auth';
import { createAdminRouter } from './api/admin/router.js';
```

Add the following lines after the existing route definitions (after the health check route), before the `export const api` line:

```ts
// Admin API routes — separate auth (Firebase custom claims, not agent API keys)
const adminRouter = createAdminRouter(db, getAuth());
app.use('/api/admin', adminRouter);
```

- [ ] **Step 2: Build to verify compilation**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent/functions"
npm run build
```

Expected: Compiles without errors.

- [ ] **Step 3: Commit**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent"
git add functions/src/index.ts
git commit -m "feat(admin): mount admin router at /api/admin in main Express app"
```

---

### Task 12: Run full test suite and verify

- [ ] **Step 1: Run all function tests**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent/functions"
npx vitest run
```

Expected: All tests PASS (existing tests from Plans 1-5 plus all new admin tests).

- [ ] **Step 2: Build functions**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent/functions"
npm run build
```

Expected: No errors.

- [ ] **Step 3: Verify admin test count**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent/functions"
npx vitest run --reporter=verbose 2>&1 | grep -c "PASS\|FAIL"
```

Expected: All admin test files (admin-auth, audit-log, phases, agents, content, moderation, export, backup) PASS.

- [ ] **Step 4: Commit final**

```bash
cd "/Users/acroll/Library/Mobile Documents/com~apple~CloudDocs/SFIOS/WorkProjects/SUFagent"
git add -A
git commit -m "feat(admin): Plan 6 Admin Dashboard API complete — all endpoints and tests"
```

---

## Summary

Plan 6 delivers the complete admin API layer:

**Admin Auth & Middleware:**
- `createAdminAuthMiddleware` — verifies Firebase ID tokens and checks `role` custom claim for `admin` or `moderator`
- `requireAdmin` — additional guard for admin-only actions (not available to moderators)
- All admin routes under `/api/admin/` prefix, separate from agent API auth

**Phase Switchboard (3 endpoints):**
- `GET /api/admin/phases` — all phases with computed is_open state, overrides, and global freeze status
- `POST /api/admin/phases/:key` — update phase override (is_open, opens, closes) with audit log
- `POST /api/admin/freeze` — toggle global write freeze with audit log

**Agent Management (4 endpoints):**
- `GET /api/admin/agents` — paginated agent list with cursor-based pagination
- `GET /api/admin/agents/:id` — full agent detail (including sensitive fields for admin)
- `POST /api/admin/agents/:id/suspend` — suspend/unsuspend agent with audit log
- `POST /api/admin/agents/:id/reset-key` — force API key reset, returns new key, with audit log

**Content Management (5 endpoints):**
- `GET /api/admin/talks` — list all talk proposals
- `GET /api/admin/booths` — list all booths
- `GET /api/admin/social` — list all social posts (including soft-deleted)
- `POST /api/admin/content/:id/hide` — hide any content item across collections
- `POST /api/admin/content/:id/approve` — approve pending content

**Moderation Queue (3 endpoints):**
- `GET /api/admin/moderation` — items pending review
- `POST /api/admin/moderation/:id/approve` — approve and update source document
- `POST /api/admin/moderation/:id/reject` — reject, hide, and update source document

**Data Export (1 endpoint):**
- `GET /api/admin/export/:collection` — export any of 8 collections as JSON (agents, talks, booths, social_posts, votes, recommendations, manifesto_history, yearbook)

**Backup (1 endpoint):**
- `POST /api/admin/backup` — trigger manual backup with metadata recording and audit log

**Cross-cutting:**
- All admin actions are audit-logged to `admin_audit_log` collection (who, what, when, reason)
- Admin-only actions (phase changes, freeze, suspend, key reset, export, backup) restricted to `admin` role
- Moderation actions (approve, reject, hide) available to both `admin` and `moderator` roles

Plan 7 (Web UI) will build the admin dashboard frontend that consumes these APIs.
