// src/test/ProtectedRoute.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ProtectedRoute from '../components/ProtectedRoute';

const mockUseAuth = vi.fn();
vi.mock('../context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

describe('ProtectedRoute', () => {
  it('shows loading while auth is loading', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true });
    render(
      <MemoryRouter>
        <ProtectedRoute><div>Protected Content</div></ProtectedRoute>
      </MemoryRouter>
    );
    expect(screen.getByText('Loading...')).toBeDefined();
  });

  it('renders children when user is authenticated', () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'u1' }, loading: false });
    render(
      <MemoryRouter>
        <ProtectedRoute><div>Protected Content</div></ProtectedRoute>
      </MemoryRouter>
    );
    expect(screen.getByText('Protected Content')).toBeDefined();
  });

  it('redirects to /login when not authenticated', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <ProtectedRoute><div>Protected Content</div></ProtectedRoute>
      </MemoryRouter>
    );
    expect(screen.queryByText('Protected Content')).toBeNull();
  });
});
