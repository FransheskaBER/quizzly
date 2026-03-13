import { PrismaClient } from '@prisma/client';

// Singleton pattern: reuse the same client in dev to avoid exhausting connections
// during hot reloads (tsx watch creates a new module instance on each reload).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// In test mode, use TEST_DATABASE_URL exclusively — never fall back to DATABASE_URL.
// If TEST_DATABASE_URL is missing, fail loudly to prevent accidental use of the original database.
const datasourceUrl =
  process.env.NODE_ENV === 'test' ? process.env.TEST_DATABASE_URL : undefined;

if (process.env.NODE_ENV === 'test' && !datasourceUrl) {
  throw new Error(
    'TEST_DATABASE_URL is required when NODE_ENV=test. Set it to your local test database — never fall back to the original database.',
  );
}

export const prisma =
  globalForPrisma.prisma ??
  (datasourceUrl
    ? new PrismaClient({ datasourceUrl })
    : new PrismaClient());

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
