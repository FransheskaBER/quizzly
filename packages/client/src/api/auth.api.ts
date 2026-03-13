import { api } from '@/store/api';
import { setCredentials, logout } from '@/store/slices/auth.slice';
import { Sentry } from '@/config/sentry';
import { toSentryError } from '@/utils/sentry.utils';
import type {
  SignupRequest,
  LoginRequest,
  VerifyEmailRequest,
  ResendVerificationRequest,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  LoginResponse,
  UserResponse,
  MessageResponse,
} from '@skills-trainer/shared';

const HYDRATION_401_CAPTURE_INTERVAL_MS = 60_000;
let lastHydration401CaptureAt = 0;

const shouldCaptureHydration401 = (): boolean => {
  const now = Date.now();
  if (now - lastHydration401CaptureAt < HYDRATION_401_CAPTURE_INTERVAL_MS) {
    return false;
  }

  lastHydration401CaptureAt = now;
  return true;
};

export const authApi = api.injectEndpoints({
  endpoints: (builder) => ({
    signup: builder.mutation<MessageResponse, SignupRequest>({
      query: (body) => ({ url: '/auth/signup', method: 'POST', body }),
    }),

    login: builder.mutation<LoginResponse, LoginRequest>({
      query: (body) => ({ url: '/auth/login', method: 'POST', body }),
    }),

    verifyEmail: builder.mutation<MessageResponse, VerifyEmailRequest>({
      query: (body) => ({ url: '/auth/verify-email', method: 'POST', body }),
    }),

    resendVerification: builder.mutation<MessageResponse, ResendVerificationRequest>({
      query: (body) => ({ url: '/auth/resend-verification', method: 'POST', body }),
    }),

    forgotPassword: builder.mutation<MessageResponse, ForgotPasswordRequest>({
      query: (body) => ({ url: '/auth/forgot-password', method: 'POST', body }),
    }),

    resetPassword: builder.mutation<MessageResponse, ResetPasswordRequest>({
      query: (body) => ({ url: '/auth/reset-password', method: 'POST', body }),
    }),

    logout: builder.mutation<{ message: string }, void>({
      query: () => ({ url: '/auth/logout', method: 'POST' }),
      async onQueryStarted(_, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
        } finally {
          dispatch(logout());
        }
      },
    }),

    // Called on app load to discover session (cookie-based; cannot check session without requesting).
    // onQueryStarted hydrates the auth slice with the fetched user data.
    getMe: builder.query<UserResponse, void>({
      query: () => '/auth/me',
      async onQueryStarted(_, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(
            setCredentials({
              user: { id: data.id, email: data.email, username: data.username },
            }),
          );
        } catch (err) {
          const status = (err as { error?: { status?: number | string } })?.error?.status;

          // Network failure (backend unreachable) — not actionable in Sentry.
          // In production Render deploys both services; in dev the console
          // already surfaces the connectivity error.
          if (status === 'FETCH_ERROR') return;

          // 401 is handled globally by baseQueryWithAuth (dispatches logout()).
          if (status === 401) {
            if (shouldCaptureHydration401()) {
              // eslint-disable-next-line no-console
              console.error('getMe hydration unauthorized:', err);
              Sentry.captureException(toSentryError(err, 'getMe hydration unauthorized (401)'), {
                extra: {
                  operation: 'getMeHydration',
                  route: '/auth/me',
                  reason: 'unauthorized',
                  status: 401,
                  telemetryMode: 'rate-limited',
                  originalError: err,
                },
              });
            }
            return;
          }

          // eslint-disable-next-line no-console
          console.error('getMe hydration failed:', err);
          Sentry.captureException(
            toSentryError(err, `getMe hydration failed (status: ${status ?? 'unknown'})`),
            {
              extra: {
                operation: 'getMeHydration',
                route: '/auth/me',
                reason: 'non-401',
                status: status ?? null,
                originalError: err,
              },
            },
          );
        }
      },
    }),
  }),
});

export const {
  useSignupMutation,
  useLoginMutation,
  useVerifyEmailMutation,
  useResendVerificationMutation,
  useForgotPasswordMutation,
  useResetPasswordMutation,
  useLogoutMutation,
  useGetMeQuery,
} = authApi;
