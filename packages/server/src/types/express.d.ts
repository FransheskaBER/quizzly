import type pino from 'pino';

/** Attached by auth middleware after successful token validation. */
export interface AuthUser {
  userId: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      requestId: string;
      log: pino.Logger;
    }
  }
}

export type {};
