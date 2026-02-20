import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
    setupFiles: ['src/__tests__/setup.ts'],
    env: {
      NODE_ENV: 'test',
      // Override with TEST_DATABASE_URL in CI; fall back to local test DB
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ??
        'postgresql://skills_dev:skills_dev@localhost:5432/skills_trainer_test',
      JWT_SECRET: 'test-jwt-secret-must-be-at-least-32-characters-long!!',
      JWT_EXPIRES_IN: '7d',
      CLIENT_URL: 'http://localhost:5173',
      PORT: '3001',
    },
    coverage: {
      provider: 'v8',
      include: ['src/services/**', 'src/utils/**'],
      reporter: ['text', 'lcov'],
    },
  },
});
