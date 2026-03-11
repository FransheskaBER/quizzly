import { z } from 'zod';

import { PASSWORD_MIN_LENGTH, USERNAME_MAX_LENGTH } from '../constants/auth.constants.js';
import { anthropicKeySchema } from './quiz.schema.js';

// Request schemas

export const saveApiKeySchema = z.object({
  apiKey: anthropicKeySchema,
});

export const updateProfileSchema = z.object({
  username: z.string().min(1).max(USERNAME_MAX_LENGTH).trim(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(PASSWORD_MIN_LENGTH),
});

// Response schemas

export const apiKeyStatusResponseSchema = z.object({
  hasApiKey: z.boolean(),
  hint: z.string().nullable(),
});
