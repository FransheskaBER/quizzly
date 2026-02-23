import { z } from 'zod';
import { uuidSchema } from './common.schema.js';
import { MIN_QUESTION_COUNT, MAX_QUESTION_COUNT, MCQ_OPTIONS_COUNT } from '../constants/quiz.constants.js';
import { QuizDifficulty, AnswerFormat, QuestionType, QuizStatus } from '../enums/index.js';

// Request schemas

export const generateQuizQuerySchema = z.object({
  difficulty: z.nativeEnum(QuizDifficulty),
  format: z.nativeEnum(AnswerFormat),
  count: z.coerce.number().int().min(MIN_QUESTION_COUNT).max(MAX_QUESTION_COUNT),
});

export const saveAnswersSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.string().uuid(),
        answer: z.string(),
      }),
    )
    .min(1),
});

// Submit body allows an empty answers array — answers may already be saved
// via the auto-save endpoint before the user clicks submit.
export const submitQuizBodySchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.string().uuid(),
        answer: z.string(),
      }),
    )
    .default([]),
});

export const quizParamsSchema = z.object({
  id: uuidSchema,
});

export const quizSessionParamsSchema = z.object({
  sessionId: uuidSchema,
});

// Response schemas — quiz taking (no answers revealed)

export const questionSchema = z.object({
  id: uuidSchema,
  questionNumber: z.number().int(),
  questionType: z.nativeEnum(QuestionType),
  questionText: z.string(),
  options: z.array(z.string()).nullable(),
});

export const answerSchema = z.object({
  id: uuidSchema,
  questionId: uuidSchema,
  userAnswer: z.string().nullable(),
  answeredAt: z.string().datetime().nullable(),
});

export const quizAttemptResponseSchema = z.object({
  id: uuidSchema,
  sessionId: uuidSchema,
  difficulty: z.nativeEnum(QuizDifficulty),
  answerFormat: z.nativeEnum(AnswerFormat),
  questionCount: z.number().int(),
  status: z.nativeEnum(QuizStatus),
  materialsUsed: z.boolean(),
  createdAt: z.string().datetime(),
  questions: z.array(questionSchema),
  answers: z.array(answerSchema),
});

// Response schemas — quiz results (answers revealed)

export const questionResultSchema = z.object({
  id: uuidSchema,
  questionNumber: z.number().int(),
  questionType: z.nativeEnum(QuestionType),
  questionText: z.string(),
  options: z.array(z.string()).nullable(),
  correctAnswer: z.string(),
  explanation: z.string(),
  tags: z.array(z.string()).nullable(),
  answer: z.object({
    userAnswer: z.string().nullable(),
    isCorrect: z.boolean().nullable(),
    score: z.number().nullable(),
    feedback: z.string().nullable(),
  }),
});

export const quizResultsSummarySchema = z.object({
  correct: z.number().int(),
  partial: z.number().int(),
  incorrect: z.number().int(),
  total: z.number().int(),
});

export const quizResultsResponseSchema = z.object({
  id: uuidSchema,
  sessionId: uuidSchema,
  difficulty: z.nativeEnum(QuizDifficulty),
  answerFormat: z.nativeEnum(AnswerFormat),
  questionCount: z.number().int(),
  status: z.nativeEnum(QuizStatus),
  score: z.number().nullable(),
  materialsUsed: z.boolean(),
  completedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  summary: quizResultsSummarySchema,
  questions: z.array(questionResultSchema),
});

// LLM output validation schemas

export const llmGeneratedQuestionSchema = z
  .object({
    questionNumber: z.number().int(),
    questionType: z.nativeEnum(QuestionType),
    questionText: z.string().min(1),
    options: z.array(z.string()).length(MCQ_OPTIONS_COUNT).nullable(),
    correctAnswer: z.string().min(1),
    explanation: z.string().min(1),
    difficulty: z.nativeEnum(QuizDifficulty),
    tags: z.array(z.string()).default([]),
  })
  .refine((q) => q.questionType !== QuestionType.MCQ || q.options !== null, {
    message: 'MCQ questions must have options',
    path: ['options'],
  })
  .refine(
    (q) =>
      q.questionType !== QuestionType.MCQ ||
      q.options === null ||
      q.options.includes(q.correctAnswer),
    {
      message: 'MCQ correctAnswer must be one of the options',
      path: ['correctAnswer'],
    },
  )
  .refine((q) => q.questionType !== QuestionType.FREE_TEXT || q.options === null, {
    message: 'Free-text questions must not have options',
    path: ['options'],
  });

export const llmGradingResultSchema = z.object({
  questionId: z.string().uuid(),
  score: z.number().min(0).max(1),
  feedback: z.string().min(1),
});

// Used by the LLM grading service (Task 018). questionId-based schema above is for Task 025.
export const llmGradedAnswerSchema = z.object({
  questionNumber: z.number().int().min(1),
  score: z.number().min(0).max(1),
  isCorrect: z.boolean(),
  feedback: z.string().min(1),
});

export const llmQuizOutputSchema = z.array(llmGeneratedQuestionSchema);
export const llmGradingOutputSchema = z.array(llmGradingResultSchema);
export const llmGradedAnswersOutputSchema = z.array(llmGradedAnswerSchema);

// SSE event schemas

export const sseProgressEventSchema = z.object({
  type: z.literal('progress'),
  message: z.string(),
});

export const sseQuestionEventSchema = z.object({
  type: z.literal('question'),
  data: questionSchema,
});

export const sseCompleteEventSchema = z.object({
  type: z.literal('complete'),
  data: z.object({ quizAttemptId: uuidSchema }),
});

export const sseErrorEventSchema = z.object({
  type: z.literal('error'),
  message: z.string(),
});

export const sseGradedEventSchema = z.object({
  type: z.literal('graded'),
  data: z.object({
    questionId: uuidSchema,
    score: z.number(),
    isCorrect: z.boolean(),
  }),
});

export const sseGradeCompleteEventSchema = z.object({
  type: z.literal('complete'),
  data: z.object({
    quizAttemptId: uuidSchema,
    score: z.number(),
  }),
});

// Dashboard

export const dashboardResponseSchema = z.object({
  username: z.string(),
  totalSessions: z.number().int(),
  totalQuizzesCompleted: z.number().int(),
  averageScore: z.number().nullable(),
  mostPracticedSubject: z.string().nullable(),
});
