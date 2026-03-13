import dotenv from 'dotenv';
import { defineConfig } from 'vitest/config';

// Load .env before reading env vars — process.env is empty at config time.
dotenv.config();

const requireEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required test environment variable: ${key}`);
  }
  return value;
};

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
    // Integration tests share a single Postgres database — run files serially
    // to prevent cleanDatabase() in one suite from deleting rows mid-test in another.
    fileParallelism: false,
    setupFiles: ['src/__tests__/setup.ts'],
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: requireEnv('TEST_DATABASE_URL'),
      JWT_SECRET: requireEnv('JWT_SECRET'),
      JWT_EXPIRES_IN: '7d',
      CLIENT_URL: 'http://localhost:5173',
      PORT: '3001',
      API_KEY_ENCRYPTION_KEY: requireEnv('API_KEY_ENCRYPTION_KEY'),
    },
    coverage: {
      provider: 'v8',
      include: ['src/services/**', 'src/utils/**'],
      reporter: ['text', 'lcov'],
    },
  },
});
