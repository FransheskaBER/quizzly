import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/store/store';
import { setCredentials, logout as logoutAction, selectCurrentUser, selectIsAuthenticated } from '@/store/slices/auth.slice';
import {
  useLoginMutation,
  useSignupMutation,
  useVerifyEmailMutation,
  useResendVerificationMutation,
  useForgotPasswordMutation,
  useResetPasswordMutation,
} from '@/api/auth.api';
import type { SignupRequest, LoginRequest } from '@skills-trainer/shared';

/**
 * Provides a clean auth API to page components.
 * All methods throw on failure — catch in the calling component
 * and use useApiError() to extract code/message.
 */
export const useAuth = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const user = useAppSelector(selectCurrentUser);
  const isAuthenticated = useAppSelector(selectIsAuthenticated);

  const [loginMutation] = useLoginMutation();
  const [signupMutation] = useSignupMutation();
  const [verifyEmailMutation] = useVerifyEmailMutation();
  const [resendVerificationMutation] = useResendVerificationMutation();
  const [forgotPasswordMutation] = useForgotPasswordMutation();
  const [resetPasswordMutation] = useResetPasswordMutation();

  const login = async (data: LoginRequest) => {
    const result = await loginMutation(data).unwrap();
    dispatch(setCredentials({ token: result.token, user: result.user }));
    return result.user;
  };

  const signup = async (data: SignupRequest) => {
    return await signupMutation(data).unwrap();
  };

  const logout = () => {
    dispatch(logoutAction());
    navigate('/login');
  };

  const verifyEmail = async (token: string) => {
    return await verifyEmailMutation({ token }).unwrap();
  };

  const resendVerification = async (email: string) => {
    return await resendVerificationMutation({ email }).unwrap();
  };

  const forgotPassword = async (email: string) => {
    return await forgotPasswordMutation({ email }).unwrap();
  };

  const resetPassword = async (data: { token: string; password: string }) => {
    return await resetPasswordMutation(data).unwrap();
  };

  return {
    user,
    isAuthenticated,
    login,
    signup,
    logout,
    verifyEmail,
    resendVerification,
    forgotPassword,
    resetPassword,
  };
};
