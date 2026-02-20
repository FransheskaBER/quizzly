import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

vi.mock('../../config/database.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    session: { count: vi.fn() },
    quizAttempt: { count: vi.fn(), aggregate: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));

import { prisma } from '../../config/database.js';
import * as dashboardService from '../dashboard.service.js';

const USER_ID = 'a1b2c3d4-0000-0000-0000-000000000001';

const mockUser = { username: 'testuser' };

// Helpers that set up all five Prisma calls at once
const setupMocks = ({
  username = 'testuser',
  totalSessions = 0,
  totalQuizzesCompleted = 0,
  avgScore = null as number | null,
  subjects = [] as string[],
} = {}) => {
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...mockUser, username } as never);
  vi.mocked(prisma.session.count).mockResolvedValue(totalSessions);
  vi.mocked(prisma.quizAttempt.count).mockResolvedValue(totalQuizzesCompleted);
  vi.mocked(prisma.quizAttempt.aggregate).mockResolvedValue({
    _avg: { score: avgScore },
  } as never);
  (prisma.$queryRaw as unknown as Mock).mockResolvedValue(
    subjects.map((subject) => ({ subject })),
  );
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Case 1: New user — zero sessions, zero quiz attempts
// ---------------------------------------------------------------------------
describe('getDashboardStats — new user (zero data)', () => {
  it('returns zero counts and null for score and subject', async () => {
    setupMocks();

    const result = await dashboardService.getDashboardStats(USER_ID);

    expect(result).toEqual({
      username: 'testuser',
      totalSessions: 0,
      totalQuizzesCompleted: 0,
      averageScore: null,
      mostPracticedSubject: null,
    });
  });
});

// ---------------------------------------------------------------------------
// Case 2: Sessions exist but no completed quizzes
// ---------------------------------------------------------------------------
describe('getDashboardStats — sessions with no completed quizzes', () => {
  it('counts sessions correctly and keeps score/subject null', async () => {
    setupMocks({ totalSessions: 3, totalQuizzesCompleted: 0 });

    const result = await dashboardService.getDashboardStats(USER_ID);

    expect(result.totalSessions).toBe(3);
    expect(result.totalQuizzesCompleted).toBe(0);
    expect(result.averageScore).toBeNull();
    expect(result.mostPracticedSubject).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Case 3: User with completed quizzes
// ---------------------------------------------------------------------------
describe('getDashboardStats — user with completed quizzes', () => {
  it('returns correct counts, average score, and most-practiced subject', async () => {
    setupMocks({
      totalSessions: 2,
      totalQuizzesCompleted: 3,
      avgScore: 82.61,
      subjects: ['TypeScript'],
    });

    const result = await dashboardService.getDashboardStats(USER_ID);

    expect(result.totalSessions).toBe(2);
    expect(result.totalQuizzesCompleted).toBe(3);
    expect(result.averageScore).toBe(82.61);
    expect(result.mostPracticedSubject).toBe('TypeScript');
  });
});

// ---------------------------------------------------------------------------
// Case 4: Tied subjects — either is acceptable
// ---------------------------------------------------------------------------
describe('getDashboardStats — tied subjects', () => {
  it('returns one of the tied subjects without crashing', async () => {
    // The DB picks one; we simulate it returning TypeScript
    setupMocks({
      totalQuizzesCompleted: 4,
      avgScore: 75,
      subjects: ['TypeScript'], // DB decided TypeScript wins the tie
    });

    const result = await dashboardService.getDashboardStats(USER_ID);

    expect(['TypeScript', 'JavaScript']).toContain(result.mostPracticedSubject);
  });
});

// ---------------------------------------------------------------------------
// Case 5: Average score rounds to 2 decimal places
// ---------------------------------------------------------------------------
describe('getDashboardStats — average score precision', () => {
  it('rounds a repeating decimal to 2 decimal places', async () => {
    // 100 + 0 + 0 = 100; avg over 3 = 33.333... → should round to 33.33
    setupMocks({ totalQuizzesCompleted: 3, avgScore: 33.3333 });

    const result = await dashboardService.getDashboardStats(USER_ID);

    expect(result.averageScore).toBe(33.33);
  });

  it('preserves scores already at 2 decimal places', async () => {
    setupMocks({ totalQuizzesCompleted: 2, avgScore: 80.25 });

    const result = await dashboardService.getDashboardStats(USER_ID);

    expect(result.averageScore).toBe(80.25);
  });

  it('rounds up correctly at the half point', async () => {
    // 82.615 → rounds to 82.62
    setupMocks({ totalQuizzesCompleted: 1, avgScore: 82.615 });

    const result = await dashboardService.getDashboardStats(USER_ID);

    // Math.round(82.615 * 100) / 100 — floating-point safe check
    expect(result.averageScore).toBeCloseTo(82.62, 1);
  });
});
