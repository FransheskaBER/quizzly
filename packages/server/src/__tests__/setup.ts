// Global test setup — runs before each test file via vitest setupFiles.
// Environment variables (TEST_DATABASE_URL, JWT_SECRET, etc.) are injected by
// vitest.config.ts test.env and are already set on process.env by the time
// this file executes.

// Safety guard: block tests from running against a remote database.
// Prevents accidental data loss if TEST_DATABASE_URL points to production.
const testDbUrl = process.env.TEST_DATABASE_URL ?? '';
const isLocalDatabase = /localhost|127\.0\.0\.1/.test(testDbUrl);
if (!isLocalDatabase) {
  throw new Error(
    `DANGER: TEST_DATABASE_URL appears to point to a remote database.\n` +
    `URL: ${testDbUrl.replace(/\/\/.*:.*@/, '//***:***@')}\n` +
    `Tests must run against a local database to prevent data loss.\n` +
    `Set TEST_DATABASE_URL to your local Postgres (e.g., postgresql://postgres:postgres@localhost:5432/quizzly_test)`,
  );
}

import { vi } from 'vitest';

// Mock the email service globally — never send real emails in any test suite.
// Captured in memory so individual tests can assert on calls via vi.mocked().
vi.mock('../services/email.service.js', () => ({
  sendVerificationEmail: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
}));
