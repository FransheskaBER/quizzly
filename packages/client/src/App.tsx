import { lazy, Suspense, useEffect } from 'react';
import type { ReactNode } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

import { RootErrorBoundary, RouteErrorBoundary } from '@/components/common/ErrorBoundary';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
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

/**
 * Handles the "token in localStorage but user not yet in Redux" case on page reload.
 * Fires getMe once, populates the auth slice via onQueryStarted, then renders children.
 * While loading: shows a full-page spinner so protected routes never flash a login redirect.
 * On 401: baseQueryWithAuth dispatches logout(), token clears, routes render and redirect to /login.
 */
const AuthGate = ({ children }: { children: ReactNode }) => {
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const user = useAppSelector(selectCurrentUser);
  const dispatch = useAppDispatch();

  const needsHydration = isAuthenticated && user === null;

  const { isLoading, isError } = useGetMeQuery(undefined, { skip: !needsHydration });

  // On network failure getMe errors without clearing the token. Dispatch logout so
  // ProtectedRoute redirects to /login instead of spinning forever. (401s are already
  // handled by baseQueryWithAuth, so this only fires on non-auth network errors.)
  useEffect(() => {
    if (isError) {
      dispatch(logout());
    }
  }, [isError, dispatch]);

  if (needsHydration && isLoading) {
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
            </Route>

            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Suspense>
      </AuthGate>
    </RootErrorBoundary>
  );
};
