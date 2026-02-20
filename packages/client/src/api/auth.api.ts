import { api } from '@/store/api';
import { setCredentials } from '@/store/slices/auth.slice';
import type { RootState } from '@/store/store';
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

const authApi = api.injectEndpoints({
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

    // Called on app load when token exists but user is null (page reload).
    // onQueryStarted hydrates the auth slice with the fetched user data.
    getMe: builder.query<UserResponse, void>({
      query: () => '/auth/me',
      async onQueryStarted(_, { dispatch, queryFulfilled, getState }) {
        try {
          const { data } = await queryFulfilled;
          const token = (getState() as RootState).auth.token;
          if (token) {
            dispatch(
              setCredentials({
                token,
                user: { id: data.id, email: data.email, username: data.username },
              }),
            );
          }
        } catch {
          // 401 is handled globally by baseQueryWithAuth (dispatches logout()).
          // Other errors are silently ignored here — hydration just won't populate user.
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
  useGetMeQuery,
} = authApi;
