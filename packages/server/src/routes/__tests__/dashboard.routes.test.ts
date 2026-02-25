import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from 'vitest';
import { execSync } from 'node:child_process';
import request from 'supertest';
import { createApp } from '../../app.js';
import { prisma, cleanDatabase, closeDatabase } from '../../__tests__/helpers/db.helper.js';
import { createTestUser, getAuthToken } from '../../__tests__/helpers/auth.helper.js';

vi.mock('../../middleware/rateLimiter.middleware.js', () => ({
  createRateLimiter: () => (_req: never, _res: never, next: () => void) => next(),
  createRateLimiterByEmailAndIp: () => [(_req: never, _res: never, next: () => void) => next()],
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
// Seed helpers
// ---------------------------------------------------------------------------
const createSession = async (userId: string, subject = 'TypeScript') => {
  return prisma.session.create({
    data: {
      userId,
      name: `${subject} Session`,
      subject,
      goal: `Learn ${subject}`,
    },
  });
};

const createQuizAttempt = async (
  userId: string,
  sessionId: string,
  overrides: { status?: string; score?: number | null } = {},
) => {
  return prisma.quizAttempt.create({
    data: {
      userId,
      sessionId,
      difficulty: 'easy',
      answerFormat: 'mcq',
      questionCount: 5,
      status: overrides.status ?? 'completed',
      score: overrides.score ?? null,
    },
  });
};

// ---------------------------------------------------------------------------
// Case 1: Unauthenticated request
// ---------------------------------------------------------------------------
describe('GET /api/dashboard — unauthenticated', () => {
  it('401 — no Authorization header', async () => {
    const res = await request(app).get('/api/dashboard');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('401 — invalid token', async () => {
    const res = await request(app)
      .get('/api/dashboard')
      .set('Authorization', 'Bearer not-a-valid-token');

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Case 2: New user — zero sessions, zero quiz attempts
// ---------------------------------------------------------------------------
describe('GET /api/dashboard — new user', () => {
  it('returns zero counts and null fields for a user with no data', async () => {
    const { user } = await createTestUser();
    const token = getAuthToken(user);

    const res = await request(app)
      .get('/api/dashboard')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      username: user.username,
      totalSessions: 0,
      totalQuizzesCompleted: 0,
      averageScore: null,
      mostPracticedSubject: null,
    });
  });
});

// ---------------------------------------------------------------------------
// Case 3: User with sessions and completed quiz attempts
// ---------------------------------------------------------------------------
describe('GET /api/dashboard — user with data', () => {
  it('returns correct aggregated stats', async () => {
    const { user } = await createTestUser();
    const token = getAuthToken(user);

    const tsSession = await createSession(user.id, 'TypeScript');
    const jsSession = await createSession(user.id, 'JavaScript');

    // 2 completed quizzes on TypeScript, 1 on JavaScript
    await createQuizAttempt(user.id, tsSession.id, { score: 80 });
    await createQuizAttempt(user.id, tsSession.id, { score: 60 });
    await createQuizAttempt(user.id, jsSession.id, { score: 90 });
    // 1 in-progress quiz (should NOT be counted)
    await createQuizAttempt(user.id, tsSession.id, { status: 'in_progress', score: null });

    const res = await request(app)
      .get('/api/dashboard')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.username).toBe(user.username);
    expect(res.body.totalSessions).toBe(2);
    expect(res.body.totalQuizzesCompleted).toBe(3);
    // avg of 80, 60, 90 = 230 / 3 = 76.67
    expect(res.body.averageScore).toBe(76.67);
    // TypeScript has 2 completed quizzes vs JavaScript's 1
    expect(res.body.mostPracticedSubject).toBe('TypeScript');
  });

  it('returns null averageScore when all quizzes are in-progress', async () => {
    const { user } = await createTestUser();
    const token = getAuthToken(user);

    const session = await createSession(user.id, 'Python');
    await createQuizAttempt(user.id, session.id, { status: 'in_progress', score: null });

    const res = await request(app)
      .get('/api/dashboard')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.totalSessions).toBe(1);
    expect(res.body.totalQuizzesCompleted).toBe(0);
    expect(res.body.averageScore).toBeNull();
    expect(res.body.mostPracticedSubject).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Case 4: User A's data does not leak into User B's dashboard
// ---------------------------------------------------------------------------
describe('GET /api/dashboard — data isolation', () => {
  it("User B sees only their own stats, not User A's", async () => {
    const { user: userA } = await createTestUser({ email: 'a@example.com', username: 'userA' });
    const { user: userB } = await createTestUser({ email: 'b@example.com', username: 'userB' });
    const tokenB = getAuthToken(userB);

    // Seed data for User A only
    const session = await createSession(userA.id, 'TypeScript');
    await createQuizAttempt(userA.id, session.id, { score: 95 });

    // User B makes the request
    const res = await request(app)
      .get('/api/dashboard')
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.status).toBe(200);
    expect(res.body.username).toBe('userB');
    expect(res.body.totalSessions).toBe(0);
    expect(res.body.totalQuizzesCompleted).toBe(0);
    expect(res.body.averageScore).toBeNull();
    expect(res.body.mostPracticedSubject).toBeNull();
  });
});
