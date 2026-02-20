import { prisma } from '../config/database.js';
import type { DashboardResponse } from '@skills-trainer/shared';
import { NotFoundError } from '../utils/errors.js';

type SubjectCountRow = { subject: string };

export const getDashboardStats = async (userId: string): Promise<DashboardResponse> => {
  const [user, totalSessions, totalQuizzesCompleted, scoreAggregate, subjectRows] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { username: true },
      }),
      prisma.session.count({ where: { userId } }),
      prisma.quizAttempt.count({ where: { userId, status: 'completed' } }),
      prisma.quizAttempt.aggregate({
        where: { userId, status: 'completed' },
        _avg: { score: true },
      }),
      // Prisma groupBy can't JOIN other models, so raw SQL is the clean choice here.
      // Parameterized via tagged template — no string interpolation, no injection risk.
      prisma.$queryRaw<SubjectCountRow[]>`
        SELECT s.subject
        FROM quiz_attempts qa
        JOIN sessions s ON qa.session_id = s.id
        WHERE qa.user_id = ${userId}::uuid
          AND qa.status = 'completed'
        GROUP BY s.subject
        ORDER BY COUNT(qa.id) DESC
        LIMIT 1
      `,
    ]);

  if (!user) {
    throw new NotFoundError('User not found');
  }

  const avgScore = scoreAggregate._avg.score;
  const averageScore =
    avgScore !== null ? Math.round(Number(avgScore) * 100) / 100 : null;

  const mostPracticedSubject = subjectRows.length > 0 ? subjectRows[0].subject : null;

  return {
    username: user.username,
    totalSessions,
    totalQuizzesCompleted,
    averageScore,
    mostPracticedSubject,
  };
};
