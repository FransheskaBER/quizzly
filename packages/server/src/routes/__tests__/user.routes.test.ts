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

const VALID_API_KEY = 'sk-ant-test-nonsecret-validation-value-1234567890';

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
    const token = await getAuthToken(user);

    const res = await request(app)
      .get('/api/users/api-key/status')
      .set('Authorization', `Bearer ${token}`);

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
    const token = await getAuthToken(user);

    const res = await request(app)
      .post('/api/users/api-key')
      .set('Authorization', `Bearer ${token}`)
      .send({ apiKey: VALID_API_KEY });

    expect(res.status).toBe(200);
    expect(res.body.hasApiKey).toBe(true);
    expect(res.body.hint).toMatch(/^sk-ant-\.\.\..{4}$/);
  });

  it('persists the key — status returns hasApiKey:true after save', async () => {
    const { user } = await createTestUser();
    const token = await getAuthToken(user);

    await request(app)
      .post('/api/users/api-key')
      .set('Authorization', `Bearer ${token}`)
      .send({ apiKey: VALID_API_KEY });

    const statusRes = await request(app)
      .get('/api/users/api-key/status')
      .set('Authorization', `Bearer ${token}`);

    expect(statusRes.body.hasApiKey).toBe(true);
  });

  it('stores encrypted ciphertext, not plaintext', async () => {
    const { user } = await createTestUser();
    const token = await getAuthToken(user);

    await request(app)
      .post('/api/users/api-key')
      .set('Authorization', `Bearer ${token}`)
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
    const token = await getAuthToken(user);

    const res = await request(app)
      .post('/api/users/api-key')
      .set('Authorization', `Bearer ${token}`)
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
    const token = await getAuthToken(user);

    // Save first
    await request(app)
      .post('/api/users/api-key')
      .set('Authorization', `Bearer ${token}`)
      .send({ apiKey: VALID_API_KEY });

    const res = await request(app)
      .delete('/api/users/api-key')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(204);

    // Verify removal
    const statusRes = await request(app)
      .get('/api/users/api-key/status')
      .set('Authorization', `Bearer ${token}`);

    expect(statusRes.body.hasApiKey).toBe(false);
  });

  it('returns 204 even when no key exists (idempotent)', async () => {
    const { user } = await createTestUser();
    const token = await getAuthToken(user);

    const res = await request(app)
      .delete('/api/users/api-key')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(204);
  });
});

// ---------------------------------------------------------------------------
// Removed endpoints regression
// ---------------------------------------------------------------------------

describe('Removed legacy profile endpoints', () => {
  it('returns 404 for PATCH /api/users/profile and PUT /api/users/password', async () => {
    const { user } = await createTestUser();
    const token = await getAuthToken(user);

    const patchRes = await request(app)
      .patch('/api/users/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'new-name' });

    const putRes = await request(app)
      .put('/api/users/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'old-pass', newPassword: 'new-pass-123' });

    expect(patchRes.status).toBe(404);
    expect(putRes.status).toBe(404);
  });
});

