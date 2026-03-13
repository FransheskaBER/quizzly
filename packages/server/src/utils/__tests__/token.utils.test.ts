import { describe, it, expect, vi, afterEach } from 'vitest';
import jwt from 'jsonwebtoken';

import { env } from '../../config/env.js';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  parseExpiresInMs,
  generateVerificationToken,
  generateResetToken,
  hashToken,
} from '../token.utils.js';

describe('generateAccessToken', () => {
  it('returns a valid JWT signed with JWT_SECRET', () => {
    const token = generateAccessToken({ userId: 'user-123', email: 'test@example.com' });
    const decoded = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload;
    expect(decoded.userId).toBe('user-123');
    expect(decoded.email).toBe('test@example.com');
  });

  it('sets expiry to 15 minutes', () => {
    const token = generateAccessToken({ userId: 'user-123', email: 'test@example.com' });
    const decoded = jwt.decode(token) as jwt.JwtPayload;
    const expiryDuration = decoded.exp! - decoded.iat!;
    expect(expiryDuration).toBe(15 * 60);
  });

  it('two calls produce different tokens (different iat)', () => {
    vi.useFakeTimers();
    const tokenA = generateAccessToken({ userId: 'user-123', email: 'test@example.com' });
    vi.advanceTimersByTime(1000); // advance 1 second so iat differs
    const tokenB = generateAccessToken({ userId: 'user-123', email: 'test@example.com' });
    vi.useRealTimers();
    expect(tokenA).not.toBe(tokenB);
  });
});

describe('generateRefreshToken', () => {
  it('returns a valid JWT signed with REFRESH_SECRET', () => {
    const token = generateRefreshToken({ userId: 'user-123', email: 'test@example.com' });
    const decoded = jwt.verify(token, env.REFRESH_SECRET) as jwt.JwtPayload;
    expect(decoded.userId).toBe('user-123');
    expect(decoded.email).toBe('test@example.com');
  });

  it('sets expiry to 7 days', () => {
    const token = generateRefreshToken({ userId: 'user-123', email: 'test@example.com' });
    const decoded = jwt.decode(token) as jwt.JwtPayload;
    const expiryDuration = decoded.exp! - decoded.iat!;
    expect(expiryDuration).toBe(7 * 24 * 60 * 60);
  });
});

describe('verifyAccessToken', () => {
  it('returns payload for a valid access token', () => {
    const token = generateAccessToken({ userId: 'user-123', email: 'test@example.com' });
    const payload = verifyAccessToken(token);
    expect(payload).toEqual({ userId: 'user-123', email: 'test@example.com' });
  });

  it('returns null for an expired access token', () => {
    const token = jwt.sign({ userId: 'user-123', email: 'test@example.com' }, env.JWT_SECRET, { expiresIn: '0s' });
    const payload = verifyAccessToken(token);
    expect(payload).toBeNull();
  });

  it('returns null for a token signed with wrong secret', () => {
    const token = jwt.sign({ userId: 'user-123', email: 'test@example.com' }, 'wrong-secret');
    const payload = verifyAccessToken(token);
    expect(payload).toBeNull();
  });

  it('returns null for a refresh token (signed with REFRESH_SECRET)', () => {
    const token = generateRefreshToken({ userId: 'user-123', email: 'test@example.com' });
    const payload = verifyAccessToken(token);
    expect(payload).toBeNull();
  });

  it('returns null for a token with missing claims', () => {
    const token = jwt.sign({ sub: 'user-123' }, env.JWT_SECRET);
    const payload = verifyAccessToken(token);
    expect(payload).toBeNull();
  });
});

describe('verifyRefreshToken', () => {
  it('returns payload for a valid refresh token', () => {
    const token = generateRefreshToken({ userId: 'user-123', email: 'test@example.com' });
    const payload = verifyRefreshToken(token);
    expect(payload).toEqual({ userId: 'user-123', email: 'test@example.com' });
  });

  it('returns null for an expired refresh token', () => {
    const token = jwt.sign({ userId: 'user-123', email: 'test@example.com' }, env.REFRESH_SECRET, { expiresIn: '0s' });
    const payload = verifyRefreshToken(token);
    expect(payload).toBeNull();
  });

  it('returns null for an access token (signed with JWT_SECRET)', () => {
    const token = generateAccessToken({ userId: 'user-123', email: 'test@example.com' });
    const payload = verifyRefreshToken(token);
    expect(payload).toBeNull();
  });

  it('returns null for a token with missing claims', () => {
    const token = jwt.sign({ sub: 'user-123' }, env.REFRESH_SECRET);
    const payload = verifyRefreshToken(token);
    expect(payload).toBeNull();
  });
});

describe('parseExpiresInMs', () => {
  it('parses days correctly', () => {
    expect(parseExpiresInMs('7d')).toBe(7 * 24 * 60 * 60 * 1000);
    expect(parseExpiresInMs('1d')).toBe(24 * 60 * 60 * 1000);
  });

  it('parses hours correctly', () => {
    expect(parseExpiresInMs('24h')).toBe(24 * 60 * 60 * 1000);
    expect(parseExpiresInMs('1h')).toBe(60 * 60 * 1000);
  });

  it('parses minutes correctly', () => {
    expect(parseExpiresInMs('30m')).toBe(30 * 60 * 1000);
    expect(parseExpiresInMs('1m')).toBe(60 * 1000);
  });

  it('parses seconds correctly', () => {
    expect(parseExpiresInMs('60s')).toBe(60 * 1000);
    expect(parseExpiresInMs('1s')).toBe(1000);
  });

  it('is case-insensitive', () => {
    expect(parseExpiresInMs('7D')).toBe(parseExpiresInMs('7d'));
    expect(parseExpiresInMs('1H')).toBe(parseExpiresInMs('1h'));
  });

  it('returns 7d default for invalid format', () => {
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    expect(parseExpiresInMs('invalid')).toBe(sevenDaysMs);
    expect(parseExpiresInMs('')).toBe(sevenDaysMs);
    expect(parseExpiresInMs('7x')).toBe(sevenDaysMs);
  });
});

describe('generateVerificationToken', () => {
  it('returns a token string and a hash', () => {
    const { token, hash } = generateVerificationToken();
    expect(typeof token).toBe('string');
    expect(typeof hash).toBe('string');
  });

  it('token is ~64 hex characters (32 bytes)', () => {
    const { token } = generateVerificationToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('hash is a SHA-256 hex string (64 chars)', () => {
    const { hash } = generateVerificationToken();
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('raw token and hash are different', () => {
    const { token, hash } = generateVerificationToken();
    expect(token).not.toBe(hash);
  });

  it('two calls produce different tokens', () => {
    const a = generateVerificationToken();
    const b = generateVerificationToken();
    expect(a.token).not.toBe(b.token);
    expect(a.hash).not.toBe(b.hash);
  });
});

describe('generateResetToken', () => {
  it('returns different token and hash', () => {
    const { token, hash } = generateResetToken();
    expect(token).not.toBe(hash);
  });
});

describe('hashToken', () => {
  it('is deterministic — same input always produces same hash', () => {
    const hash1 = hashToken('rawtoken');
    const hash2 = hashToken('rawtoken');
    expect(hash1).toBe(hash2);
  });

  it('matches the hash returned by generateVerificationToken', () => {
    const { token, hash } = generateVerificationToken();
    expect(hashToken(token)).toBe(hash);
  });
});
