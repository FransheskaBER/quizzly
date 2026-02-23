import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from 'vitest';
import { execSync } from 'node:child_process';
import request from 'supertest';
import { createApp } from '../../app.js';
import { prisma, cleanDatabase, closeDatabase } from '../../__tests__/helpers/db.helper.js';
import { createTestUser, getAuthToken } from '../../__tests__/helpers/auth.helper.js';

// Bypass rate limiting in integration tests — testing business logic, not rate-limit config.
vi.mock('../../middleware/rateLimiter.middleware.js', () => ({
  createRateLimiter: () => (_req: never, _res: never, next: () => void) => next(),
  globalRateLimiter: (_req: never, _res: never, next: () => void) => next(),
  quizGenerationHourlyLimiter: (_req: never, _res: never, next: () => void) => next(),
  quizGenerationDailyLimiter: (_req: never, _res: never, next: () => void) => next(),
  regradeRateLimiter: (_req: never, _res: never, next: () => void) => next(),
}));

const app = createApp();

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
// Helper — create a session directly in DB (bypasses route)
// ---------------------------------------------------------------------------
const createSession = async (userId: string, overrides: Partial<{ name: string; subject: string; goal: string }> = {}) => {
  return prisma.session.create({
    data: {
      userId,
      name: overrides.name ?? 'Test Session',
      subject: overrides.subject ?? 'TypeScript',
      goal: overrides.goal ?? 'Learn TypeScript',
    },
  });
};

