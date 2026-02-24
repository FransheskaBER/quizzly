import type pino from 'pino';

import type { TokenPayload } from '../utils/token.utils.js';

declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
      requestId: string;
      log: pino.Logger;
    }
  }
}

export type {};
