import pino from 'pino';
import { prisma } from '../config/database.js';
import { Sentry } from '../config/sentry.js';

const logger = pino({ name: 'health.service' });

export const healthService = {
  async checkDatabase(): Promise<{ db: 'connected' | 'disconnected' }> {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { db: 'connected' };
    } catch (err) {
      logger.error({ err, operation: 'health.checkDatabase' }, 'Database health check failed');
      Sentry.captureException(err, { extra: { operation: 'health.checkDatabase' } });
      return { db: 'disconnected' };
    }
  },
};
