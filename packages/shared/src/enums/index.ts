export enum AuthProvider {
  EMAIL = 'email',
  GOOGLE = 'google',
}

export enum SubscriptionTier {
  FREE = 'free',
}

export enum MaterialStatus {
  PROCESSING = 'processing',
  READY = 'ready',
  FAILED = 'failed',
}

export enum MaterialFileType {
  PDF = 'pdf',
  DOCX = 'docx',
  TXT = 'txt',
  URL = 'url',
}

export enum QuizStatus {
  GENERATING = 'generating',
  IN_PROGRESS = 'in_progress',
  GRADING = 'grading',
  COMPLETED = 'completed',
  SUBMITTED_UNGRADED = 'submitted_ungraded',
}

export enum QuizDifficulty {
  EASY = 'easy',
  MEDIUM = 'medium',
  HARD = 'hard',
}

export enum AnswerFormat {
  MCQ = 'mcq',
  FREE_TEXT = 'free_text',
  MIXED = 'mixed',
}

export enum QuestionType {
  MCQ = 'mcq',
  FREE_TEXT = 'free_text',
}

export enum QuestionScore {
  INCORRECT = 0,
  PARTIAL = 0.5,
  CORRECT = 1,
}

export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  BAD_REQUEST = 'BAD_REQUEST',
  UNAUTHORIZED = 'UNAUTHORIZED',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  EMAIL_NOT_VERIFIED = 'EMAIL_NOT_VERIFIED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  RATE_LIMITED = 'RATE_LIMITED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}
