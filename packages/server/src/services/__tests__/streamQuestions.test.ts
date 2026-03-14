import { describe, it, expect, vi, beforeEach } from 'vitest';

import { QuizDifficulty, AnswerFormat, QuestionType } from '@skills-trainer/shared';

vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    messages = { stream: vi.fn() };
  }
  return { default: MockAnthropic };
});

vi.mock('../../config/anthropic.js', () => ({
  default: {
    messages: {
      stream: vi.fn(),
    },
  },
}));
vi.mock('../../config/sentry.js', () => ({
  Sentry: { captureException: vi.fn() },
}));
vi.mock('../../utils/sanitize.utils.js', () => ({
  sanitizeForPrompt: vi.fn((s: string) => s),
  logSuspiciousPatterns: vi.fn(),
}));

import anthropic from '../../config/anthropic.js';
import { streamQuestions, generateReplacementQuestion } from '../llm.service.js';
import type { GenerateQuizParams } from '../llm.service.js';

// --- Helpers ---

const VALID_QUESTION_1 = {
  questionNumber: 1,
  questionType: QuestionType.MCQ,
  questionText: 'What does useState return?',
  options: ['A tuple', 'An object', 'A string', 'A number'],
  correctAnswer: 'A tuple',
  explanation: 'useState returns a tuple.',
  difficulty: QuizDifficulty.EASY,
  tags: ['react'],
};

const VALID_QUESTION_2 = {
  questionNumber: 2,
  questionType: QuestionType.MCQ,
  questionText: 'What is useEffect for?',
  options: ['Side effects', 'State', 'Routing', 'Styling'],
  correctAnswer: 'Side effects',
  explanation: 'useEffect handles side effects.',
  difficulty: QuizDifficulty.EASY,
  tags: ['react'],
};

const DEFAULT_PARAMS: GenerateQuizParams = {
  subject: 'React Hooks',
  goal: 'Understand hooks',
  difficulty: QuizDifficulty.EASY,
  answerFormat: AnswerFormat.MCQ,
  questionCount: 2,
  materialsText: null,
};

/**
 * Creates a mock async iterable that yields SSE-like text_delta events.
 * Each chunk string is yielded as a separate event.
 */
