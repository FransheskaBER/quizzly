import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import {
  generateAccessToken,
  verifyAccessToken,
  generateVerificationToken,
  generateResetToken,
  hashToken,
} from '../token.utils.js';

describe('generateAccessToken', () => {
  it('returns a string JWT', () => {
    const token = generateAccessToken({ userId: 'user-123', email: 'user@example.com' });
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3); // header.payload.signature
  });

  it('payload contains userId and email', () => {
    const token = generateAccessToken({ userId: 'user-123', email: 'user@example.com' });
    const decoded = jwt.decode(token) as { userId: string; email: string; exp: number };
    expect(decoded.userId).toBe('user-123');
    expect(decoded.email).toBe('user@example.com');
  });

  it('token has an expiry (exp claim)', () => {
    const token = generateAccessToken({ userId: 'user-123', email: 'user@example.com' });
    const decoded = jwt.decode(token) as { exp: number };
    expect(decoded.exp).toBeTypeOf('number');
    expect(decoded.exp).toBeGreaterThan(Date.now() / 1000); // expiry is in the future
  });
});

describe('verifyAccessToken', () => {
  it('returns decoded payload for a valid token', () => {
    const token = generateAccessToken({ userId: 'user-456', email: 'test@example.com' });
    const payload = verifyAccessToken(token);
    expect(payload.userId).toBe('user-456');
    expect(payload.email).toBe('test@example.com');
  });

  it('throws for an expired token', () => {
    // Sign with 0-second expiry to get an already-expired token
    const expiredToken = jwt.sign(
      { userId: 'user-789', email: 'test@example.com' },
      process.env.JWT_SECRET!,
      { expiresIn: 0 },
    );
    expect(() => verifyAccessToken(expiredToken)).toThrow();
  });

  it('throws for a tampered/invalid token string', () => {
    expect(() => verifyAccessToken('this.is.notavalidjwt')).toThrow();
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
