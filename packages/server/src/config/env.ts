import { z } from 'zod';

const isTest = process.env.NODE_ENV === 'test';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  CLIENT_URL: z.string().url(),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('7d'),
  AWS_ACCESS_KEY_ID: isTest ? z.string().optional() : z.string().min(1),
  AWS_SECRET_ACCESS_KEY: isTest ? z.string().optional() : z.string().min(1),
  AWS_REGION: isTest ? z.string().optional() : z.string().min(1),
  S3_BUCKET_NAME: isTest ? z.string().optional() : z.string().min(1),
  ANTHROPIC_API_KEY: isTest ? z.string().optional() : z.string().min(1),
  RESEND_API_KEY: isTest ? z.string().optional() : z.string().min(1),
  EMAIL_FROM: isTest ? z.string().optional() : z.string().email(),
  SENTRY_DSN: z.string().optional(),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error('Invalid environment variables:');
  console.error(result.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = result.data;
