// Global test setup — runs before each test file via vitest setupFiles.
// Environment variables (DATABASE_URL, JWT_SECRET, etc.) are injected by
// vitest.config.ts test.env and are already set on process.env by the time
// this file executes.

import { vi } from 'vitest';

// Mock the email service globally — never send real emails in any test suite.
// Captured in memory so individual tests can assert on calls via vi.mocked().
vi.mock('../services/email.service.js', () => ({
  sendVerificationEmail: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
}));
