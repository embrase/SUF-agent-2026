// src/test/useApi.test.ts
import { describe, it, expect, vi } from 'vitest';

// Mock firebase to prevent initialization errors during import
vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => ({})),
}));

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({})),
  onAuthStateChanged: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
  getIdTokenResult: vi.fn(),
  GoogleAuthProvider: vi.fn(),
}));

import { ApiError } from '../hooks/useApi';

describe('ApiError', () => {
  it('captures status, code, message, and details', () => {
    const err = new ApiError(403, 'phase_closed', 'CFP closed', { next: 'voting' });
    expect(err.status).toBe(403);
    expect(err.code).toBe('phase_closed');
    expect(err.message).toBe('CFP closed');
    expect(err.details).toEqual({ next: 'voting' });
    expect(err.name).toBe('ApiError');
    expect(err instanceof Error).toBe(true);
  });
});
