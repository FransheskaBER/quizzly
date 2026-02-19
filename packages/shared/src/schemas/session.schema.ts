import { z } from 'zod';
import { uuidSchema } from './common.schema.js';
import {
  SESSION_NAME_MAX_LENGTH,
  SUBJECT_MAX_LENGTH,
  GOAL_MAX_LENGTH,
} from '../constants/quiz.constants.js';
import { QuizDifficulty, AnswerFormat, QuizStatus, MaterialStatus } from '../enums/index.js';

// Request schemas

export const createSessionSchema = z.object({
  name: z.string().min(1).max(SESSION_NAME_MAX_LENGTH).trim(),
  subject: z.string().min(1).max(SUBJECT_MAX_LENGTH).trim(),
  goal: z.string().min(1).max(GOAL_MAX_LENGTH).trim(),
});

export const updateSessionSchema = createSessionSchema.partial();

export const sessionParamsSchema = z.object({
  id: uuidSchema,
});

// Response schemas

export const sessionResponseSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  subject: z.string(),
  goal: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const materialSummarySchema = z.object({
  id: uuidSchema,
  fileName: z.string(),
  fileType: z.string(),
  fileSize: z.number().nullable(),
  tokenCount: z.number().int(),
  status: z.nativeEnum(MaterialStatus),
  createdAt: z.string().datetime(),
});

export const quizAttemptSummarySchema = z.object({
  id: uuidSchema,
  difficulty: z.nativeEnum(QuizDifficulty),
  answerFormat: z.nativeEnum(AnswerFormat),
  questionCount: z.number().int(),
  status: z.nativeEnum(QuizStatus),
  score: z.number().nullable(),
  materialsUsed: z.boolean(),
  completedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

export const sessionDetailResponseSchema = sessionResponseSchema.extend({
  materials: z.array(materialSummarySchema),
  quizAttempts: z.array(quizAttemptSummarySchema),
});

export const sessionListItemSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  subject: z.string(),
  goal: z.string(),
  materialCount: z.number().int(),
  quizCount: z.number().int(),
  createdAt: z.string().datetime(),
});

export const sessionListResponseSchema = z.object({
  sessions: z.array(sessionListItemSchema),
  nextCursor: z.string().uuid().nullable(),
});
