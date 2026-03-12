import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from 'vitest';
import { execSync } from 'node:child_process';
import request from 'supertest';
import { QuizDifficulty, AnswerFormat, QuestionType, QuizStatus, MaterialStatus, MIN_QUESTION_COUNT, KeySource } from '@skills-trainer/shared';
import type { LlmGeneratedQuestion } from '@skills-trainer/shared';

// vi.mock calls are hoisted — mock factories run before imports.
vi.mock('../../middleware/rateLimiter.middleware.js', () => ({
  createRateLimiter: () => (_req: never, _res: never, next: () => void) => next(),
  createRateLimiterByEmailAndIp: () => [(_req: never, _res: never, next: () => void) => next()],
  globalRateLimiter: (_req: never, _res: never, next: () => void) => next(),
  quizGenerationHourlyLimiter: (_req: never, _res: never, next: () => void) => next(),
  quizGenerationDailyLimiter: (_req: never, _res: never, next: () => void) => next(),
  regradeRateLimiter: (_req: never, _res: never, next: () => void) => next(),
}));

vi.mock('../../services/llm.service.js', () => ({
  generateQuiz: vi.fn(),
  gradeAnswers: vi.fn(),
}));

import { createApp } from '../../app.js';
import { prisma, cleanDatabase, closeDatabase } from '../../__tests__/helpers/db.helper.js';
import { createTestUser, getAuthToken } from '../../__tests__/helpers/auth.helper.js';
import { createQuizWithAnswers } from '../../__tests__/helpers/quiz.helper.js';
import { generateQuiz as llmGenerateQuiz } from '../../services/llm.service.js';

const app = createApp();

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const VALID_LLM_QUESTION: LlmGeneratedQuestion = {
  questionNumber: 1,
  questionType: QuestionType.MCQ,
  questionText: 'What does TypeScript add to JavaScript?',
  options: ['Static typing', 'Dynamic typing', 'Garbage collection', 'JIT compilation'],
  correctAnswer: 'Static typing',
  explanation: 'TypeScript extends JavaScript by adding static type checking.',
  difficulty: QuizDifficulty.EASY,
  tags: ['typescript'],
};

const FIVE_VALID_LLM_QUESTIONS: LlmGeneratedQuestion[] = Array.from({ length: 5 }, (_, index) => ({
  ...VALID_LLM_QUESTION,
  questionNumber: index + 1,
  questionText: `What does TypeScript add to JavaScript? (${index + 1})`,
}));

// Query string used in every happy-path test.
const VALID_QUERY = `difficulty=${QuizDifficulty.EASY}&format=${AnswerFormat.MCQ}&count=${MIN_QUESTION_COUNT}`;

// ---------------------------------------------------------------------------
// Helpers — create DB records directly (bypass routes)
// ---------------------------------------------------------------------------

const createSession = async (userId: string) =>
  prisma.session.create({
    data: {
      userId,
      name: 'Test Session',
      subject: 'TypeScript',
      goal: 'Learn TypeScript basics',
    },
  });

const createMaterial = async (sessionId: string, extractedText = 'TypeScript is a typed superset.') =>
  prisma.material.create({
    data: {
      sessionId,
      fileName: 'notes.pdf',
      fileType: 'pdf',
      extractedText,
      tokenCount: 10,
      status: MaterialStatus.READY,
    },
  });

/** Splits a raw SSE response body into individual parsed event objects. */
const parseSSEEvents = (body: string): Record<string, unknown>[] =>
  body
    .split('\n\n')
    .filter((chunk) => chunk.startsWith('data: '))
    .map((chunk) => JSON.parse(chunk.slice('data: '.length)));

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

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
// Happy path
// ---------------------------------------------------------------------------

