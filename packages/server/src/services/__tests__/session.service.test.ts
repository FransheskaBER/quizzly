import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../config/database.js', () => ({
  prisma: {
    session: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import { prisma } from '../../config/database.js';
import * as sessionService from '../session.service.js';
import { NotFoundError, ForbiddenError } from '../../utils/errors.js';

const USER_ID = 'user-uuid-123';
const OTHER_USER_ID = 'user-uuid-456';
const SESSION_ID = 'session-uuid-abc';

const mockSession = {
  id: SESSION_ID,
  userId: USER_ID,
  name: 'TypeScript Basics',
  subject: 'TypeScript',
  goal: 'Learn TypeScript fundamentals',
  promptConfig: null,
  createdAt: new Date('2024-01-01T10:00:00Z'),
  updatedAt: new Date('2024-01-01T10:00:00Z'),
};

const mockSessionWithCount = {
  ...mockSession,
  _count: { materials: 2, quizAttempts: 1 },
};

const mockSessionWithIncludes = {
  ...mockSession,
  materials: [],
  quizAttempts: [],
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// createSession
// ---------------------------------------------------------------------------
describe('createSession', () => {
  it('creates and returns a SessionResponse', async () => {
    vi.mocked(prisma.session.create).mockResolvedValue(mockSession);

    const result = await sessionService.createSession(
      { name: 'TypeScript Basics', subject: 'TypeScript', goal: 'Learn TypeScript fundamentals' },
      USER_ID,
    );

    expect(prisma.session.create).toHaveBeenCalledWith({
      data: {
        userId: USER_ID,
        name: 'TypeScript Basics',
        subject: 'TypeScript',
        goal: 'Learn TypeScript fundamentals',
      },
    });
    expect(result.id).toBe(SESSION_ID);
    expect(result.name).toBe('TypeScript Basics');
    expect(result.createdAt).toBe(mockSession.createdAt.toISOString());
  });

  it('returns ISO string timestamps', async () => {
    vi.mocked(prisma.session.create).mockResolvedValue(mockSession);

    const result = await sessionService.createSession(
      { name: 'Session', subject: 'Math', goal: 'Study' },
      USER_ID,
    );

    expect(typeof result.createdAt).toBe('string');
    expect(typeof result.updatedAt).toBe('string');
    // ISO format check
    expect(result.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// ---------------------------------------------------------------------------
// listSessions
// ---------------------------------------------------------------------------
describe('listSessions', () => {
  it('returns sessions and null nextCursor when results fit within limit', async () => {
    vi.mocked(prisma.session.findMany).mockResolvedValue([mockSessionWithCount]);

    const result = await sessionService.listSessions({ limit: 20 }, USER_ID);

    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].materialCount).toBe(2);
    expect(result.sessions[0].quizCount).toBe(1);
    expect(result.nextCursor).toBeNull();
  });

  it('returns nextCursor when there are more results than limit', async () => {
    // Return limit + 1 items to signal there are more
    const items = Array.from({ length: 3 }, (_, i) => ({
      ...mockSessionWithCount,
      id: `session-${i}`,
    }));
    vi.mocked(prisma.session.findMany).mockResolvedValue(items);

    const result = await sessionService.listSessions({ limit: 2 }, USER_ID);

    expect(result.sessions).toHaveLength(2); // only limit items returned
    expect(result.nextCursor).toBe('session-1'); // last item's id
  });

  it('passes cursor and skip:1 to Prisma when cursor is provided', async () => {
    vi.mocked(prisma.session.findMany).mockResolvedValue([mockSessionWithCount]);

    await sessionService.listSessions({ cursor: SESSION_ID, limit: 20 }, USER_ID);

    expect(prisma.session.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        cursor: { id: SESSION_ID },
        skip: 1,
      }),
    );
  });

  it('returns empty list when user has no sessions', async () => {
    vi.mocked(prisma.session.findMany).mockResolvedValue([]);

    const result = await sessionService.listSessions({ limit: 20 }, USER_ID);

    expect(result.sessions).toHaveLength(0);
    expect(result.nextCursor).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getSession
// ---------------------------------------------------------------------------
describe('getSession', () => {
  it('returns session detail with materials and quizAttempts', async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue(mockSessionWithIncludes);

    const result = await sessionService.getSession(SESSION_ID, USER_ID);

    expect(result.id).toBe(SESSION_ID);
    expect(result.materials).toEqual([]);
    expect(result.quizAttempts).toEqual([]);
  });

  it('throws NotFoundError when session does not exist', async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue(null);

    await expect(sessionService.getSession('nonexistent', USER_ID)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('throws ForbiddenError when session belongs to a different user', async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue({
      ...mockSessionWithIncludes,
      userId: OTHER_USER_ID,
    });

    await expect(sessionService.getSession(SESSION_ID, USER_ID)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it('converts Decimal score to number', async () => {
    const { Decimal } = await import('@prisma/client/runtime/library');
    vi.mocked(prisma.session.findUnique).mockResolvedValue({
      ...mockSessionWithIncludes,
      quizAttempts: [
        {
          id: 'quiz-1',
          difficulty: 'easy',
          answerFormat: 'mcq',
          questionCount: 5,
          status: 'completed',
          score: new Decimal('87.50'),
          materialsUsed: true,
          startedAt: new Date('2024-01-01T12:00:00Z'),
          completedAt: new Date('2024-01-02T00:00:00Z'),
          createdAt: new Date('2024-01-01T00:00:00Z'),
        },
      ],
    } as never);

    const result = await sessionService.getSession(SESSION_ID, USER_ID);

    expect(result.quizAttempts[0].score).toBe(87.5);
    expect(typeof result.quizAttempts[0].score).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// updateSession
// ---------------------------------------------------------------------------
describe('updateSession', () => {
  it('updates and returns the session', async () => {
    const updatedSession = { ...mockSession, name: 'New Name', updatedAt: new Date() };
    vi.mocked(prisma.session.findUnique).mockResolvedValue(mockSession);
    vi.mocked(prisma.session.update).mockResolvedValue(updatedSession);

    const result = await sessionService.updateSession(SESSION_ID, { name: 'New Name' }, USER_ID);

    expect(prisma.session.update).toHaveBeenCalledWith({
      where: { id: SESSION_ID },
      data: { name: 'New Name' },
    });
    expect(result.name).toBe('New Name');
  });

  it('throws NotFoundError when session does not exist', async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue(null);

    await expect(
      sessionService.updateSession('nonexistent', { name: 'X' }, USER_ID),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(prisma.session.update).not.toHaveBeenCalled();
  });

  it('throws ForbiddenError when session belongs to a different user', async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue({
      ...mockSession,
      userId: OTHER_USER_ID,
    });

    await expect(
      sessionService.updateSession(SESSION_ID, { name: 'X' }, USER_ID),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(prisma.session.update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// deleteSession
// ---------------------------------------------------------------------------
describe('deleteSession', () => {
  it('deletes the session when the user is the owner', async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue(mockSession);
    vi.mocked(prisma.session.delete).mockResolvedValue(mockSession);

    await expect(sessionService.deleteSession(SESSION_ID, USER_ID)).resolves.toBeUndefined();

    expect(prisma.session.delete).toHaveBeenCalledWith({ where: { id: SESSION_ID } });
  });

  it('throws NotFoundError when session does not exist', async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue(null);

    await expect(sessionService.deleteSession('nonexistent', USER_ID)).rejects.toBeInstanceOf(
      NotFoundError,
    );

    expect(prisma.session.delete).not.toHaveBeenCalled();
  });

  it('throws ForbiddenError when session belongs to a different user', async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue({
      ...mockSession,
      userId: OTHER_USER_ID,
    });

    await expect(sessionService.deleteSession(SESSION_ID, USER_ID)).rejects.toBeInstanceOf(
      ForbiddenError,
    );

    expect(prisma.session.delete).not.toHaveBeenCalled();
  });
});
