import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from 'vitest';
import { execSync } from 'node:child_process';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../app.js';
import { prisma, cleanDatabase, closeDatabase } from '../../__tests__/helpers/db.helper.js';
import {
  createTestUser,
  createUnverifiedUser,
  getAuthToken,
} from '../../__tests__/helpers/auth.helper.js';

// Bypass rate limiting in integration tests — we're testing business logic,
// not the rate-limit library itself. Rate limit config is verified by code review.
vi.mock('../../middleware/rateLimiter.middleware.js', () => ({
  createRateLimiter: () => (_req: never, _res: never, next: () => void) => next(),
  createRateLimiterByEmailAndIp: () => [(_req: never, _res: never, next: () => void) => next()],
  globalRateLimiter: (_req: never, _res: never, next: () => void) => next(),
  quizGenerationHourlyLimiter: (_req: never, _res: never, next: () => void) => next(),
  quizGenerationDailyLimiter: (_req: never, _res: never, next: () => void) => next(),
  regradeRateLimiter: (_req: never, _res: never, next: () => void) => next(),
}));

import { sendPasswordResetEmail } from '../../services/email.service.js';

const app = createApp();

beforeAll(async () => {
  // Run migrations against the test database (idempotent — safe to run on every suite start)
  execSync('npx prisma migrate deploy', { stdio: 'inherit' });
});

afterEach(async () => {
  await cleanDatabase();
  vi.clearAllMocks();
});

afterAll(async () => {
  await closeDatabase();
});

