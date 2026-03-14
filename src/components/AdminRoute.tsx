// src/components/AdminRoute.tsx
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, isModerator } = useAuth();

  if (loading) return <div className="loading">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!isModerator) return <Navigate to="/" replace />;
  return <>{children}</>;
}
