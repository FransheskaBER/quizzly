import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { RootErrorBoundary } from '@/components/common/ErrorBoundary';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';

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

export const App = () => {
  return (
    <RootErrorBoundary>
      <Suspense fallback={<LoadingSpinner fullPage />}>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          {/* Protected routes */}
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<HomeDashboardPage />} />
            <Route path="/sessions" element={<SessionListPage />} />
            <Route path="/sessions/new" element={<CreateSessionPage />} />
            <Route path="/sessions/:id" element={<SessionDashboardPage />} />
            <Route path="/quiz/:id" element={<QuizTakingPage />} />
            <Route path="/quiz/:id/results" element={<QuizResultsPage />} />
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </RootErrorBoundary>
  );
};
