// src/test/AuthContext.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { AuthProvider, useAuth } from '../context/AuthContext';

// Mock firebase/auth
vi.mock('firebase/auth', () => {
  return {
    getAuth: vi.fn(() => ({})),
    onAuthStateChanged: vi.fn((_, cb) => {
      cb(null);
      return vi.fn(); // unsubscribe
    }),
    signInWithEmailAndPassword: vi.fn(async () => ({ user: { uid: 'u1', email: 'test@test.com' } })),
    createUserWithEmailAndPassword: vi.fn(async () => ({ user: { uid: 'u1', email: 'test@test.com' } })),
    signInWithPopup: vi.fn(async () => ({ user: { uid: 'u1', email: 'test@test.com' } })),
    signOut: vi.fn(async () => {}),
    getIdTokenResult: vi.fn(async () => ({ claims: {} })),
    GoogleAuthProvider: vi.fn(),
  };
});

vi.mock('../config/firebase', () => ({
  auth: {},
}));

describe('useAuth', () => {
  it('starts with no user and loading false after init', async () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    });

    expect(result.current.user).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.isAdmin).toBe(false);
  });

  it('throws if used outside AuthProvider', () => {
    expect(() => {
      renderHook(() => useAuth());
    }).toThrow('useAuth must be used within AuthProvider');
  });
});