// ---------------------------------------------------------------------------
// POST /api/sessions
// ---------------------------------------------------------------------------
describe('POST /api/sessions', () => {
  it('201 — creates and returns a session', async () => {
    const { user } = await createTestUser();
    const token = getAuthToken(user);

    const res = await request(app)
      .post('/api/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'My Session', subject: 'TypeScript', goal: 'Learn TS fundamentals' });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTypeOf('string');
    expect(res.body.name).toBe('My Session');
    expect(res.body.subject).toBe('TypeScript');
    expect(res.body.createdAt).toBeTypeOf('string');
  });

  it('DB — session is persisted with correct userId', async () => {
    const { user } = await createTestUser();
    const token = getAuthToken(user);

    const res = await request(app)
      .post('/api/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'My Session', subject: 'TypeScript', goal: 'Learn TS fundamentals' });

    const dbSession = await prisma.session.findUnique({ where: { id: res.body.id } });
    expect(dbSession).not.toBeNull();
    expect(dbSession!.userId).toBe(user.id);
  });

  it('400 — missing required fields', async () => {
    const { user } = await createTestUser();
    const token = getAuthToken(user);

    const res = await request(app)
      .post('/api/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Only name' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('400 — name exceeds 200 characters', async () => {
    const { user } = await createTestUser();
    const token = getAuthToken(user);

    const res = await request(app)
      .post('/api/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'x'.repeat(201), subject: 'TypeScript', goal: 'Learn TS fundamentals' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('401 — no Authorization header', async () => {
    const res = await request(app)
      .post('/api/sessions')
      .send({ name: 'My Session', subject: 'TypeScript', goal: 'Learn TS fundamentals' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});

// ---------------------------------------------------------------------------
// GET /api/sessions
// ---------------------------------------------------------------------------
describe('GET /api/sessions', () => {
  it('200 — returns empty list when user has no sessions', async () => {
    const { user } = await createTestUser();
    const token = getAuthToken(user);

    const res = await request(app)
      .get('/api/sessions')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.sessions).toEqual([]);
    expect(res.body.nextCursor).toBeNull();
  });

  it('200 — returns sessions for the authenticated user only', async () => {
    const { user: user1 } = await createTestUser({ email: 'user1@example.com' });
    const { user: user2 } = await createTestUser({ email: 'user2@example.com' });
    const token1 = getAuthToken(user1);

    await createSession(user1.id, { name: 'Session A' });
    await createSession(user1.id, { name: 'Session B' });
    await createSession(user2.id, { name: 'Session C' }); // different user

    const res = await request(app)
      .get('/api/sessions')
      .set('Authorization', `Bearer ${token1}`);

    expect(res.status).toBe(200);
    expect(res.body.sessions).toHaveLength(2);
    expect(res.body.sessions.every((s: { name: string }) => ['Session A', 'Session B'].includes(s.name))).toBe(true);
  });

  it('200 — nextCursor is set when there are more results', async () => {
    const { user } = await createTestUser();
    const token = getAuthToken(user);

    // Create 3 sessions
    for (let i = 0; i < 3; i++) {
      await createSession(user.id, { name: `Session ${i}` });
    }

    const res = await request(app)
      .get('/api/sessions?limit=2')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.sessions).toHaveLength(2);
    expect(res.body.nextCursor).toBeTypeOf('string');
  });

  it('200 — cursor pagination fetches the next page', async () => {
    const { user } = await createTestUser();
    const token = getAuthToken(user);

    for (let i = 0; i < 3; i++) {
      await createSession(user.id, { name: `Session ${i}` });
    }

    const firstPage = await request(app)
      .get('/api/sessions?limit=2')
      .set('Authorization', `Bearer ${token}`);

    const cursor = firstPage.body.nextCursor;
    const secondPage = await request(app)
      .get(`/api/sessions?limit=2&cursor=${cursor}`)
      .set('Authorization', `Bearer ${token}`);

    expect(secondPage.status).toBe(200);
    expect(secondPage.body.sessions).toHaveLength(1);
    expect(secondPage.body.nextCursor).toBeNull();
  });

  it('401 — no Authorization header', async () => {
    const res = await request(app).get('/api/sessions');

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /api/sessions/:id
// ---------------------------------------------------------------------------
describe('GET /api/sessions/:id', () => {
  it('200 — returns session detail with empty materials and quizAttempts', async () => {
    const { user } = await createTestUser();
    const token = getAuthToken(user);
    const session = await createSession(user.id);

    const res = await request(app)
      .get(`/api/sessions/${session.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(session.id);
    expect(res.body.materials).toEqual([]);
    expect(res.body.quizAttempts).toEqual([]);
  });

  it('200 — returns seeded materials and quiz attempts in response', async () => {
    const { user } = await createTestUser();
    const token = getAuthToken(user);
    const session = await createSession(user.id);

    const material = await prisma.material.create({
      data: {
        sessionId: session.id,
        fileName: 'notes.pdf',
        fileType: 'pdf',
        extractedText: 'Sample extracted text',
        tokenCount: 150,
        status: 'ready',
      },
    });

    const quiz = await prisma.quizAttempt.create({
      data: {
        sessionId: session.id,
        userId: user.id,
        difficulty: 'easy',
        answerFormat: 'mcq',
        questionCount: 5,
        status: 'completed',
        score: 80,
      },
    });

    const res = await request(app)
      .get(`/api/sessions/${session.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.materials).toHaveLength(1);
    expect(res.body.materials[0].id).toBe(material.id);
    expect(res.body.materials[0].fileName).toBe('notes.pdf');
    expect(res.body.quizAttempts).toHaveLength(1);
    expect(res.body.quizAttempts[0].id).toBe(quiz.id);
    expect(res.body.quizAttempts[0].score).toBe(80);
  });

  it('404 — session does not exist', async () => {
    const { user } = await createTestUser();
    const token = getAuthToken(user);

    const res = await request(app)
      .get('/api/sessions/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('403 — session belongs to another user', async () => {
    const { user: owner } = await createTestUser({ email: 'owner@example.com' });
    const { user: other } = await createTestUser({ email: 'other@example.com' });
    const session = await createSession(owner.id);
    const tokenOther = getAuthToken(other);

    const res = await request(app)
      .get(`/api/sessions/${session.id}`)
      .set('Authorization', `Bearer ${tokenOther}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('400 — invalid UUID param', async () => {
    const { user } = await createTestUser();
    const token = getAuthToken(user);

    const res = await request(app)
      .get('/api/sessions/not-a-uuid')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('401 — no Authorization header', async () => {
    const res = await request(app).get('/api/sessions/00000000-0000-0000-0000-000000000000');

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/sessions/:id
// ---------------------------------------------------------------------------
describe('PATCH /api/sessions/:id', () => {
  it('200 — updates only the provided fields', async () => {
    const { user } = await createTestUser();
    const token = getAuthToken(user);
    const session = await createSession(user.id, { name: 'Original Name' });

    const res = await request(app)
      .patch(`/api/sessions/${session.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Updated Name' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Updated Name');
    expect(res.body.subject).toBe('TypeScript'); // unchanged
  });

  it('DB — persists the update', async () => {
    const { user } = await createTestUser();
    const token = getAuthToken(user);
    const session = await createSession(user.id);

    await request(app)
      .patch(`/api/sessions/${session.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Persisted Name' });

    const dbSession = await prisma.session.findUnique({ where: { id: session.id } });
    expect(dbSession!.name).toBe('Persisted Name');
  });

  it('404 — session does not exist', async () => {
    const { user } = await createTestUser();
    const token = getAuthToken(user);

    const res = await request(app)
      .patch('/api/sessions/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'X' });

    expect(res.status).toBe(404);
  });

  it('403 — session belongs to another user', async () => {
    const { user: owner } = await createTestUser({ email: 'owner@example.com' });
    const { user: other } = await createTestUser({ email: 'other@example.com' });
    const session = await createSession(owner.id);
    const tokenOther = getAuthToken(other);

    const res = await request(app)
      .patch(`/api/sessions/${session.id}`)
      .set('Authorization', `Bearer ${tokenOther}`)
      .send({ name: 'Hacked' });

    expect(res.status).toBe(403);
  });

  it('401 — no Authorization header', async () => {
    const res = await request(app)
      .patch('/api/sessions/00000000-0000-0000-0000-000000000000')
      .send({ name: 'X' });

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/sessions/:id
// ---------------------------------------------------------------------------
describe('DELETE /api/sessions/:id', () => {
  it('204 — deletes the session', async () => {
    const { user } = await createTestUser();
    const token = getAuthToken(user);
    const session = await createSession(user.id);

    const res = await request(app)
      .delete(`/api/sessions/${session.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(204);
  });

  it('DB — session is removed after delete', async () => {
    const { user } = await createTestUser();
    const token = getAuthToken(user);
    const session = await createSession(user.id);

    await request(app)
      .delete(`/api/sessions/${session.id}`)
      .set('Authorization', `Bearer ${token}`);

    const dbSession = await prisma.session.findUnique({ where: { id: session.id } });
    expect(dbSession).toBeNull();
  });

  it('DB — cascade deletes materials and quiz attempts', async () => {
    const { user } = await createTestUser();
    const token = getAuthToken(user);
    const session = await createSession(user.id);

    const material = await prisma.material.create({
      data: {
        sessionId: session.id,
        fileName: 'lecture.pdf',
        fileType: 'pdf',
        extractedText: 'Content',
        tokenCount: 200,
        status: 'ready',
      },
    });

    const quiz = await prisma.quizAttempt.create({
      data: {
        sessionId: session.id,
        userId: user.id,
        difficulty: 'medium',
        answerFormat: 'mcq',
        questionCount: 10,
        status: 'completed',
      },
    });

    await request(app)
      .delete(`/api/sessions/${session.id}`)
      .set('Authorization', `Bearer ${token}`);

    const dbMaterial = await prisma.material.findUnique({ where: { id: material.id } });
    const dbQuiz = await prisma.quizAttempt.findUnique({ where: { id: quiz.id } });
    expect(dbMaterial).toBeNull();
    expect(dbQuiz).toBeNull();
  });

  it('404 — session does not exist', async () => {
    const { user } = await createTestUser();
    const token = getAuthToken(user);

    const res = await request(app)
      .delete('/api/sessions/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it('403 — session belongs to another user', async () => {
    const { user: owner } = await createTestUser({ email: 'owner@example.com' });
    const { user: other } = await createTestUser({ email: 'other@example.com' });
    const session = await createSession(owner.id);
    const tokenOther = getAuthToken(other);

    const res = await request(app)
      .delete(`/api/sessions/${session.id}`)
      .set('Authorization', `Bearer ${tokenOther}`);

    expect(res.status).toBe(403);
  });

  it('401 — no Authorization header', async () => {
    const res = await request(app).delete('/api/sessions/00000000-0000-0000-0000-000000000000');

    expect(res.status).toBe(401);
  });
});
