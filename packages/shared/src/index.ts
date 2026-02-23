// Enums
export {
  AuthProvider,
  SubscriptionTier,
  MaterialStatus,
  MaterialFileType,
  QuizStatus,
  QuizDifficulty,
  AnswerFormat,
  QuestionType,
  QuestionScore,
  ErrorCode,
} from './enums/index.js';

// Constants
export {
  PASSWORD_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  EMAIL_MAX_LENGTH,
  JWT_DEFAULT_EXPIRES_IN,
  VERIFICATION_TOKEN_EXPIRY_HOURS,
  RESET_TOKEN_EXPIRY_HOURS,
} from './constants/auth.constants.js';

export {
  MAX_FILES_PER_SESSION,
  MAX_FILE_SIZE_BYTES,
  MAX_SESSION_TOKEN_BUDGET,
  ALLOWED_FILE_TYPES,
  URL_FETCH_TIMEOUT_MS,
  URL_FETCH_MAX_BYTES,
  MIN_EXTRACTED_TEXT_LENGTH,
  PRESIGNED_URL_UPLOAD_EXPIRY_SECONDS,
  PRESIGNED_URL_DOWNLOAD_EXPIRY_SECONDS,
} from './constants/material.constants.js';

export {
  MIN_QUESTION_COUNT,
  MAX_QUESTION_COUNT,
  MCQ_OPTIONS_COUNT,
  QUIZ_GENERATION_TIMEOUT_MS,
  SSE_CLIENT_WARNING_TIMEOUT_MS,
  SSE_SERVER_TIMEOUT_MS,
  RATE_LIMIT_QUIZ_GENERATION_PER_HOUR,
  RATE_LIMIT_QUIZ_GENERATION_PER_DAY,
  RATE_LIMIT_REGRADE_PER_HOUR,
  SESSION_NAME_MAX_LENGTH,
  SUBJECT_MAX_LENGTH,
  GOAL_MAX_LENGTH,
} from './constants/quiz.constants.js';

// Schemas
export {
  uuidSchema,
  paginationSchema,
  apiErrorSchema,
  timestampsSchema,
} from './schemas/common.schema.js';

export {
  signupSchema,
  loginSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  loginResponseSchema,
  userResponseSchema,
  messageResponseSchema,
} from './schemas/auth.schema.js';

export {
  createSessionSchema,
  updateSessionSchema,
  sessionParamsSchema,
  sessionResponseSchema,
  sessionDetailResponseSchema,
  sessionListItemSchema,
  sessionListResponseSchema,
  materialSummarySchema,
  quizAttemptSummarySchema,
} from './schemas/session.schema.js';

export {
  requestUploadUrlSchema,
  extractUrlSchema,
  materialParamsSchema,
  materialSessionParamsSchema,
  uploadUrlResponseSchema,
  materialResponseSchema,
} from './schemas/material.schema.js';

export {
  generateQuizQuerySchema,
  saveAnswersSchema,
  submitQuizBodySchema,
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
  llmGradedAnswerSchema,
  llmQuizOutputSchema,
  llmGradingOutputSchema,
  llmGradedAnswersOutputSchema,
  sseProgressEventSchema,
  sseQuestionEventSchema,
  sseCompleteEventSchema,
  sseErrorEventSchema,
  sseGradedEventSchema,
  sseGradeCompleteEventSchema,
  dashboardResponseSchema,
} from './schemas/quiz.schema.js';

// Types
export type {
  ApiErrorResponse,
  PaginatedResponse,
  BaseEntity,
} from './types/api.types.js';

export type {
  PaginationParams,
  ApiError,
  Timestamps,
  SignupRequest,
  LoginRequest,
  VerifyEmailRequest,
  ResendVerificationRequest,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  LoginResponse,
  UserResponse,
  MessageResponse,
  CreateSessionRequest,
  UpdateSessionRequest,
  SessionParams,
  SessionResponse,
  SessionDetailResponse,
  SessionListItem,
  SessionListResponse,
  MaterialSummary,
  QuizAttemptSummary,
  RequestUploadUrlRequest,
  ExtractUrlRequest,
  MaterialParams,
  MaterialSessionParams,
  UploadUrlResponse,
  MaterialResponse,
  GenerateQuizQuery,
  SaveAnswersRequest,
  SubmitQuizBody,
  QuizParams,
  QuizSessionParams,
  Question,
  Answer,
  QuizAttemptResponse,
  QuestionResult,
  QuizResultsSummary,
  QuizResultsResponse,
  LlmGeneratedQuestion,
  LlmGradingResult,
  LlmGradedAnswer,
  SseProgressEvent,
  SseQuestionEvent,
  SseCompleteEvent,
  SseErrorEvent,
  SseGradedEvent,
  SseGradeCompleteEvent,
  DashboardResponse,
} from './types/index.js';
