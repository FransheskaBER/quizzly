import { z } from 'zod';

import { anthropicKeySchema } from './quiz.schema.js';

// Request schemas

export const saveApiKeySchema = z.object({
  apiKey: anthropicKeySchema,
});

// Response schemas

export const apiKeyStatusResponseSchema = z.object({
  hasApiKey: z.boolean(),
  hint: z.string().nullable(),
});