describe('GET /api/sessions/:sessionId/quizzes/generate — happy path', () => {
  it('200 with Content-Type text/event-stream', async () => {
    vi.mocked(llmGenerateQuiz).mockResolvedValue(FIVE_VALID_LLM_QUESTIONS);
    const { user } = await createTestUser();
    const token = await getAuthToken(user);
    const session = await createSession(user.id);

    const res = await request(app)
      .get(`/api/sessions/${session.id}/quizzes/generate?${VALID_QUERY}`)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
  });

  it('SSE stream contains progress, question, and complete events', async () => {
    vi.mocked(llmGenerateQuiz).mockResolvedValue(FIVE_VALID_LLM_QUESTIONS);
    const { user } = await createTestUser();
    const token = await getAuthToken(user);
    const session = await createSession(user.id);

    const res = await request(app)
      .get(`/api/sessions/${session.id}/quizzes/generate?${VALID_QUERY}`)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true);

    const types = parseSSEEvents(res.text).map((e) => e.type);
    expect(types).toContain('progress');
    expect(types).toContain('question');
    expect(types).toContain('complete');
    expect(types[types.length - 1]).toBe('complete');
  });

  it('question SSE event does NOT include correctAnswer or explanation', async () => {
    vi.mocked(llmGenerateQuiz).mockResolvedValue(FIVE_VALID_LLM_QUESTIONS);
    const { user } = await createTestUser();
    const token = await getAuthToken(user);
    const session = await createSession(user.id);

    const res = await request(app)
      .get(`/api/sessions/${session.id}/quizzes/generate?${VALID_QUERY}`)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true);

    const events = parseSSEEvents(res.text);
    const questionEvent = events.find((e) => e.type === 'question') as {
      type: string;
      data: Record<string, unknown>;
    };
    expect(questionEvent).toBeDefined();
    expect(questionEvent.data).not.toHaveProperty('correctAnswer');
    expect(questionEvent.data).not.toHaveProperty('explanation');
  });

  it('question SSE event includes id, questionNumber, questionType, questionText, options', async () => {
    vi.mocked(llmGenerateQuiz).mockResolvedValue(FIVE_VALID_LLM_QUESTIONS);
    const { user } = await createTestUser();
    const token = await getAuthToken(user);
    const session = await createSession(user.id);

    const res = await request(app)
      .get(`/api/sessions/${session.id}/quizzes/generate?${VALID_QUERY}`)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true);

    const events = parseSSEEvents(res.text);
    const qEvent = events.find((e) => e.type === 'question') as { type: string; data: Record<string, unknown> };
    expect(qEvent.data).toHaveProperty('id');
    expect(qEvent.data).toHaveProperty('questionNumber', 1);
    expect(qEvent.data).toHaveProperty('questionType', QuestionType.MCQ);
    expect(qEvent.data).toHaveProperty('questionText');
    expect(qEvent.data).toHaveProperty('options');
  });

  it('complete event carries a quizAttemptId', async () => {
    vi.mocked(llmGenerateQuiz).mockResolvedValue(FIVE_VALID_LLM_QUESTIONS);
    const { user } = await createTestUser();
    const token = await getAuthToken(user);
    const session = await createSession(user.id);

    const res = await request(app)
      .get(`/api/sessions/${session.id}/quizzes/generate?${VALID_QUERY}`)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true);

    const events = parseSSEEvents(res.text);
    const completeEvent = events.find((e) => e.type === 'complete') as {
      type: string;
      data: { quizAttemptId: string };
    };
    expect(completeEvent).toBeDefined();
    expect(typeof completeEvent.data.quizAttemptId).toBe('string');
  });

  it('DB — quiz_attempt is in_progress with correct questionCount after successful generation', async () => {
    vi.mocked(llmGenerateQuiz).mockResolvedValue(FIVE_VALID_LLM_QUESTIONS);
    const { user } = await createTestUser();
    const token = await getAuthToken(user);
    const session = await createSession(user.id);

    const res = await request(app)
      .get(`/api/sessions/${session.id}/quizzes/generate?${VALID_QUERY}`)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true);

    const events = parseSSEEvents(res.text);
    const completeEvent = events.find((e) => e.type === 'complete') as {
      type: string;
      data: { quizAttemptId: string };
    };
    const attempt = await prisma.quizAttempt.findUnique({
      where: { id: completeEvent.data.quizAttemptId },
    });
    expect(attempt?.status).toBe(QuizStatus.IN_PROGRESS);
    expect(attempt?.questionCount).toBe(5);
    // startedAt is null after generation; it is set when the user first opens the quiz.
    expect(attempt?.startedAt).toBeNull();
  });

  it('DB — free-trial generation enforces MCQ format even when free_text is requested', async () => {
    vi.mocked(llmGenerateQuiz).mockResolvedValue(FIVE_VALID_LLM_QUESTIONS);
    const { user } = await createTestUser();
    const session = await createSession(user.id);
    const freeTextQuery = `difficulty=${QuizDifficulty.EASY}&format=${AnswerFormat.FREE_TEXT}&count=${MIN_QUESTION_COUNT}`;

    const res = await request(app)
      .get(`/api/sessions/${session.id}/quizzes/generate?${freeTextQuery}`)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true);

    const events = parseSSEEvents(res.text);
    const completeEvent = events.find((e) => e.type === 'complete') as {
      type: string;
      data: { quizAttemptId: string };
    };
    const attempt = await prisma.quizAttempt.findUnique({
      where: { id: completeEvent.data.quizAttemptId },
    });

    expect(attempt?.answerFormat).toBe(AnswerFormat.MCQ);
  });

  it('DB — one question and one answer record exist after successful generation', async () => {
    vi.mocked(llmGenerateQuiz).mockResolvedValue(FIVE_VALID_LLM_QUESTIONS);
    const { user } = await createTestUser();
    const token = await getAuthToken(user);
    const session = await createSession(user.id);

    const res = await request(app)
      .get(`/api/sessions/${session.id}/quizzes/generate?${VALID_QUERY}`)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true);

    const events = parseSSEEvents(res.text);
    const completeEvent = events.find((e) => e.type === 'complete') as {
      type: string;
      data: { quizAttemptId: string };
    };
    const { quizAttemptId } = completeEvent.data;
    const [questions, answers] = await Promise.all([
      prisma.question.findMany({ where: { quizAttemptId } }),
      prisma.answer.findMany({ where: { quizAttemptId } }),
    ]);
    expect(questions).toHaveLength(5);
    expect(answers).toHaveLength(5);
  });

  it('passes materialsText from ready materials to the LLM call', async () => {
    vi.mocked(llmGenerateQuiz).mockResolvedValue(FIVE_VALID_LLM_QUESTIONS);
    const { user } = await createTestUser();
    const session = await createSession(user.id);
    await createMaterial(session.id, 'Specific extracted content for the test');

    await request(app)
      .get(`/api/sessions/${session.id}/quizzes/generate?${VALID_QUERY}`)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true);

    expect(llmGenerateQuiz).toHaveBeenCalledWith(
      expect.objectContaining({ materialsText: 'Specific extracted content for the test' }),
      expect.any(Function),
      undefined, // free-trial user — no stored API key
    );
  });

  it('passes materialsText as null when session has no ready materials', async () => {
    vi.mocked(llmGenerateQuiz).mockResolvedValue(FIVE_VALID_LLM_QUESTIONS);
    const { user } = await createTestUser();
    const session = await createSession(user.id);

    await request(app)
      .get(`/api/sessions/${session.id}/quizzes/generate?${VALID_QUERY}`)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true);

    expect(llmGenerateQuiz).toHaveBeenCalledWith(
      expect.objectContaining({ materialsText: null }),
      expect.any(Function),
      undefined, // free-trial user — no stored API key
    );
  });
});

