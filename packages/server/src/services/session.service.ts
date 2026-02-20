import { prisma } from '../config/database.js';
import { assertOwnership } from '../utils/ownership.js';
import { NotFoundError } from '../utils/errors.js';
import type {
  CreateSessionRequest,
  UpdateSessionRequest,
  PaginationParams,
  SessionResponse,
  SessionDetailResponse,
  SessionListResponse,
  MaterialStatus,
  QuizDifficulty,
  AnswerFormat,
  QuizStatus,
} from '@skills-trainer/shared';

export const createSession = async (
  data: CreateSessionRequest,
  userId: string,
): Promise<SessionResponse> => {
  const session = await prisma.session.create({
    data: { userId, name: data.name, subject: data.subject, goal: data.goal },
  });

  return {
    id: session.id,
    name: session.name,
    subject: session.subject,
    goal: session.goal,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  };
};

export const listSessions = async (
  params: PaginationParams,
  userId: string,
): Promise<SessionListResponse> => {
  const { cursor, limit } = params;

  const sessions = await prisma.session.findMany({
    where: { userId },
    cursor: cursor ? { id: cursor } : undefined,
    skip: cursor ? 1 : 0,
    take: limit + 1,
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { materials: true, quizAttempts: true } },
    },
  });

  const hasMore = sessions.length > limit;
  const items = hasMore ? sessions.slice(0, limit) : sessions;
  const nextCursor = hasMore ? items[items.length - 1].id : null;

  return {
    sessions: items.map((s) => ({
      id: s.id,
      name: s.name,
      subject: s.subject,
      goal: s.goal,
      materialCount: s._count.materials,
      quizCount: s._count.quizAttempts,
      createdAt: s.createdAt.toISOString(),
    })),
    nextCursor,
  };
};

export const getSession = async (
  sessionId: string,
  userId: string,
): Promise<SessionDetailResponse> => {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      materials: {
        select: {
          id: true,
          fileName: true,
          fileType: true,
          fileSize: true,
          tokenCount: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      },
      quizAttempts: {
        select: {
          id: true,
          difficulty: true,
          answerFormat: true,
          questionCount: true,
          status: true,
          score: true,
          materialsUsed: true,
          completedAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!session) {
    throw new NotFoundError('Session not found');
  }

  assertOwnership(session.userId, userId);

  return {
    id: session.id,
    name: session.name,
    subject: session.subject,
    goal: session.goal,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
    materials: session.materials.map((m) => ({
      id: m.id,
      fileName: m.fileName,
      fileType: m.fileType,
      fileSize: m.fileSize,
      tokenCount: m.tokenCount,
      status: m.status as MaterialStatus,
      createdAt: m.createdAt.toISOString(),
    })),
    quizAttempts: session.quizAttempts.map((q) => ({
      id: q.id,
      difficulty: q.difficulty as QuizDifficulty,
      answerFormat: q.answerFormat as AnswerFormat,
      questionCount: q.questionCount,
      status: q.status as QuizStatus,
      score: q.score ? Number(q.score) : null,
      materialsUsed: q.materialsUsed,
      completedAt: q.completedAt ? q.completedAt.toISOString() : null,
      createdAt: q.createdAt.toISOString(),
    })),
  };
};

export const updateSession = async (
  sessionId: string,
  data: UpdateSessionRequest,
  userId: string,
): Promise<SessionResponse> => {
  const session = await prisma.session.findUnique({ where: { id: sessionId } });

  if (!session) {
    throw new NotFoundError('Session not found');
  }

  assertOwnership(session.userId, userId);

  const updated = await prisma.session.update({
    where: { id: sessionId },
    data,
  });

  return {
    id: updated.id,
    name: updated.name,
    subject: updated.subject,
    goal: updated.goal,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  };
};

export const deleteSession = async (sessionId: string, userId: string): Promise<void> => {
  const session = await prisma.session.findUnique({ where: { id: sessionId } });

  if (!session) {
    throw new NotFoundError('Session not found');
  }

  assertOwnership(session.userId, userId);

  await prisma.session.delete({ where: { id: sessionId } });
};
