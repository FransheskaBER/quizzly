import { PrismaClient } from '@prisma/client';

// Singleton pattern: reuse the same client in dev to avoid exhausting connections
// during hot reloads (tsx watch creates a new module instance on each reload).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// In test mode, use TEST_DATABASE_URL exclusively (never DATABASE_URL).
const datasourceUrl =
  process.env.NODE_ENV === 'test' ? process.env.TEST_DATABASE_URL : undefined;

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient(datasourceUrl ? { datasourceUrl } : {});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
