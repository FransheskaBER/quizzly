import type { z } from 'zod';

// Common
import type { paginationSchema, apiErrorSchema, timestampsSchema } from '../schemas/common.schema.js';

export type PaginationParams = z.infer<typeof paginationSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
export type Timestamps = z.infer<typeof timestampsSchema>;

// Auth
import type {
  signupSchema,
  loginSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  loginResponseSchema,
  userResponseSchema,
  messageResponseSchema,
} from '../schemas/auth.schema.js';

export type SignupRequest = z.infer<typeof signupSchema>;
export type LoginRequest = z.infer<typeof loginSchema>;
export type VerifyEmailRequest = z.infer<typeof verifyEmailSchema>;
export type ResendVerificationRequest = z.infer<typeof resendVerificationSchema>;
export type ForgotPasswordRequest = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordRequest = z.infer<typeof resetPasswordSchema>;
export type LoginResponse = z.infer<typeof loginResponseSchema>;
export type UserResponse = z.infer<typeof userResponseSchema>;
export type MessageResponse = z.infer<typeof messageResponseSchema>;

// Session
import type {
  createSessionSchema,
  updateSessionSchema,
  sessionParamsSchema,
  sessionResponseSchema,
  sessionDetailResponseSchema,
  sessionListItemSchema,
  sessionListResponseSchema,
  materialSummarySchema,
  quizAttemptSummarySchema,
} from '../schemas/session.schema.js';

export type CreateSessionRequest = z.infer<typeof createSessionSchema>;
export type UpdateSessionRequest = z.infer<typeof updateSessionSchema>;
export type SessionParams = z.infer<typeof sessionParamsSchema>;
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
export type SessionDetailResponse = z.infer<typeof sessionDetailResponseSchema>;
export type SessionListItem = z.infer<typeof sessionListItemSchema>;
export type SessionListResponse = z.infer<typeof sessionListResponseSchema>;
export type MaterialSummary = z.infer<typeof materialSummarySchema>;
export type QuizAttemptSummary = z.infer<typeof quizAttemptSummarySchema>;

// Material
import type {
  requestUploadUrlSchema,
  extractUrlSchema,
  materialParamsSchema,
  materialSessionParamsSchema,
  uploadUrlResponseSchema,
  materialResponseSchema,
} from '../schemas/material.schema.js';

export type RequestUploadUrlRequest = z.infer<typeof requestUploadUrlSchema>;
export type ExtractUrlRequest = z.infer<typeof extractUrlSchema>;
export type MaterialParams = z.infer<typeof materialParamsSchema>;
export type MaterialSessionParams = z.infer<typeof materialSessionParamsSchema>;
export type UploadUrlResponse = z.infer<typeof uploadUrlResponseSchema>;
export type MaterialResponse = z.infer<typeof materialResponseSchema>;

// Quiz
import type {
  generateQuizQuerySchema,
  saveAnswersSchema,
  quizParamsSchema,
  quizSessionParamsSchema,
  questionSchema,
  answerSchema,
  quizAttemptResponseSchema,
  questionResultSchema,
  quizResultsSummarySchema,
  quizResultsResponseSchema,
  llmGeneratedQuestionSchema,
  llmGradingResultSchema,
  sseProgressEventSchema,
  sseQuestionEventSchema,
  sseCompleteEventSchema,
  sseErrorEventSchema,
  sseGradedEventSchema,
  sseGradeCompleteEventSchema,
  dashboardResponseSchema,
} from '../schemas/quiz.schema.js';

export type GenerateQuizQuery = z.infer<typeof generateQuizQuerySchema>;
export type SaveAnswersRequest = z.infer<typeof saveAnswersSchema>;
export type QuizParams = z.infer<typeof quizParamsSchema>;
export type QuizSessionParams = z.infer<typeof quizSessionParamsSchema>;
export type Question = z.infer<typeof questionSchema>;
export type Answer = z.infer<typeof answerSchema>;
export type QuizAttemptResponse = z.infer<typeof quizAttemptResponseSchema>;
export type QuestionResult = z.infer<typeof questionResultSchema>;
export type QuizResultsSummary = z.infer<typeof quizResultsSummarySchema>;
export type QuizResultsResponse = z.infer<typeof quizResultsResponseSchema>;
export type LlmGeneratedQuestion = z.infer<typeof llmGeneratedQuestionSchema>;
export type LlmGradingResult = z.infer<typeof llmGradingResultSchema>;
export type SseProgressEvent = z.infer<typeof sseProgressEventSchema>;
export type SseQuestionEvent = z.infer<typeof sseQuestionEventSchema>;
export type SseCompleteEvent = z.infer<typeof sseCompleteEventSchema>;
export type SseErrorEvent = z.infer<typeof sseErrorEventSchema>;
export type SseGradedEvent = z.infer<typeof sseGradedEventSchema>;
export type SseGradeCompleteEvent = z.infer<typeof sseGradeCompleteEventSchema>;
export type DashboardResponse = z.infer<typeof dashboardResponseSchema>;
