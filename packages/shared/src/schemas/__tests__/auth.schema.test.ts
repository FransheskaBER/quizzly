import { describe, it, expect } from 'vitest';
import {
  signupSchema,
  loginSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../auth.schema.js';

describe('signupSchema', () => {
  it('accepts valid data', () => {
    const result = signupSchema.safeParse({
      email: 'user@example.com',
      username: 'alice',
      password: 'Password123!',
    });
    expect(result.success).toBe(true);
  });

  it('lowercases email', () => {
    // Zod validates email format before the transform runs, so spaces would fail.
    // The transform normalises case on a valid email address.
    const result = signupSchema.safeParse({
      email: 'Test@EXAMPLE.COM',
      username: 'alice',
      password: 'Password123!',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe('test@example.com');
  });

  it('trims username', () => {
    const result = signupSchema.safeParse({
      email: 'user@example.com',
      username: '  alice  ',
      password: 'Password123!',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.username).toBe('alice');
  });

  it('rejects invalid email format', () => {
    const result = signupSchema.safeParse({
      email: 'not-an-email',
      username: 'alice',
      password: 'Password123!',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing email', () => {
    const result = signupSchema.safeParse({ username: 'alice', password: 'Password123!' });
    expect(result.success).toBe(false);
  });

  it('rejects empty username', () => {
    const result = signupSchema.safeParse({
      email: 'user@example.com',
      username: '',
      password: 'Password123!',
    });
    expect(result.success).toBe(false);
  });

  it('rejects password under 8 characters', () => {
    const result = signupSchema.safeParse({
      email: 'user@example.com',
      username: 'alice',
      password: 'short',
    });
    expect(result.success).toBe(false);
  });

  it('rejects email over 255 characters', () => {
    const result = signupSchema.safeParse({
      email: `${'a'.repeat(250)}@example.com`,
      username: 'alice',
      password: 'Password123!',
    });
    expect(result.success).toBe(false);
  });

  it('rejects username over 50 characters', () => {
    const result = signupSchema.safeParse({
      email: 'user@example.com',
      username: 'a'.repeat(51),
      password: 'Password123!',
    });
    expect(result.success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('accepts valid data', () => {
    const result = loginSchema.safeParse({ email: 'user@example.com', password: 'anypassword' });
    expect(result.success).toBe(true);
  });

  it('lowercases email', () => {
    const result = loginSchema.safeParse({ email: 'USER@EXAMPLE.COM', password: 'anypassword' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe('user@example.com');
  });

  it('rejects missing email', () => {
    const result = loginSchema.safeParse({ password: 'anypassword' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid email', () => {
    const result = loginSchema.safeParse({ email: 'bad', password: 'anypassword' });
    expect(result.success).toBe(false);
  });

  it('rejects missing password', () => {
    const result = loginSchema.safeParse({ email: 'user@example.com' });
    expect(result.success).toBe(false);
  });
});

describe('verifyEmailSchema', () => {
  it('accepts a valid token', () => {
    const result = verifyEmailSchema.safeParse({ token: 'abc123' });
    expect(result.success).toBe(true);
  });

  it('rejects empty token', () => {
    const result = verifyEmailSchema.safeParse({ token: '' });
    expect(result.success).toBe(false);
  });

  it('rejects missing token', () => {
    const result = verifyEmailSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('resendVerificationSchema', () => {
  it('accepts valid email and lowercases it', () => {
    const result = resendVerificationSchema.safeParse({ email: 'USER@EXAMPLE.COM' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe('user@example.com');
  });

  it('rejects invalid email', () => {
    const result = resendVerificationSchema.safeParse({ email: 'not-valid' });
    expect(result.success).toBe(false);
  });
});

describe('forgotPasswordSchema', () => {
  it('accepts valid email and lowercases it', () => {
    const result = forgotPasswordSchema.safeParse({ email: 'RESET@EXAMPLE.COM' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe('reset@example.com');
  });

  it('rejects invalid email', () => {
    const result = forgotPasswordSchema.safeParse({ email: 'oops' });
    expect(result.success).toBe(false);
  });
});

describe('resetPasswordSchema', () => {
  it('accepts valid token and password', () => {
    const result = resetPasswordSchema.safeParse({ token: 'abc123', password: 'NewPassword1!' });
    expect(result.success).toBe(true);
  });

  it('rejects short password', () => {
    const result = resetPasswordSchema.safeParse({ token: 'abc123', password: 'short' });
    expect(result.success).toBe(false);
  });

  it('rejects missing token', () => {
    const result = resetPasswordSchema.safeParse({ password: 'NewPassword1!' });
    expect(result.success).toBe(false);
  });
});
