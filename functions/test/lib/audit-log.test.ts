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
