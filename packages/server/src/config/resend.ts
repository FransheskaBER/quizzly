import { Resend } from 'resend';
import { env } from './env.js';

// In test environment RESEND_API_KEY is optional — fall back to empty string.
// The email service guards against sending when EMAIL_FROM is absent, so this
// client is never actually used in tests.
export const resendClient = new Resend(env.RESEND_API_KEY ?? '');
