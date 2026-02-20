import { Resend } from 'resend';
import { env } from './env.js';

// In test environment RESEND_API_KEY is optional — fall back to a dummy key so
// the client can instantiate without crashing. It never sends because the email
// service is mocked in all test suites.
export const resendClient = new Resend(env.RESEND_API_KEY ?? 're_test_dummy');
