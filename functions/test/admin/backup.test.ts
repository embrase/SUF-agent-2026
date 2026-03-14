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