// ---------------------------------------------------------------------------
// POST /api/auth/signup
// ---------------------------------------------------------------------------
describe('POST /api/auth/signup', () => {
  it('201 — creates account and returns a message', async () => {
    const res = await request(app).post('/api/auth/signup').send({
      email: 'new@example.com',
      username: 'newuser',
      password: 'Password123!',
    });

    expect(res.status).toBe(201);
    expect(res.body.message).toMatch(/Account created/i);
  });

  it('DB — user is created with emailVerified=false and a hashed password', async () => {
    await request(app).post('/api/auth/signup').send({
      email: 'new@example.com',
      username: 'newuser',
      password: 'Password123!',
    });

    const user = await prisma.user.findUnique({ where: { email: 'new@example.com' } });
    expect(user).not.toBeNull();
    expect(user!.emailVerified).toBe(false);
    expect(user!.verificationToken).not.toBeNull();
    expect(user!.passwordHash).not.toBe('Password123!');
    expect(user!.passwordHash).toMatch(/^\$2[ab]\$/);
  });

  it('400 — invalid email format (validation error with field details)', async () => {
    const res = await request(app).post('/api/auth/signup').send({
      email: 'not-an-email',
      username: 'newuser',
      password: 'Password123!',
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toBeDefined();
  });

  it('400 — password too short', async () => {
    const res = await request(app).post('/api/auth/signup').send({
      email: 'new@example.com',
      username: 'newuser',
      password: 'short',
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('400 — missing required fields', async () => {
    const res = await request(app).post('/api/auth/signup').send({ email: 'new@example.com' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('409 — duplicate email', async () => {
    await createTestUser({ email: 'existing@example.com' });

    const res = await request(app).post('/api/auth/signup').send({
      email: 'existing@example.com',
      username: 'anotheruser',
      password: 'Password123!',
    });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('extra fields in body are stripped (not rejected)', async () => {
    const res = await request(app).post('/api/auth/signup').send({
      email: 'new@example.com',
      username: 'newuser',
      password: 'Password123!',
      isAdmin: true, // should be ignored
    });

    expect(res.status).toBe(201);
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------
describe('POST /api/auth/login', () => {
  it('200 — returns JWT token and user profile for valid verified credentials', async () => {
    const { user, password } = await createTestUser({ email: 'login@example.com' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@example.com', password });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTypeOf('string');
    expect(res.body.token.split('.')).toHaveLength(3);
    expect(res.body.user).toMatchObject({
      id: user.id,
      email: user.email,
      username: user.username,
    });
  });

  it('401 — wrong email (message: "Invalid email or password")', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'Password123!' });

    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Invalid email or password');
  });

  it('401 — wrong password (same message as wrong email)', async () => {
    await createTestUser({ email: 'login@example.com' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@example.com', password: 'WrongPassword!' });

    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Invalid email or password');
  });

  it('401 EMAIL_NOT_VERIFIED — unverified user', async () => {
    const { password } = await createUnverifiedUser({ email: 'unverified@example.com' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'unverified@example.com', password });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('EMAIL_NOT_VERIFIED');
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/verify-email
// ---------------------------------------------------------------------------
describe('POST /api/auth/verify-email', () => {
  it('200 — verifies email and sets emailVerified=true in DB', async () => {
    const { verificationToken } = await createUnverifiedUser();

    const res = await request(app)
      .post('/api/auth/verify-email')
      .send({ token: verificationToken });

    expect(res.status).toBe(200);

    const user = await prisma.user.findUnique({ where: { email: 'unverified@example.com' } });
    expect(user!.emailVerified).toBe(true);
    // Token is kept so re-clicks return "already verified" rather than "invalid link"
    expect(user!.verificationToken).not.toBeNull();
  });

  it('400 — invalid token (not in DB)', async () => {
    const res = await request(app)
      .post('/api/auth/verify-email')
      .send({ token: 'completely-fake-token' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });

  it('400 — expired token', async () => {
    const { verificationToken } = await createUnverifiedUser({ expiredToken: true });

    const res = await request(app)
      .post('/api/auth/verify-email')
      .send({ token: verificationToken });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/expired/i);
  });

  it('409 — already verified user (re-click returns CONFLICT, not invalid link)', async () => {
    const { verificationToken } = await createUnverifiedUser();
    await request(app).post('/api/auth/verify-email').send({ token: verificationToken });

    // Second verify with same token — token is kept in DB so the user is found,
    // but emailVerified=true so we return 409 CONFLICT instead of 400.
    const res = await request(app)
      .post('/api/auth/verify-email')
      .send({ token: verificationToken });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/resend-verification
// ---------------------------------------------------------------------------
describe('POST /api/auth/resend-verification', () => {
  it('200 always — for an existing unverified user, generates new token', async () => {
    await createUnverifiedUser({ email: 'unverified@example.com' });
    const before = await prisma.user.findUnique({ where: { email: 'unverified@example.com' } });

    const res = await request(app)
      .post('/api/auth/resend-verification')
      .send({ email: 'unverified@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.message).toBeTruthy();

    // Token should be refreshed in DB
    const after = await prisma.user.findUnique({ where: { email: 'unverified@example.com' } });
    expect(after!.verificationToken).not.toBe(before!.verificationToken);
  });

  it('200 always — for a non-existent email (no leak)', async () => {
    const res = await request(app)
      .post('/api/auth/resend-verification')
      .send({ email: 'nobody@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.message).toBeTruthy();
  });

  it('200 always — for an already-verified user (no leak)', async () => {
    await createTestUser({ email: 'verified@example.com' });

    const res = await request(app)
      .post('/api/auth/resend-verification')
      .send({ email: 'verified@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.message).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/forgot-password
// ---------------------------------------------------------------------------
describe('POST /api/auth/forgot-password', () => {
  it('200 always — for an existing user, creates a password_resets record', async () => {
    const { user } = await createTestUser({ email: 'user@example.com' });

    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'user@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.message).toBeTruthy();

    const reset = await prisma.passwordReset.findFirst({ where: { userId: user.id } });
    expect(reset).not.toBeNull();
    expect(reset!.tokenHash).not.toBeNull();
    expect(reset!.usedAt).toBeNull();
  });

  it('200 always — for a non-existent email (no leak)', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'nobody@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.message).toBeTruthy();
    expect(await prisma.passwordReset.count()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/reset-password
// ---------------------------------------------------------------------------
describe('POST /api/auth/reset-password', () => {
  it('200 — resets password; user can login with new password', async () => {
    const { user } = await createTestUser({ email: 'user@example.com' });

    // Trigger forgot-password to create a reset record
    await request(app).post('/api/auth/forgot-password').send({ email: 'user@example.com' });
    const rawToken = vi.mocked(sendPasswordResetEmail).mock.calls[0][1];

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: rawToken, password: 'NewPassword123!' });

    expect(res.status).toBe(200);
    expect(res.body.message).toBeTruthy();

    // Verify new password hash was stored (not plaintext)
    const updated = await prisma.user.findUnique({ where: { id: user.id } });
    expect(updated!.passwordHash).not.toBe('NewPassword123!');

    // Verify reset record is marked as used
    const reset = await prisma.passwordReset.findFirst({ where: { userId: user.id } });
    expect(reset!.usedAt).not.toBeNull();

    // User can login with the new password
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@example.com', password: 'NewPassword123!' });
    expect(loginRes.status).toBe(200);
  });

  it('400 — invalid token', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'fake-token-that-does-not-exist', password: 'NewPassword123!' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });

  it('400 — already-used token', async () => {
    await createTestUser({ email: 'user@example.com' });
    await request(app).post('/api/auth/forgot-password').send({ email: 'user@example.com' });
    const rawToken = vi.mocked(sendPasswordResetEmail).mock.calls[0][1];

    // First reset succeeds
    await request(app)
      .post('/api/auth/reset-password')
      .send({ token: rawToken, password: 'NewPassword123!' });

    // Second reset with same token fails
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: rawToken, password: 'AnotherPassword456!' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });
});

// ---------------------------------------------------------------------------
// GET /api/auth/me
// ---------------------------------------------------------------------------
describe('GET /api/auth/me', () => {
  it('200 — returns user profile for a valid JWT', async () => {
    const { user } = await createTestUser({ email: 'me@example.com' });
    const token = getAuthToken(user);

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: user.id,
      email: user.email,
      username: user.username,
      emailVerified: true,
    });
    expect(res.body.createdAt).toBeTypeOf('string');
  });

  it('401 — no Authorization header', async () => {
    const res = await request(app).get('/api/auth/me');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('401 — malformed token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer this.is.notvalid');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('401 — expired token', async () => {
    const expiredToken = jwt.sign(
      { userId: 'user-123', email: 'test@example.com' },
      process.env.JWT_SECRET!,
      { expiresIn: 0 },
    );

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${expiredToken}`);

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Error format consistency
// ---------------------------------------------------------------------------
describe('Error response format', () => {
  it('every 4xx error matches { error: { code, message } }', async () => {
    const responses = await Promise.all([
      request(app).post('/api/auth/signup').send({ email: 'bad' }),
      request(app).post('/api/auth/login').send({ email: 'nobody@example.com', password: 'x' }),
      request(app).post('/api/auth/verify-email').send({ token: 'bad' }),
      request(app).get('/api/auth/me'),
    ]);

    for (const res of responses) {
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBeTypeOf('string');
      expect(res.body.error.message).toBeTypeOf('string');
      // No stack traces or internal error details should leak
      expect(JSON.stringify(res.body)).not.toContain('stack');
    }
  });
});
