import { createHash, randomBytes } from 'node:crypto';

/** SHA-256 hash of a raw token. Used for both verification and reset tokens. */
export const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

/** Returns a raw random token and its SHA-256 hash.
 *  Store the hash; send the raw token via email. */
export const generateVerificationToken = (): { token: string; hash: string } => {
  const token = randomBytes(32).toString('hex');
  return { token, hash: hashToken(token) };
};

export const generateResetToken = (): { token: string; hash: string } => {
  const token = randomBytes(32).toString('hex');
  return { token, hash: hashToken(token) };
};

/** Parses expiry string (e.g. "7d", "24h") into milliseconds. Used for access token expiry. */
export const parseExpiresInMs = (s: string): number => {
  const match = /^(\d+)(d|h|m|s)$/.exec(s.trim().toLowerCase());
  if (!match) return 7 * 24 * 60 * 60 * 1000; // default 7d
  const [, n, unit] = match;
  const num = parseInt(n!, 10);
  switch (unit) {
    case 'd': return num * 24 * 60 * 60 * 1000;
    case 'h': return num * 60 * 60 * 1000;
    case 'm': return num * 60 * 1000;
    case 's': return num * 1000;
    default: return 7 * 24 * 60 * 60 * 1000;
  }
};

/** Returns a raw opaque access token and its SHA-256 hash. For DB-backed sessions. */
export const generateOpaqueAccessToken = (): { token: string; hash: string } => {
  const token = randomBytes(32).toString('hex');
  return { token, hash: hashToken(token) };
};
