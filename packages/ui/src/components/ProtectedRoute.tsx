import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, tenantId, loading } = useAuth();

  if (loading) return null;

  if (!user || !tenantId) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
