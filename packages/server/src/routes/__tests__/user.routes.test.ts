import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from 'vitest';
import { execSync } from 'node:child_process';
import request from 'supertest';

vi.mock('../../middleware/rateLimiter.middleware.js', () => ({
  createRateLimiter: () => (_req: never, _res: never, next: () => void) => next(),
  createRateLimiterByEmailAndIp: () => [(_req: never, _res: never, next: () => void) => next()],
  globalRateLimiter: (_req: never, _res: never, next: () => void) => next(),
  quizGenerationHourlyLimiter: (_req: never, _res: never, next: () => void) => next(),
  quizGenerationDailyLimiter: (_req: never, _res: never, next: () => void) => next(),
  regradeRateLimiter: (_req: never, _res: never, next: () => void) => next(),
}));

import { createApp } from '../../app.js';
import { prisma, cleanDatabase, closeDatabase } from '../../__tests__/helpers/db.helper.js';
import { createTestUser, getAuthToken } from '../../__tests__/helpers/auth.helper.js';

const app = createApp();

const VALID_API_KEY = 'sk-ant-api03-valid-key-that-is-long-enough-for-validation-1234567890abcdef';

beforeAll(async () => {
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
// GET /api/users/api-key/status
// ---------------------------------------------------------------------------

describe('GET /api/users/api-key/status', () => {
  it('returns hasApiKey:false when no key is saved', async () => {
    const { user } = await createTestUser();

    const res = await request(app)
      .get('/api/users/api-key/status')
      .set('Authorization', `Bearer ${getAuthToken(user)}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ hasApiKey: false, hint: null });
  });

  it('returns 401 without auth token', async () => {
    const res = await request(app).get('/api/users/api-key/status');

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /api/users/api-key
// ---------------------------------------------------------------------------

describe('POST /api/users/api-key', () => {
  it('saves a valid API key and returns status with hint', async () => {
    const { user } = await createTestUser();

    const res = await request(app)
      .post('/api/users/api-key')
      .set('Authorization', `Bearer ${getAuthToken(user)}`)
      .send({ apiKey: VALID_API_KEY });

    expect(res.status).toBe(200);
    expect(res.body.hasApiKey).toBe(true);
    expect(res.body.hint).toMatch(/^sk-ant-\.\.\..{4}$/);
  });

  it('persists the key — status returns hasApiKey:true after save', async () => {
    const { user } = await createTestUser();

    await request(app)
      .post('/api/users/api-key')
      .set('Authorization', `Bearer ${getAuthToken(user)}`)
      .send({ apiKey: VALID_API_KEY });

    const statusRes = await request(app)
      .get('/api/users/api-key/status')
      .set('Authorization', `Bearer ${getAuthToken(user)}`);

    expect(statusRes.body.hasApiKey).toBe(true);
  });

  it('stores encrypted ciphertext, not plaintext', async () => {
    const { user } = await createTestUser();

    await request(app)
      .post('/api/users/api-key')
      .set('Authorization', `Bearer ${getAuthToken(user)}`)
      .send({ apiKey: VALID_API_KEY });

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { encryptedApiKey: true },
    });

    expect(dbUser?.encryptedApiKey).not.toBe(VALID_API_KEY);
    expect(dbUser?.encryptedApiKey).not.toBeNull();
  });

  it('returns 400 for invalid API key format', async () => {
    const { user } = await createTestUser();

    const res = await request(app)
      .post('/api/users/api-key')
      .set('Authorization', `Bearer ${getAuthToken(user)}`)
      .send({ apiKey: 'bad-prefix-key' });

    expect(res.status).toBe(400);
  });

  it('returns 401 without auth token', async () => {
    const res = await request(app)
      .post('/api/users/api-key')
      .send({ apiKey: VALID_API_KEY });

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/users/api-key
// ---------------------------------------------------------------------------

describe('DELETE /api/users/api-key', () => {
  it('removes a saved API key', async () => {
    const { user } = await createTestUser();

    // Save first
    await request(app)
      .post('/api/users/api-key')
      .set('Authorization', `Bearer ${getAuthToken(user)}`)
      .send({ apiKey: VALID_API_KEY });

    const res = await request(app)
      .delete('/api/users/api-key')
      .set('Authorization', `Bearer ${getAuthToken(user)}`);

    expect(res.status).toBe(204);

    // Verify removal
    const statusRes = await request(app)
      .get('/api/users/api-key/status')
      .set('Authorization', `Bearer ${getAuthToken(user)}`);

    expect(statusRes.body.hasApiKey).toBe(false);
  });

  it('returns 204 even when no key exists (idempotent)', async () => {
    const { user } = await createTestUser();

    const res = await request(app)
      .delete('/api/users/api-key')
      .set('Authorization', `Bearer ${getAuthToken(user)}`);

    expect(res.status).toBe(204);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/users/profile
// ---------------------------------------------------------------------------

describe('PATCH /api/users/profile', () => {
  it('updates the username and returns the user response', async () => {
    const { user } = await createTestUser();

    const res = await request(app)
      .patch('/api/users/profile')
      .set('Authorization', `Bearer ${getAuthToken(user)}`)
      .send({ username: 'newname' });

    expect(res.status).toBe(200);
    expect(res.body.username).toBe('newname');
    expect(res.body.id).toBe(user.id);
  });

  it('returns 400 for empty username', async () => {
    const { user } = await createTestUser();

    const res = await request(app)
      .patch('/api/users/profile')
      .set('Authorization', `Bearer ${getAuthToken(user)}`)
      .send({ username: '' });

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/users/password
// ---------------------------------------------------------------------------

describe('PUT /api/users/password', () => {
  it('changes password successfully with correct current password', async () => {
    const { user, password } = await createTestUser();

    const res = await request(app)
      .put('/api/users/password')
      .set('Authorization', `Bearer ${getAuthToken(user)}`)
      .send({ currentPassword: password, newPassword: 'NewSecurePassword456!' });

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('Password changed');
  });

  it('returns 401 for wrong current password', async () => {
    const { user } = await createTestUser();

    const res = await request(app)
      .put('/api/users/password')
      .set('Authorization', `Bearer ${getAuthToken(user)}`)
      .send({ currentPassword: 'wrong-password', newPassword: 'NewSecurePassword456!' });

    expect(res.status).toBe(401);
  });

  it('returns 400 when new password is too short', async () => {
    const { user, password } = await createTestUser();

    const res = await request(app)
      .put('/api/users/password')
      .set('Authorization', `Bearer ${getAuthToken(user)}`)
      .send({ currentPassword: password, newPassword: 'short' });

    expect(res.status).toBe(400);
  });
});
