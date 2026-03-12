import { describe, it, expect } from 'vitest';
import {
  generateOpaqueAccessToken,
  parseExpiresInMs,
  generateVerificationToken,
  generateResetToken,
  hashToken,
} from '../token.utils.js';

describe('generateOpaqueAccessToken', () => {
  it('returns a token string and a hash', () => {
    const { token, hash } = generateOpaqueAccessToken();
    expect(typeof token).toBe('string');
    expect(typeof hash).toBe('string');
  });

  it('token is ~64 hex characters (32 bytes)', () => {
    const { token } = generateOpaqueAccessToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('hash is SHA-256 of the token', () => {
    const { token, hash } = generateOpaqueAccessToken();
    expect(hashToken(token)).toBe(hash);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('two calls produce different tokens', () => {
    const a = generateOpaqueAccessToken();
    const b = generateOpaqueAccessToken();
    expect(a.token).not.toBe(b.token);
    expect(a.hash).not.toBe(b.hash);
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
