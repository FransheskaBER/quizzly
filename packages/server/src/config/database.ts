import { PrismaClient } from '@prisma/client';

// Singleton pattern: reuse the same client in dev to avoid exhausting connections
// during hot reloads (tsx watch creates a new module instance on each reload).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
