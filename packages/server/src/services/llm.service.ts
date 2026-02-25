import pino from 'pino';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages.js';
import type { ZodType, ZodTypeDef } from 'zod';
import anthropic from '../config/anthropic.js';
import {
  LLM_MODEL,
  LLM_MAX_TOKENS,
  LLM_GENERATION_TEMPERATURE,
  LLM_GRADING_TEMPERATURE,
  SYSTEM_MARKER,
  CORRECTIVE_MESSAGE,
} from '../prompts/constants.js';
import { buildGenerationSystemPrompt } from '../prompts/generation/system.prompt.js';
import { buildGenerationUserMessage } from '../prompts/generation/user.prompt.js';
import { buildGradingSystemPrompt } from '../prompts/grading/system.prompt.js';
import { buildGradingUserMessage } from '../prompts/grading/user.prompt.js';
import { sanitizeForPrompt, logSuspiciousPatterns } from '../utils/sanitize.utils.js';
import { BadRequestError } from '../utils/errors.js';
import {
  llmQuizOutputSchema,
  llmGradedAnswersOutputSchema,
  type LlmGeneratedQuestion,
  type LlmGradedAnswer,
  type QuizDifficulty,
  type AnswerFormat,
} from '@skills-trainer/shared';

const logger = pino({ name: 'llm.service' });

// --- Public parameter types ---

export interface GenerateQuizParams {
  subject: string;
  goal: string;
  difficulty: QuizDifficulty;
  answerFormat: AnswerFormat;
  questionCount: number;
  materialsText: string | null;
}

export interface FreeTextAnswer {
  questionNumber: number;
  questionText: string;
  userAnswer: string;
  correctAnswer: string;
}

export interface GradeAnswersParams {
  subject: string;
  answers: FreeTextAnswer[];
}

export type OnQuestionCallback = (question: LlmGeneratedQuestion) => void;
export type OnGradedCallback = (answer: LlmGradedAnswer) => void;

// --- Pure helpers ---

/**
 * Extracts text between <blockName>...</blockName> tags.
 * Returns null if the opening or closing tag is not found.
 */
export const extractBlock = (response: string, blockName: string): string | null => {
  const openTag = `<${blockName}>`;
  const closeTag = `</${blockName}>`;
  const startIdx = response.indexOf(openTag);
  if (startIdx === -1) return null;
  const contentStart = startIdx + openTag.length;
  const endIdx = response.indexOf(closeTag, contentStart);
  if (endIdx === -1) return null;
  return response.slice(contentStart, endIdx).trim();
};

/**
 * Maps raw LLM score to one of three discrete values.
 *   raw < 0.25  → 0    (incorrect)
 *   raw < 0.75  → 0.5  (partial)
 *   raw >= 0.75 → 1    (correct)
 */
const clampScore = (raw: number): 0 | 0.5 | 1 => {
  if (raw < 0.25) return 0;
  if (raw < 0.75) return 0.5;
  return 1;
};

// --- Private LLM helpers ---

const checkExfiltration = (response: string): void => {
  if (response.includes(SYSTEM_MARKER)) {
    throw new BadRequestError(
      'LLM response contains system marker — possible prompt exfiltration attempt',
    );
  }
};

async function callLlmStream(
  systemPrompt: string,
  messages: MessageParam[],
  temperature: number,
): Promise<string> {
  const stream = anthropic.messages.stream({
    model: LLM_MODEL,
    max_tokens: LLM_MAX_TOKENS,
    temperature,
    system: systemPrompt,
    messages,
  });
  return stream.finalText();
}

/**
 * Attempts to extract and validate a JSON block from an LLM response.
 * Returns null if the block is missing, JSON is invalid, or schema validation fails.
 */
async function parseBlock<T>(
  response: string,
  blockName: string,
  schema: ZodType<T, ZodTypeDef, unknown>,
): Promise<T | null> {
  const block = extractBlock(response, blockName);
  if (block === null) return null;
  try {
    const parsed: unknown = JSON.parse(block);
    const result = schema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/**
 * Calls the LLM, validates the response against schema, and retries once on failure.
 * Throws BadRequestError if both attempts fail or exfiltration is detected.
 */
async function runWithRetry<T>(
  systemPrompt: string,
  userMessage: string,
  blockName: string,
  schema: ZodType<T, ZodTypeDef, unknown>,
  temperature: number,
): Promise<T> {
  const firstMessages: MessageParam[] = [{ role: 'user', content: userMessage }];
  const firstResponse = await callLlmStream(systemPrompt, firstMessages, temperature);
  checkExfiltration(firstResponse);

  const firstResult = await parseBlock(firstResponse, blockName, schema);
  if (firstResult !== null) return firstResult;

  // Retry with 3-message history: original user → failed assistant → corrective user
  const retryMessages: MessageParam[] = [
    { role: 'user', content: userMessage },
    { role: 'assistant', content: firstResponse },
    { role: 'user', content: CORRECTIVE_MESSAGE },
  ];
  const retryResponse = await callLlmStream(systemPrompt, retryMessages, temperature);
  checkExfiltration(retryResponse);

  const retryResult = await parseBlock(retryResponse, blockName, schema);
  if (retryResult !== null) return retryResult;

  logger.error(
    { blockName, firstResponseSnippet: firstResponse.slice(0, 500) },
    'LLM generation failed after retry',
  );
  throw new BadRequestError('Generation failed. Please try again.');
}

// --- Public service functions ---

export const generateQuiz = async (
  params: GenerateQuizParams,
  onQuestion: OnQuestionCallback,
): Promise<LlmGeneratedQuestion[]> => {
  const subject = sanitizeForPrompt(params.subject);
  const goal = sanitizeForPrompt(params.goal);
  const materialsText =
    params.materialsText !== null ? sanitizeForPrompt(params.materialsText) : null;

  logSuspiciousPatterns(subject, 'subject');
  logSuspiciousPatterns(goal, 'goal');
  if (materialsText !== null) logSuspiciousPatterns(materialsText, 'materials');

  const systemPrompt = buildGenerationSystemPrompt();
  const userMessage = buildGenerationUserMessage({
    ...params,
    subject,
    goal,
    materialsText,
  });

  const questions = await runWithRetry<LlmGeneratedQuestion[]>(
    systemPrompt,
    userMessage,
    'questions',
    llmQuizOutputSchema,
    LLM_GENERATION_TEMPERATURE,
  );

  for (const question of questions) {
    onQuestion(question);
  }

  return questions;
};

export const gradeAnswers = async (
  params: GradeAnswersParams,
  onGraded: OnGradedCallback,
): Promise<LlmGradedAnswer[]> => {
  const subject = sanitizeForPrompt(params.subject);
  const systemPrompt = buildGradingSystemPrompt();
  const userMessage = buildGradingUserMessage({
    subject,
    questionsAndAnswers: params.answers,
  });

  const rawResults = await runWithRetry<LlmGradedAnswer[]>(
    systemPrompt,
    userMessage,
    'results',
    llmGradedAnswersOutputSchema,
    LLM_GRADING_TEMPERATURE,
  );

  const graded: LlmGradedAnswer[] = rawResults.map((r) => {
    const score = clampScore(r.score);
    return { ...r, score, isCorrect: score === 1 };
  });

  for (const answer of graded) {
    onGraded(answer);
  }

  return graded;
};
