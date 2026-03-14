import pino from 'pino';
import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages.js';
import { type ZodType, type ZodTypeDef, type ZodError } from 'zod';
import {
  llmQuizOutputSchema,
  llmGradedAnswersOutputSchema,
  llmGeneratedQuestionSchema,
  type LlmGeneratedQuestion,
  type LlmGradedAnswer,
  type QuizDifficulty,
  type AnswerFormat,
} from '@skills-trainer/shared';
import defaultClient from '../config/anthropic.js';
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
import { captureExceptionOnce, markErrorAsCaptured } from '../utils/sentry.utils.js';

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

/** Returns a per-request client when `apiKey` is provided, otherwise the global singleton. */
const resolveAnthropicClient = (apiKey?: string): Anthropic =>
  apiKey ? new Anthropic({ apiKey }) : defaultClient;

async function callLlmStream(
  systemPrompt: string,
  messages: MessageParam[],
  temperature: number,
  client: Anthropic,
): Promise<string> {
  try {
    const stream = client.messages.stream({
      model: LLM_MODEL,
      max_tokens: LLM_MAX_TOKENS,
      temperature,
      system: systemPrompt,
      messages,
    });
    return await stream.finalText();
  } catch (err) {
    logger.error(
      { err, provider: 'anthropic', model: LLM_MODEL, operation: 'callLlmStream' },
      'LLM stream request failed',
    );
    captureExceptionOnce(err, {
      extra: { provider: 'anthropic', model: LLM_MODEL, operation: 'callLlmStream' },
    });

    // Sanitize Anthropic auth errors so the raw SDK message (which may contain
    // key-related details) is never forwarded to the client.
    if (err instanceof Anthropic.AuthenticationError) {
      const sanitizedError = new BadRequestError(
        'Invalid API key. Please check your key and try again.',
      );
      markErrorAsCaptured(sanitizedError);
      throw sanitizedError;
    }
    throw err;
  }
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
  } catch (err) {
    logger.error({ err, blockName, operation: 'parseBlock' }, 'Failed to parse LLM response block');
    captureExceptionOnce(err, {
      extra: { blockName, operation: 'parseBlock' },
    });
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
  client: Anthropic,
): Promise<T> {
  const firstMessages: MessageParam[] = [{ role: 'user', content: userMessage }];
  const firstResponse = await callLlmStream(systemPrompt, firstMessages, temperature, client);
  checkExfiltration(firstResponse);

  const firstResult = await parseBlock(firstResponse, blockName, schema);
  if (firstResult !== null) return firstResult;

  // Retry with 3-message history: original user → failed assistant → corrective user
  const retryMessages: MessageParam[] = [
    { role: 'user', content: userMessage },
    { role: 'assistant', content: firstResponse },
    { role: 'user', content: CORRECTIVE_MESSAGE },
  ];
  const retryResponse = await callLlmStream(systemPrompt, retryMessages, temperature, client);
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
  apiKey?: string,
): Promise<LlmGeneratedQuestion[]> => {
  const subject = sanitizeForPrompt(params.subject);
  const goal = sanitizeForPrompt(params.goal);
  const materialsText =
    params.materialsText !== null ? sanitizeForPrompt(params.materialsText) : null;

  logSuspiciousPatterns(subject, 'subject');
  logSuspiciousPatterns(goal, 'goal');
  if (materialsText !== null) logSuspiciousPatterns(materialsText, 'materials');

  const promptParams = {
    ...params,
    subject,
    goal,
    materialsText,
  };
  const systemPrompt = buildGenerationSystemPrompt(params.difficulty);
  const userMessage = buildGenerationUserMessage(promptParams);
  const client = resolveAnthropicClient(apiKey);

  const questions = await runWithRetry<LlmGeneratedQuestion[]>(
    systemPrompt,
    userMessage,
    'questions',
    llmQuizOutputSchema,
    LLM_GENERATION_TEMPERATURE,
    client,
  );

  for (const question of questions) {
    onQuestion(question);
  }

  return questions;
};

// --- Streaming quiz generation ---

export interface MalformedSlot {
  originalSlotNumber: number;
  rawLlmOutput: string;
  zodErrors: ZodError;
}

export interface StreamQuestionsResult {
  validCount: number;
  malformedSlots: MalformedSlot[];
}

/**
 * Incrementally parses LLM output, yielding individual questions as they're
 * completed. Uses brace-depth counting inside the <questions> JSON array to
 * detect complete objects without buffering the entire response.
 *
 * `onValidQuestion` is async — the stream pauses while the caller saves to DB
 * and sends SSE (~50ms). The SDK buffers tokens in memory, so no data is lost.
 */
