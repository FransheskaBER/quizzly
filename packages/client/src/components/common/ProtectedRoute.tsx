import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAppSelector } from '@/store/store';
import { selectIsAuthenticated, selectCurrentUser } from '@/store/slices/auth.slice';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';

export const ProtectedRoute = () => {
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const user = useAppSelector(selectCurrentUser);
  const location = useLocation();

  // Token exists but user not yet hydrated — AuthGate handles this with a full-page
  // spinner, but guard here as a safety net to prevent an accidental redirect to login
  // before getMe completes.
  if (isAuthenticated && user === null) {
    return <LoadingSpinner fullPage />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
};