const mockStreamEvents = (chunks: string[]) => {
  const events = chunks.map((text) => ({
    type: 'content_block_delta' as const,
    delta: { type: 'text_delta' as const, text },
  }));

  return {
    [Symbol.asyncIterator]: async function* () {
      for (const event of events) {
        yield event;
      }
    },
  };
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// streamQuestions
// ---------------------------------------------------------------------------

describe('streamQuestions', () => {
  it('yields valid questions with sequential assigned numbers', async () => {
    const q1Json = JSON.stringify(VALID_QUESTION_1);
    const q2Json = JSON.stringify(VALID_QUESTION_2);
    const fullResponse = `<analysis>thinking</analysis>\n<questions>[${q1Json},${q2Json}]</questions>`;

    // Send as multiple chunks to simulate streaming
    vi.mocked(anthropic.messages.stream).mockReturnValue(
      mockStreamEvents(fullResponse.split('')) as unknown as ReturnType<typeof anthropic.messages.stream>,
    );

    const onValid = vi.fn().mockResolvedValue(undefined);
    const onMalformed = vi.fn();

    const result = await streamQuestions(DEFAULT_PARAMS, onValid, onMalformed);

    expect(result.validCount).toBe(2);
    expect(result.malformedSlots).toHaveLength(0);
    expect(onValid).toHaveBeenCalledTimes(2);
    expect(onValid).toHaveBeenNthCalledWith(1, expect.objectContaining({ questionText: 'What does useState return?' }), 1);
    expect(onValid).toHaveBeenNthCalledWith(2, expect.objectContaining({ questionText: 'What is useEffect for?' }), 2);
    expect(onMalformed).not.toHaveBeenCalled();
  });

  it('detects malformed questions and calls onMalformedQuestion', async () => {
    const validJson = JSON.stringify(VALID_QUESTION_1);
    const malformedJson = '{"questionNumber": 2, "bad": true}';
    const fullResponse = `<questions>[${validJson},${malformedJson}]</questions>`;

    vi.mocked(anthropic.messages.stream).mockReturnValue(
      mockStreamEvents(fullResponse.split('')) as unknown as ReturnType<typeof anthropic.messages.stream>,
    );

    const onValid = vi.fn().mockResolvedValue(undefined);
    const onMalformed = vi.fn();

    const result = await streamQuestions(DEFAULT_PARAMS, onValid, onMalformed);

    expect(result.validCount).toBe(1);
    expect(result.malformedSlots).toHaveLength(1);
    expect(result.malformedSlots[0].originalSlotNumber).toBe(2);
    expect(onValid).toHaveBeenCalledTimes(1);
    expect(onMalformed).toHaveBeenCalledTimes(1);
    expect(onMalformed).toHaveBeenCalledWith(malformedJson, expect.any(Object), 2);
  });

  it('renumbers valid questions skipping malformed slots', async () => {
    const q1 = JSON.stringify(VALID_QUESTION_1);
    const malformed = '{"invalid": true}';
    const q3 = JSON.stringify({ ...VALID_QUESTION_2, questionNumber: 3 });
    const fullResponse = `<questions>[${q1},${malformed},${q3}]</questions>`;

    vi.mocked(anthropic.messages.stream).mockReturnValue(
      mockStreamEvents(fullResponse.split('')) as unknown as ReturnType<typeof anthropic.messages.stream>,
    );

    const onValid = vi.fn().mockResolvedValue(undefined);
    const onMalformed = vi.fn();

    const result = await streamQuestions(DEFAULT_PARAMS, onValid, onMalformed);

    expect(result.validCount).toBe(2);
    expect(result.malformedSlots).toHaveLength(1);
    // First valid gets assignedNumber 1, second valid gets assignedNumber 2 (not 3)
    expect(onValid).toHaveBeenNthCalledWith(1, expect.anything(), 1);
    expect(onValid).toHaveBeenNthCalledWith(2, expect.anything(), 2);
  });

  it('handles unparseable JSON as malformed', async () => {
    const fullResponse = `<questions>[{not valid json}]</questions>`;

    vi.mocked(anthropic.messages.stream).mockReturnValue(
      mockStreamEvents(fullResponse.split('')) as unknown as ReturnType<typeof anthropic.messages.stream>,
    );

    const onValid = vi.fn().mockResolvedValue(undefined);
    const onMalformed = vi.fn();

    const result = await streamQuestions(DEFAULT_PARAMS, onValid, onMalformed);

    expect(result.validCount).toBe(0);
    expect(result.malformedSlots).toHaveLength(1);
    expect(onMalformed).toHaveBeenCalledTimes(1);
  });

  it('detects exfiltration attempts and throws', async () => {
    const fullResponse = `<questions>[SYSTEM_MARKER_DO_NOT_REPEAT]</questions>`;

    vi.mocked(anthropic.messages.stream).mockReturnValue(
      mockStreamEvents(fullResponse.split('')) as unknown as ReturnType<typeof anthropic.messages.stream>,
    );

    const onValid = vi.fn().mockResolvedValue(undefined);
    const onMalformed = vi.fn();

    await expect(streamQuestions(DEFAULT_PARAMS, onValid, onMalformed)).rejects.toThrow(
      'possible prompt exfiltration attempt',
    );
  });

  it('handles questions split across multiple small chunks', async () => {
    const q1Json = JSON.stringify(VALID_QUESTION_1);
    // Simulate realistic streaming: each character is its own event
    const fullResponse = `<questions>[${q1Json}]</questions>`;

    vi.mocked(anthropic.messages.stream).mockReturnValue(
      mockStreamEvents(fullResponse.split('')) as unknown as ReturnType<typeof anthropic.messages.stream>,
    );

    const onValid = vi.fn().mockResolvedValue(undefined);
    const onMalformed = vi.fn();

    const result = await streamQuestions(DEFAULT_PARAMS, onValid, onMalformed);

    expect(result.validCount).toBe(1);
    expect(onValid).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// generateReplacementQuestion
// ---------------------------------------------------------------------------

describe('generateReplacementQuestion', () => {
  it('returns a valid replacement question on success', async () => {
    const response = `<analysis>Replacement.</analysis>\n<questions>${JSON.stringify([VALID_QUESTION_1])}</questions>`;

    vi.mocked(anthropic.messages.stream).mockReturnValue({
      finalText: vi.fn().mockResolvedValue(response),
    } as unknown as ReturnType<typeof anthropic.messages.stream>);

    const result = await generateReplacementQuestion(DEFAULT_PARAMS, ['react']);

    expect(result).not.toBeNull();
    expect(result?.questionText).toBe('What does useState return?');
  });

  it('returns null when LLM fails', async () => {
    vi.mocked(anthropic.messages.stream).mockReturnValue({
      finalText: vi.fn().mockRejectedValue(new Error('LLM error')),
    } as unknown as ReturnType<typeof anthropic.messages.stream>);

    const result = await generateReplacementQuestion(DEFAULT_PARAMS, []);

    expect(result).toBeNull();
  });
});
