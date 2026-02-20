import { PrismaClient } from '@prisma/client';

// Dedicated Prisma client for integration tests — reads DATABASE_URL from env,
// which vitest.config.ts points at the test database.
export const prisma = new PrismaClient();

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