// ---------------------------------------------------------------------------
// BYOK — save key then generate (AC1 integrated persistence flow)
// ---------------------------------------------------------------------------

describe('BYOK — save API key then generate quiz (AC1)', () => {
  const BYOK_API_KEY = 'sk-ant-test-byok-nonsecret-value-1234567890abcdef';

  it('generates quiz using the stored user API key after free trial is used', async () => {
    vi.mocked(llmGenerateQuiz).mockResolvedValue(FIVE_VALID_LLM_QUESTIONS);
    const { user } = await createTestUser();
    const session = await createSession(user.id);

    // Step 1: save the API key
    const saveRes = await request(app)
      .post('/api/users/api-key')
      .set('Authorization', `Bearer ${token}`)
      .send({ apiKey: BYOK_API_KEY });
    expect(saveRes.status).toBe(200);
    expect(saveRes.body.hasApiKey).toBe(true);

    // Step 2: simulate free trial already used (set freeTrialUsedAt directly)
    await prisma.user.update({
      where: { id: user.id },
      data: { freeTrialUsedAt: new Date() },
    });

    // Step 3: generate — should succeed using the stored key
    const genRes = await request(app)
      .get(`/api/sessions/${session.id}/quizzes/generate?${VALID_QUERY}`)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true);

    expect(genRes.status).toBe(200);
    expect(genRes.headers['content-type']).toContain('text/event-stream');

    // The decrypted stored key must be passed to the LLM call as the third argument
    expect(llmGenerateQuiz).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Function),
      BYOK_API_KEY,
    );
  });

  it('403 TRIAL_EXHAUSTED when free trial is used but no key is saved', async () => {
    const { user } = await createTestUser({ email: 'exhausted@example.com', username: 'exhausted' });
    const session = await createSession(user.id);

    await prisma.user.update({
      where: { id: user.id },
      data: { freeTrialUsedAt: new Date() },
    });

    const res = await request(app)
      .get(`/api/sessions/${session.id}/quizzes/generate?${VALID_QUERY}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('TRIAL_EXHAUSTED');
  });
});

// ---------------------------------------------------------------------------
// Pre-stream errors — returned as standard JSON before SSE headers
// ---------------------------------------------------------------------------

describe('GET /api/sessions/:sessionId/quizzes/generate — pre-stream errors', () => {
  it('401 — no Authorization header', async () => {
    const res = await request(app).get(
      `/api/sessions/00000000-0000-0000-0000-000000000001/quizzes/generate?${VALID_QUERY}`,
    );

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('400 — invalid difficulty value', async () => {
    const { user } = await createTestUser();
    const token = await getAuthToken(user);
    const session = await createSession(user.id);

    const res = await request(app)
      .get(`/api/sessions/${session.id}/quizzes/generate?difficulty=invalid&format=mcq&count=5`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('400 — missing required query params', async () => {
    const { user } = await createTestUser();
    const token = await getAuthToken(user);
    const session = await createSession(user.id);

    const res = await request(app)
      .get(`/api/sessions/${session.id}/quizzes/generate`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('404 — session does not exist', async () => {
    const { user } = await createTestUser();

    const res = await request(app)
      .get(`/api/sessions/00000000-0000-0000-0000-000000000001/quizzes/generate?${VALID_QUERY}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('403 — session belongs to a different user', async () => {
    const { user: owner } = await createTestUser({ email: 'owner@example.com', username: 'owner' });
    const { user: other } = await createTestUser({ email: 'other@example.com', username: 'other' });
    const tokenOther = await getAuthToken(other);
    const session = await createSession(owner.id);

    const res = await request(app)
      .get(`/api/sessions/${session.id}/quizzes/generate?${VALID_QUERY}`)
      .set('Authorization', `Bearer ${tokenOther}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('409 — another generation is already in progress for the session', async () => {
    const { user } = await createTestUser();
    const session = await createSession(user.id);

    // Seed a GENERATING attempt directly to simulate the concurrency scenario.
    await prisma.quizAttempt.create({
      data: {
        sessionId: session.id,
        userId: user.id,
        difficulty: QuizDifficulty.EASY,
        answerFormat: AnswerFormat.MCQ,
        questionCount: 1,
        materialsUsed: false,
        keySource: KeySource.SERVER_KEY,
        status: QuizStatus.GENERATING,
      },
    });

    const res = await request(app)
      .get(`/api/sessions/${session.id}/quizzes/generate?${VALID_QUERY}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });
});

// ---------------------------------------------------------------------------
// LLM failure — mid-stream error event
// ---------------------------------------------------------------------------

describe('GET /api/sessions/:sessionId/quizzes/generate — LLM failure', () => {
  it('sends an SSE error event (not a JSON error) when the LLM throws', async () => {
    vi.mocked(llmGenerateQuiz).mockRejectedValue(new Error('Anthropic unavailable'));
    const { user } = await createTestUser();
    const token = await getAuthToken(user);
    const session = await createSession(user.id);

    const res = await request(app)
      .get(`/api/sessions/${session.id}/quizzes/generate?${VALID_QUERY}`)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true);

    // Headers were already written (200) before the error occurred.
    expect(res.status).toBe(200);
    const events = parseSSEEvents(res.text);
    const errorEvent = events.find((e) => e.type === 'error');
    expect(errorEvent).toBeDefined();
  });

  it('does not send a complete event when the LLM throws', async () => {
    vi.mocked(llmGenerateQuiz).mockRejectedValue(new Error('Anthropic unavailable'));
    const { user } = await createTestUser();
    const token = await getAuthToken(user);
    const session = await createSession(user.id);

    const res = await request(app)
      .get(`/api/sessions/${session.id}/quizzes/generate?${VALID_QUERY}`)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true);

    const events = parseSSEEvents(res.text);
    expect(events.some((e) => e.type === 'complete')).toBe(false);
  });

  it('does not consume free trial on generation failure and allows retry', async () => {
    vi.mocked(llmGenerateQuiz).mockRejectedValueOnce(new Error('Anthropic unavailable'));
    const { user } = await createTestUser();
    const session = await createSession(user.id);
    const token = await getAuthToken(user);

    const failedRes = await request(app)
      .get(`/api/sessions/${session.id}/quizzes/generate?${VALID_QUERY}`)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true);

    const failedEvents = parseSSEEvents(failedRes.text);
    expect(failedEvents.some((e) => e.type === 'error')).toBe(true);
    expect(failedEvents.some((e) => e.type === 'complete')).toBe(false);

    const refreshedUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { freeTrialUsedAt: true },
    });
    expect(refreshedUser?.freeTrialUsedAt).toBeNull();

    const generatingAttempts = await prisma.quizAttempt.count({
      where: { sessionId: session.id, status: QuizStatus.GENERATING },
    });
    expect(generatingAttempts).toBe(0);

    vi.mocked(llmGenerateQuiz).mockResolvedValueOnce(FIVE_VALID_LLM_QUESTIONS);
    const retryRes = await request(app)
      .get(`/api/sessions/${session.id}/quizzes/generate?${VALID_QUERY}`)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true);

    const retryEvents = parseSSEEvents(retryRes.text);
    expect(retryEvents.some((e) => e.type === 'complete')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// GET /api/quizzes/:id
// ---------------------------------------------------------------------------

describe('GET /api/quizzes/:id', () => {
  it('200 — returns quiz with questions (no correctAnswer exposed)', async () => {
    const { user } = await createTestUser();
    const session = await createSession(user.id);
    const { attemptId } = await createQuizWithAnswers(user.id, session.id);

    const res = await request(app)
      .get(`/api/quizzes/${attemptId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(attemptId);
    expect(res.body.questions[0]).not.toHaveProperty('correctAnswer');
    expect(res.body.questions[0]).not.toHaveProperty('explanation');
  });

  it('200 — question includes id, questionNumber, questionType, questionText, options', async () => {
    const { user } = await createTestUser();
    const session = await createSession(user.id);
    const { attemptId } = await createQuizWithAnswers(user.id, session.id);

    const res = await request(app)
      .get(`/api/quizzes/${attemptId}`)
      .set('Authorization', `Bearer ${token}`);

    const q = res.body.questions[0] as Record<string, unknown>;
    expect(q).toHaveProperty('id');
    expect(q).toHaveProperty('questionNumber', 1);
    expect(q).toHaveProperty('questionType');
    expect(q).toHaveProperty('questionText');
    expect(q).toHaveProperty('options');
  });

  it('401 — no Authorization header', async () => {
    const res = await request(app).get(
      '/api/quizzes/00000000-0000-0000-0000-000000000001',
    );

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('404 — quiz attempt does not exist', async () => {
    const { user } = await createTestUser();

    const res = await request(app)
      .get('/api/quizzes/00000000-0000-0000-0000-000000000001')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('403 — quiz belongs to a different user', async () => {
    const { user: owner } = await createTestUser({ email: 'owner@example.com', username: 'owner' });
    const { user: other } = await createTestUser({ email: 'other@example.com', username: 'other' });
    const tokenOther = await getAuthToken(other);
    const session = await createSession(owner.id);
    const { attemptId } = await createQuizWithAnswers(owner.id, session.id);

    const res = await request(app)
      .get(`/api/quizzes/${attemptId}`)
      .set('Authorization', `Bearer ${tokenOther}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/quizzes/:id/answers
// ---------------------------------------------------------------------------

describe('PATCH /api/quizzes/:id/answers', () => {
  it('200 — returns { saved: 1 } when one valid answer is submitted', async () => {
    const { user } = await createTestUser();
    const session = await createSession(user.id);
    const { attemptId, questionId } = await createQuizWithAnswers(user.id, session.id);

    const res = await request(app)
      .patch(`/api/quizzes/${attemptId}/answers`)
      .set('Authorization', `Bearer ${token}`)
      .send({ answers: [{ questionId, answer: 'A typed superset of JavaScript' }] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ saved: 1 });
  });

  it('200 — returns { saved: 0 } for invalid questionId (silently filtered)', async () => {
    const { user } = await createTestUser();
    const session = await createSession(user.id);
    const { attemptId } = await createQuizWithAnswers(user.id, session.id);

    const res = await request(app)
      .patch(`/api/quizzes/${attemptId}/answers`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        answers: [{ questionId: '00000000-0000-0000-0000-000000000001', answer: 'X' }],
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ saved: 0 });
  });

  it('401 — no Authorization header', async () => {
    const res = await request(app)
      .patch('/api/quizzes/00000000-0000-0000-0000-000000000001/answers')
      .send({ answers: [] });

    expect(res.status).toBe(401);
  });

  it('409 — quiz is not in_progress (completed)', async () => {
    const { user } = await createTestUser();
    const session = await createSession(user.id);
    const { attemptId, questionId } = await createQuizWithAnswers(user.id, session.id);

    // Mark the attempt as completed directly in DB
    await prisma.quizAttempt.update({
      where: { id: attemptId },
      data: { status: QuizStatus.COMPLETED, score: 100, completedAt: new Date() },
    });

    const res = await request(app)
      .patch(`/api/quizzes/${attemptId}/answers`)
      .set('Authorization', `Bearer ${token}`)
      .send({ answers: [{ questionId, answer: 'A' }] });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('400 — invalid body (answers is not an array)', async () => {
    const { user } = await createTestUser();
    const session = await createSession(user.id);
    const { attemptId } = await createQuizWithAnswers(user.id, session.id);

    const res = await request(app)
      .patch(`/api/quizzes/${attemptId}/answers`)
      .set('Authorization', `Bearer ${token}`)
      .send({ answers: 'not-an-array' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

// ---------------------------------------------------------------------------
// POST /api/quizzes/:id/submit — pre-stream errors (JSON)
// ---------------------------------------------------------------------------

describe('POST /api/quizzes/:id/submit — pre-stream errors', () => {
  it('401 — no Authorization header', async () => {
    const res = await request(app)
      .post('/api/quizzes/00000000-0000-0000-0000-000000000001/submit')
      .send({ answers: [] });

    expect(res.status).toBe(401);
  });

  it('404 — quiz attempt does not exist', async () => {
    const { user } = await createTestUser();

    const res = await request(app)
      .post('/api/quizzes/00000000-0000-0000-0000-000000000001/submit')
      .set('Authorization', `Bearer ${token}`)
      .send({ answers: [] });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('409 — quiz is already completed', async () => {
    const { user } = await createTestUser();
    const session = await createSession(user.id);
    const { attemptId } = await createQuizWithAnswers(user.id, session.id);
    await prisma.quizAttempt.update({
      where: { id: attemptId },
      data: { status: QuizStatus.COMPLETED, score: 100, completedAt: new Date() },
    });

    const res = await request(app)
      .post(`/api/quizzes/${attemptId}/submit`)
      .set('Authorization', `Bearer ${token}`)
      .send({ answers: [] });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('400 — not all questions answered (empty payload, no prior answers)', async () => {
    const { user } = await createTestUser();
    const session = await createSession(user.id);
    const { attemptId } = await createQuizWithAnswers(user.id, session.id);

    const res = await request(app)
      .post(`/api/quizzes/${attemptId}/submit`)
      .set('Authorization', `Bearer ${token}`)
      .send({ answers: [] });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });
});

// ---------------------------------------------------------------------------
// POST /api/quizzes/:id/submit — happy path (SSE)
// ---------------------------------------------------------------------------

describe('POST /api/quizzes/:id/submit — happy path', () => {
  it('200 with Content-Type text/event-stream', async () => {
    const { user } = await createTestUser();
    const session = await createSession(user.id);
    const { attemptId, questionId } = await createQuizWithAnswers(user.id, session.id);

    const res = await request(app)
      .post(`/api/quizzes/${attemptId}/submit`)
      .set('Authorization', `Bearer ${token}`)
      .send({ answers: [{ questionId, answer: 'A typed superset of JavaScript' }] })
      .buffer(true);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
  });

  it('SSE stream contains progress, graded, and complete events', async () => {
    const { user } = await createTestUser();
    const session = await createSession(user.id);
    const { attemptId, questionId } = await createQuizWithAnswers(user.id, session.id);

    const res = await request(app)
      .post(`/api/quizzes/${attemptId}/submit`)
      .set('Authorization', `Bearer ${token}`)
      .send({ answers: [{ questionId, answer: 'A typed superset of JavaScript' }] })
      .buffer(true);

    const types = parseSSEEvents(res.text).map((e) => e.type);
    expect(types).toContain('progress');
    expect(types).toContain('graded');
    expect(types).toContain('complete');
  });

  it('complete event carries quizAttemptId and score', async () => {
    const { user } = await createTestUser();
    const session = await createSession(user.id);
    const { attemptId, questionId } = await createQuizWithAnswers(user.id, session.id);

    const res = await request(app)
      .post(`/api/quizzes/${attemptId}/submit`)
      .set('Authorization', `Bearer ${token}`)
      .send({ answers: [{ questionId, answer: 'A typed superset of JavaScript' }] })
      .buffer(true);

    const events = parseSSEEvents(res.text);
    const completeEvent = events.find((e) => e.type === 'complete') as {
      type: string;
      data: { quizAttemptId: string; score: number };
    };
    expect(completeEvent).toBeDefined();
    expect(completeEvent.data.quizAttemptId).toBe(attemptId);
    expect(typeof completeEvent.data.score).toBe('number');
  });

  it('DB — quiz is COMPLETED with score 100 after correct MCQ answer', async () => {
    const { user } = await createTestUser();
    const session = await createSession(user.id);
    const { attemptId, questionId } = await createQuizWithAnswers(user.id, session.id);

    const res = await request(app)
      .post(`/api/quizzes/${attemptId}/submit`)
      .set('Authorization', `Bearer ${token}`)
      .send({ answers: [{ questionId, answer: 'A typed superset of JavaScript' }] })
      .buffer(true);

    // Wait for stream to complete
    const events = parseSSEEvents(res.text);
    expect(events.some((e) => e.type === 'complete')).toBe(true);

    const attempt = await prisma.quizAttempt.findUnique({ where: { id: attemptId } });
    expect(attempt?.status).toBe(QuizStatus.COMPLETED);
    expect(Number(attempt?.score)).toBe(100);
  });

  it('DB — quiz is COMPLETED with score 0 after incorrect MCQ answer', async () => {
    const { user } = await createTestUser();
    const session = await createSession(user.id);
    const { attemptId, questionId } = await createQuizWithAnswers(user.id, session.id);

    const res = await request(app)
      .post(`/api/quizzes/${attemptId}/submit`)
      .set('Authorization', `Bearer ${token}`)
      .send({ answers: [{ questionId, answer: 'Wrong answer' }] })
      .buffer(true);

    const events = parseSSEEvents(res.text);
    expect(events.some((e) => e.type === 'complete')).toBe(true);

    const attempt = await prisma.quizAttempt.findUnique({ where: { id: attemptId } });
    expect(attempt?.status).toBe(QuizStatus.COMPLETED);
    expect(Number(attempt?.score)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// GET /api/quizzes/:id/results
// ---------------------------------------------------------------------------

describe('GET /api/quizzes/:id/results', () => {
  it('200 — returns results with correctAnswer, explanation, and per-answer data', async () => {
    const { user } = await createTestUser();
    const session = await createSession(user.id);
    const { attemptId, questionId } = await createQuizWithAnswers(user.id, session.id);

    // Simulate grading by marking the attempt COMPLETED directly
    await prisma.quizAttempt.update({
      where: { id: attemptId },
      data: { status: QuizStatus.COMPLETED, score: 100, completedAt: new Date() },
    });
    await prisma.answer.update({
      where: { questionId },
      data: {
        userAnswer: 'A typed superset of JavaScript',
        isCorrect: true,
        score: 1,
        gradedAt: new Date(),
      },
    });

    const res = await request(app)
      .get(`/api/quizzes/${attemptId}/results`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.questions[0]).toHaveProperty('correctAnswer');
    expect(res.body.questions[0]).toHaveProperty('explanation');
    expect(res.body.questions[0].answer.isCorrect).toBe(true);
    expect(res.body.questions[0].answer.score).toBe(1);
  });

  it('200 — summary counts are correct (1 correct)', async () => {
    const { user } = await createTestUser();
    const session = await createSession(user.id);
    const { attemptId, questionId } = await createQuizWithAnswers(user.id, session.id);

    await prisma.quizAttempt.update({
      where: { id: attemptId },
      data: { status: QuizStatus.COMPLETED, score: 100, completedAt: new Date() },
    });
    await prisma.answer.update({
      where: { questionId },
      data: { userAnswer: 'A typed superset of JavaScript', isCorrect: true, score: 1, gradedAt: new Date() },
    });

    const res = await request(app)
      .get(`/api/quizzes/${attemptId}/results`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.summary).toMatchObject({ correct: 1, partial: 0, incorrect: 0, total: 1 });
  });

  it('400 — quiz is not yet completed', async () => {
    const { user } = await createTestUser();
    const session = await createSession(user.id);
    const { attemptId } = await createQuizWithAnswers(user.id, session.id);

    const res = await request(app)
      .get(`/api/quizzes/${attemptId}/results`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });

  it('401 — no Authorization header', async () => {
    const res = await request(app).get(
      '/api/quizzes/00000000-0000-0000-0000-000000000001/results',
    );

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /api/quizzes/:id/regrade — pre-stream errors (JSON)
// ---------------------------------------------------------------------------

describe('POST /api/quizzes/:id/regrade — pre-stream errors', () => {
  it('401 — no Authorization header', async () => {
    const res = await request(app)
      .post('/api/quizzes/00000000-0000-0000-0000-000000000001/regrade')
      .send({});

    expect(res.status).toBe(401);
  });

  it('409 — quiz is IN_PROGRESS (not submitted_ungraded)', async () => {
    const { user } = await createTestUser();
    const session = await createSession(user.id);
    const { attemptId } = await createQuizWithAnswers(user.id, session.id);

    const res = await request(app)
      .post(`/api/quizzes/${attemptId}/regrade`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });
});

// ---------------------------------------------------------------------------
// POST /api/quizzes/:id/regrade — happy path (SSE)
// ---------------------------------------------------------------------------

describe('POST /api/quizzes/:id/regrade — happy path', () => {
  it('200 with Content-Type text/event-stream for a SUBMITTED_UNGRADED quiz', async () => {
    const { user } = await createTestUser();
    const session = await createSession(user.id);
    const { attemptId, questionId } = await createQuizWithAnswers(user.id, session.id);

    // Seed answer and set status to submitted_ungraded
    await prisma.answer.update({
      where: { questionId },
      data: { userAnswer: 'A typed superset of JavaScript', answeredAt: new Date() },
    });
    await prisma.quizAttempt.update({
      where: { id: attemptId },
      data: { status: QuizStatus.SUBMITTED_UNGRADED },
    });

    const res = await request(app)
      .post(`/api/quizzes/${attemptId}/regrade`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .buffer(true);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    const events = parseSSEEvents(res.text);
    expect(events.some((e) => e.type === 'complete')).toBe(true);
  });

  it('DB — quiz is COMPLETED after successful regrade', async () => {
    const { user } = await createTestUser();
    const session = await createSession(user.id);
    const { attemptId, questionId } = await createQuizWithAnswers(user.id, session.id);

    await prisma.answer.update({
      where: { questionId },
      data: { userAnswer: 'A typed superset of JavaScript', answeredAt: new Date() },
    });
    await prisma.quizAttempt.update({
      where: { id: attemptId },
      data: { status: QuizStatus.SUBMITTED_UNGRADED },
    });

    const res = await request(app)
      .post(`/api/quizzes/${attemptId}/regrade`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .buffer(true);

    expect(parseSSEEvents(res.text).some((e) => e.type === 'complete')).toBe(true);

    const attempt = await prisma.quizAttempt.findUnique({ where: { id: attemptId } });
    expect(attempt?.status).toBe(QuizStatus.COMPLETED);
  });
});

// ---------------------------------------------------------------------------
// DB schema constraints (refactor-quiz-key-source RFC AC 8)
// ---------------------------------------------------------------------------
describe('quiz_attempts.key_source — schema constraint', () => {
  it('DB — omitting key_source causes database error (no default)', async () => {
    const { user } = await createTestUser();
    const session = await createSession(user.id);

    // Raw SQL insert without key_source to verify DB rejects (NOT NULL, no default)
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO quiz_attempts (id, session_id, user_id, difficulty, answer_format, question_count, materials_used, status, created_at, updated_at)
         VALUES (gen_random_uuid(), $1::uuid, $2::uuid, 'easy', 'mcq', 5, false, 'completed', NOW(), NOW())`,
        session.id,
        user.id,
      ),
    ).rejects.toThrow();
  });
});

