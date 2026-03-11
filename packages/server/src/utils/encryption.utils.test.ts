import { describe, it, expect, vi } from 'vitest';

vi.mock('../config/env.js', () => ({
  env: { API_KEY_ENCRYPTION_KEY: 'a'.repeat(64) },
}));

import { encrypt, decrypt } from './encryption.utils.js';

describe('encrypt', () => {
  it('returns a base64-encoded string', () => {
    const ciphertext = encrypt('sk-ant-test-key-1234567890');

    expect(typeof ciphertext).toBe('string');
    expect(ciphertext).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    // iv (12) + authTag (16) + at least 1 byte ciphertext = 29 bytes minimum
    const decoded = Buffer.from(ciphertext, 'base64');
    expect(decoded.length).toBeGreaterThanOrEqual(29);
  });

  it('produces different ciphertexts for the same plaintext (random IV)', () => {
    const plaintext = 'sk-ant-test-key-1234567890';
    const first = encrypt(plaintext);
    const second = encrypt(plaintext);

    expect(first).not.toBe(second);
  });
});

describe('decrypt', () => {
  it('recovers the original plaintext', () => {
    const plaintext = 'sk-ant-api03-abcdef1234567890';
    const ciphertext = encrypt(plaintext);
    const recovered = decrypt(ciphertext);

    expect(recovered).toBe(plaintext);
  });

  it('throws on tampered ciphertext', () => {
    const ciphertext = encrypt('sk-ant-test-key-1234567890');
    const tampered = ciphertext.slice(0, -4) + 'AAAA';

    expect(() => decrypt(tampered)).toThrow();
  });
});
