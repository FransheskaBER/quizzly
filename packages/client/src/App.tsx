import { lazy, Suspense, useEffect } from 'react';
import type { ReactNode } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

import { RootErrorBoundary, RouteErrorBoundary } from '@/components/common/ErrorBoundary';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ToastContainer } from '@/components/common/ToastContainer';
import { useAppSelector, useAppDispatch } from '@/store/store';
import { selectIsAuthenticated, selectCurrentUser, logout } from '@/store/slices/auth.slice';
import { useGetMeQuery } from '@/api/auth.api';

const LandingPage = lazy(() => import('@/pages/landing/LandingPage'));
const LoginPage = lazy(() => import('@/pages/auth/LoginPage'));
const SignupPage = lazy(() => import('@/pages/auth/SignupPage'));
const VerifyEmailPage = lazy(() => import('@/pages/auth/VerifyEmailPage'));
const ForgotPasswordPage = lazy(() => import('@/pages/auth/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('@/pages/auth/ResetPasswordPage'));
const HomeDashboardPage = lazy(() => import('@/pages/dashboard/HomeDashboardPage'));
const SessionListPage = lazy(() => import('@/pages/sessions/SessionListPage'));
const CreateSessionPage = lazy(() => import('@/pages/sessions/CreateSessionPage'));
const SessionDashboardPage = lazy(() => import('@/pages/sessions/SessionDashboardPage'));
const QuizTakingPage = lazy(() => import('@/pages/quiz/QuizTakingPage'));
const QuizResultsPage = lazy(() => import('@/pages/quiz/QuizResultsPage'));
const ProfilePage = lazy(() => import('@/pages/profile/ProfilePage'));

/**
 * Discovers session on app load via getMe (cookie sent automatically with credentials: 'include').
 * While loading: shows spinner. On success: user set in Redux. On 401/error: logout, redirect to /login.
 */
const AuthGate = ({ children }: { children: ReactNode }) => {
  const dispatch = useAppDispatch();
  const { isLoading, isError } = useGetMeQuery(undefined);

  // On network failure getMe errors (non-401). Dispatch logout so ProtectedRoute redirects to /login.
  // 401s are handled by baseQueryWithAuth.
  useEffect(() => {
    if (isError) {
      dispatch(logout());
    }
  }, [isError, dispatch]);

  if (isLoading) {
    return <LoadingSpinner fullPage />;
  }

  return <>{children}</>;
};

// Wraps a page element in RouteErrorBoundary so each route's errors are caught
// within the layout rather than bubbling to the RootErrorBoundary.
const withRouteBoundary = (element: ReactNode) => (
  <RouteErrorBoundary>{element}</RouteErrorBoundary>
);

export const App = () => {
  return (
    <RootErrorBoundary>
      <AuthGate>
        <Suspense fallback={<LoadingSpinner fullPage />}>
          <Routes>
            {/* Public routes */}
            <Route path="/" element={withRouteBoundary(<LandingPage />)} />
            <Route path="/login" element={withRouteBoundary(<LoginPage />)} />
            <Route path="/signup" element={withRouteBoundary(<SignupPage />)} />
            <Route path="/verify-email" element={withRouteBoundary(<VerifyEmailPage />)} />
            <Route path="/forgot-password" element={withRouteBoundary(<ForgotPasswordPage />)} />
            <Route path="/reset-password" element={withRouteBoundary(<ResetPasswordPage />)} />

            {/* Protected routes */}
            <Route element={<ProtectedRoute />}>
              <Route path="/dashboard" element={withRouteBoundary(<HomeDashboardPage />)} />
              <Route path="/sessions" element={withRouteBoundary(<SessionListPage />)} />
              <Route path="/sessions/new" element={withRouteBoundary(<CreateSessionPage />)} />
              <Route path="/sessions/:id" element={withRouteBoundary(<SessionDashboardPage />)} />
              <Route path="/quiz/:id" element={withRouteBoundary(<QuizTakingPage />)} />
              <Route path="/quiz/:id/results" element={withRouteBoundary(<QuizResultsPage />)} />
              <Route path="/profile" element={withRouteBoundary(<ProfilePage />)} />
            </Route>

            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Suspense>
        <ToastContainer />
      </AuthGate>
    </RootErrorBoundary>
  );
};
