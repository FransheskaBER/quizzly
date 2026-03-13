import { PrismaClient } from '@prisma/client';

const testDbUrl = process.env.TEST_DATABASE_URL;
if (!testDbUrl) {
  throw new Error('Missing required test environment variable: TEST_DATABASE_URL');
}

// Dedicated Prisma client for integration tests — uses TEST_DATABASE_URL exclusively.
// Never references DATABASE_URL; tests always run against the test database copy.
export const prisma = new PrismaClient({ datasourceUrl: testDbUrl });

/**
 * Truncates all tables between tests to ensure isolation.
 * Cascades to all child tables (sessions, materials, quiz_attempts, etc.)
 */
export const cleanDatabase = async (): Promise<void> => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE users, password_resets CASCADE',
  );
};

/** Disconnect Prisma after all tests in a suite complete. */
export const closeDatabase = async (): Promise<void> => {
  await prisma.$disconnect();
};
