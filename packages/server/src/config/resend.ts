import { Resend } from 'resend';
import { env } from './env.js';

// In test environment RESEND_API_KEY is optional — fall back to empty string.
// The email service is mocked in all test suites so this client is never used.
export const resendClient = new Resend(env.RESEND_API_KEY ?? '');