export const streamQuestions = async (
  params: GenerateQuizParams,
  onValidQuestion: (question: LlmGeneratedQuestion, assignedNumber: number) => Promise<void>,
  onMalformedQuestion: (rawOutput: string, zodErrors: ZodError, slotNumber: number) => void,
  apiKey?: string,
): Promise<StreamQuestionsResult> => {
  const subject = sanitizeForPrompt(params.subject);
  const goal = sanitizeForPrompt(params.goal);
  const materialsText =
    params.materialsText !== null ? sanitizeForPrompt(params.materialsText) : null;

  logSuspiciousPatterns(subject, 'subject');
  logSuspiciousPatterns(goal, 'goal');
  if (materialsText !== null) logSuspiciousPatterns(materialsText, 'materials');

  const promptParams = { ...params, subject, goal, materialsText };
  const systemPrompt = buildGenerationSystemPrompt(params.difficulty);
  const userMessage = buildGenerationUserMessage(promptParams);
  const client = resolveAnthropicClient(apiKey);

  const stream = client.messages.stream({
    model: LLM_MODEL,
    max_tokens: LLM_MAX_TOKENS,
    temperature: LLM_GENERATION_TEMPERATURE,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  let fullText = '';
  let insideQuestions = false;
  let braceDepth = 0;
  let currentObject = '';
  let slotNumber = 0;
  let assignedNumber = 1;
  const malformedSlots: MalformedSlot[] = [];

  for await (const event of stream) {
    if (event.type !== 'content_block_delta' || event.delta.type !== 'text_delta') continue;

    const chunk = event.delta.text;
    fullText += chunk;

    // Periodically check for exfiltration
    checkExfiltration(fullText);

    for (const char of chunk) {
      if (!insideQuestions) {
        // Detect the start of the <questions> block — look for opening bracket
        const questionsTag = '<questions>';
        if (fullText.endsWith(questionsTag)) {
          insideQuestions = true;
        }
        continue;
      }

      // Inside <questions> block — track brace depth to find complete objects
      if (char === '{') {
        if (braceDepth === 0) {
          currentObject = '';
        }
        braceDepth++;
        currentObject += char;
      } else if (char === '}') {
        braceDepth--;
        currentObject += char;

        if (braceDepth === 0) {
          // Complete JSON object found
          slotNumber++;
          try {
            const parsed: unknown = JSON.parse(currentObject);
            const result = llmGeneratedQuestionSchema.safeParse(parsed);
            if (result.success) {
              await onValidQuestion(result.data, assignedNumber);
              assignedNumber++;
            } else {
              malformedSlots.push({
                originalSlotNumber: slotNumber,
                rawLlmOutput: currentObject,
                zodErrors: result.error,
              });
              onMalformedQuestion(currentObject, result.error, slotNumber);
            }
          } catch {
            // JSON.parse failed — treat as malformed
            const parseError = llmGeneratedQuestionSchema.safeParse(null);
            malformedSlots.push({
              originalSlotNumber: slotNumber,
              rawLlmOutput: currentObject,
              zodErrors: parseError.error!,
            });
            onMalformedQuestion(currentObject, parseError.error!, slotNumber);
          }
          currentObject = '';
        }
      } else if (braceDepth > 0) {
        currentObject += char;
      }
    }
  }

  // Final exfiltration check on complete response
  checkExfiltration(fullText);

  return {
    validCount: assignedNumber - 1,
    malformedSlots,
  };
};

/**
 * Generates a single replacement question for a malformed slot.
 * Uses the same prompt structure but requests exactly 1 question and provides
 * context about already-generated topics to avoid duplicates.
 */
export const generateReplacementQuestion = async (
  params: GenerateQuizParams,
  existingTags: string[],
  apiKey?: string,
): Promise<LlmGeneratedQuestion | null> => {
  const subject = sanitizeForPrompt(params.subject);
  const goal = sanitizeForPrompt(params.goal);
  const materialsText =
    params.materialsText !== null ? sanitizeForPrompt(params.materialsText) : null;

  const systemPrompt = buildGenerationSystemPrompt(params.difficulty);
  const topicContext = existingTags.length > 0
    ? `\n\nAlready-generated question topics: ${existingTags.join(', ')}. Generate a question covering a DIFFERENT concept.`
    : '';

  const userMessage = buildGenerationUserMessage({
    ...params,
    subject,
    goal,
    materialsText,
    questionCount: 1,
  }) + topicContext;

  const client = resolveAnthropicClient(apiKey);

  try {
    const response = await callLlmStream(
      systemPrompt,
      [{ role: 'user', content: userMessage }],
      LLM_GENERATION_TEMPERATURE,
      client,
    );
    checkExfiltration(response);
    const questions = await parseBlock(response, 'questions', llmQuizOutputSchema);
    return questions?.[0] ?? null;
  } catch {
    return null;
  }
};

export const gradeAnswers = async (
  params: GradeAnswersParams,
  onGraded: OnGradedCallback,
  apiKey?: string,
): Promise<LlmGradedAnswer[]> => {
  const subject = sanitizeForPrompt(params.subject);
  const systemPrompt = buildGradingSystemPrompt();
  const userMessage = buildGradingUserMessage({
    subject,
    questionsAndAnswers: params.answers,
  });
  const client = resolveAnthropicClient(apiKey);

  const rawResults = await runWithRetry<LlmGradedAnswer[]>(
    systemPrompt,
    userMessage,
    'results',
    llmGradedAnswersOutputSchema,
    LLM_GRADING_TEMPERATURE,
    client,
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
