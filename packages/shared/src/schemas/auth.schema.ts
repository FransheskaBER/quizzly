import { z } from 'zod';
import { PASSWORD_MIN_LENGTH, USERNAME_MAX_LENGTH, EMAIL_MAX_LENGTH } from '../constants/auth.constants.js';

// Request schemas

export const signupSchema = z.object({
  email: z
    .string()
    .email()
    .max(EMAIL_MAX_LENGTH)
    .transform((v) => v.toLowerCase().trim()),
  username: z.string().min(1).max(USERNAME_MAX_LENGTH).trim(),
  password: z.string().min(PASSWORD_MIN_LENGTH),
});

export const loginSchema = z.object({
  email: z
    .string()
    .email()
    .transform((v) => v.toLowerCase().trim()),
  password: z.string().min(1),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1),
});

export const resendVerificationSchema = z.object({
  email: z
    .string()
    .email()
    .transform((v) => v.toLowerCase().trim()),
});

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .email()
    .transform((v) => v.toLowerCase().trim()),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(PASSWORD_MIN_LENGTH),
});

// Response schemas

export const loginResponseSchema = z.object({
  token: z.string(),
  user: z.object({
    id: z.string().uuid(),
    email: z.string(),
    username: z.string(),
  }),
});

export const userResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  username: z.string(),
  emailVerified: z.boolean(),
  createdAt: z.string().datetime(),
});

export const messageResponseSchema = z.object({
  message: z.string(),
});
