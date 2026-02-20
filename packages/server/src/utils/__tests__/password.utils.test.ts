import { describe, it, expect } from 'vitest';
import { hashPassword, comparePassword } from '../password.utils.js';

describe('hashPassword', () => {
  it('returns a bcrypt hash string', async () => {
    const hash = await hashPassword('mypassword');
    expect(hash).toMatch(/^\$2[ab]\$\d+\$/);
  });

  it('hash is not equal to the plaintext password', async () => {
    const hash = await hashPassword('mypassword');
    expect(hash).not.toBe('mypassword');
  });

  it('hashing the same password twice produces different hashes (salt)', async () => {
    const [hash1, hash2] = await Promise.all([
      hashPassword('mypassword'),
      hashPassword('mypassword'),
    ]);
    expect(hash1).not.toBe(hash2);
  });
});

describe('comparePassword', () => {
  it('returns true for the correct password', async () => {
    const hash = await hashPassword('correctpassword');
    const result = await comparePassword('correctpassword', hash);
    expect(result).toBe(true);
  });

  it('returns false for the wrong password', async () => {
    const hash = await hashPassword('correctpassword');
    const result = await comparePassword('wrongpassword', hash);
    expect(result).toBe(false);
  });

  it('returns false for an empty string against a real hash', async () => {
    const hash = await hashPassword('correctpassword');
    const result = await comparePassword('', hash);
    expect(result).toBe(false);
  });
});
