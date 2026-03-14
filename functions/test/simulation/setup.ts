/**
 * Vitest setup for simulation tests.
 * Mocks firebase-admin modules so handlers get test-friendly
 * implementations of FieldValue, Timestamp, etc.
 */
import { vi } from 'vitest';

export const DELETE_SENTINEL = '__FIELD_DELETE__';

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: () => new Date().toISOString(),
    delete: () => DELETE_SENTINEL,
    increment: (n: number) => ({ __increment: n }),
  },
  Timestamp: {
    fromDate: (d: Date) => d.toISOString(),
    now: () => new Date().toISOString(),
  },
  getFirestore: vi.fn(),
}));

vi.mock('firebase-admin/app', () => ({
  initializeApp: vi.fn(),
  getApp: vi.fn(),
}));

vi.mock('firebase-admin/auth', () => ({
  getAuth: vi.fn(() => ({
    verifyIdToken: vi.fn(),
    setCustomUserClaims: vi.fn(),
  })),
}));
