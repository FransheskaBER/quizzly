import { prisma } from '@server/config/database.js';

export const healthService = {
  async checkDatabase(): Promise<{ db: 'connected' | 'disconnected' }> {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { db: 'connected' };
    } catch {
      return { db: 'disconnected' };
    }
  },
};
