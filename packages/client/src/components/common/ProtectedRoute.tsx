import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAppSelector } from '@/store/store';
import { selectIsAuthenticated } from '@/store/slices/auth.slice';

export const ProtectedRoute = () => {
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
};
