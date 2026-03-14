import { describe, it, expect, vi, beforeEach } from 'vitest';

import { QuizDifficulty, AnswerFormat, QuestionType } from '@skills-trainer/shared';

const mockByokStream = vi.fn();
vi.mock('@anthropic-ai/sdk', () => {
  class AuthenticationError extends Error {
    status = 401;
    constructor(message: string) {
      super(message);
      this.name = 'AuthenticationError';
    }
  }
  class PermissionDeniedError extends Error {
    status = 403;
    constructor(message: string) {
      super(message);
      this.name = 'PermissionDeniedError';
    }
  }
  class RateLimitError extends Error {
    status = 429;
    constructor(message: string) {
      super(message);
      this.name = 'RateLimitError';
    }
  }
  class MockAnthropic {
    messages = { stream: mockByokStream };
  }
  (MockAnthropic as Record<string, unknown>).AuthenticationError = AuthenticationError;
  (MockAnthropic as Record<string, unknown>).PermissionDeniedError = PermissionDeniedError;
  (MockAnthropic as Record<string, unknown>).RateLimitError = RateLimitError;
  return { default: MockAnthropic, AuthenticationError, PermissionDeniedError, RateLimitError };
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
  escapeXml: vi.fn((s: string) => s),
}));
vi.mock('../../utils/sentry.utils.js', () => ({
  captureExceptionOnce: vi.fn(),
  markErrorAsCaptured: vi.fn(),
}));

import anthropic from '../../config/anthropic.js';
import { streamQuestions, generateReplacementQuestion } from '../llm.service.js';
import { BadRequestError } from '../../utils/errors.js';
import { captureExceptionOnce } from '../../utils/sentry.utils.js';
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

  it('parses correctly when response arrives as large multi-character chunks', async () => {
    const q1Json = JSON.stringify(VALID_QUESTION_1);
    const q2Json = JSON.stringify(VALID_QUESTION_2);
    // Simulate realistic Anthropic deltas — variable-size chunks
    const chunks = [
      '<analysis>thinking</analy',
      'sis>\n<questions>[',
      q1Json,
      ',',
      q2Json,
      ']</questions>',
    ];

    vi.mocked(anthropic.messages.stream).mockReturnValue(
      mockStreamEvents(chunks) as unknown as ReturnType<typeof anthropic.messages.stream>,
    );

    const onValid = vi.fn().mockResolvedValue(undefined);
    const onMalformed = vi.fn();

    const result = await streamQuestions(DEFAULT_PARAMS, onValid, onMalformed);

    expect(result.validCount).toBe(2);
    expect(onMalformed).not.toHaveBeenCalled();
  });

  it('parses correctly when the entire response arrives as a single chunk', async () => {
    const q1Json = JSON.stringify(VALID_QUESTION_1);
    const fullResponse = `<analysis>thinking</analysis>\n<questions>[${q1Json}]</questions>`;

    vi.mocked(anthropic.messages.stream).mockReturnValue(
      mockStreamEvents([fullResponse]) as unknown as ReturnType<typeof anthropic.messages.stream>,
    );

    const onValid = vi.fn().mockResolvedValue(undefined);
    const onMalformed = vi.fn();

    const result = await streamQuestions(DEFAULT_PARAMS, onValid, onMalformed);

    expect(result.validCount).toBe(1);
    expect(onMalformed).not.toHaveBeenCalled();
  });

  it('parses correctly when <questions> tag is split across chunk boundaries', async () => {
    const q1Json = JSON.stringify(VALID_QUESTION_1);
    // Split the tag: '<ques' in one chunk, 'tions>' in the next
    const chunks = ['<analysis>ok</analysis><ques', `tions>[${q1Json}]</questions>`];

    vi.mocked(anthropic.messages.stream).mockReturnValue(
      mockStreamEvents(chunks) as unknown as ReturnType<typeof anthropic.messages.stream>,
    );

    const onValid = vi.fn().mockResolvedValue(undefined);
    const onMalformed = vi.fn();

    const result = await streamQuestions(DEFAULT_PARAMS, onValid, onMalformed);

    expect(result.validCount).toBe(1);
    expect(onMalformed).not.toHaveBeenCalled();
  });

  it('ignores braces inside JSON string values (e.g. code snippets)', async () => {
    const questionWithBraces = {
      ...VALID_QUESTION_1,
      questionText: 'What does {} mean in Go? Consider: func main() { fmt.Println("hello") }',
      explanation: 'Braces {} delimit blocks in Go.',
    };
    const q1Json = JSON.stringify(questionWithBraces);
    const fullResponse = `<questions>[${q1Json}]</questions>`;

    // Use multi-character chunks — realistic Anthropic deltas are 5-50 chars
    const chunks: string[] = [];
    for (let i = 0; i < fullResponse.length; i += 20) {
      chunks.push(fullResponse.slice(i, i + 20));
    }

    vi.mocked(anthropic.messages.stream).mockReturnValue(
      mockStreamEvents(chunks) as unknown as ReturnType<typeof anthropic.messages.stream>,
    );

    const onValid = vi.fn().mockResolvedValue(undefined);
    const onMalformed = vi.fn();

    const result = await streamQuestions(DEFAULT_PARAMS, onValid, onMalformed);

    expect(result.validCount).toBe(1);
    expect(onMalformed).not.toHaveBeenCalled();
    expect(onValid).toHaveBeenCalledWith(
      expect.objectContaining({ questionText: questionWithBraces.questionText }),
      1,
    );
  });

  // -------------------------------------------------------------------------
  // Anthropic error handling (RFC AC1-AC4)
  // -------------------------------------------------------------------------

  it('throws BadRequestError with invalid key message when AuthenticationError occurs (AC1)', async () => {
    const { AuthenticationError } = await import('@anthropic-ai/sdk') as unknown as {
      AuthenticationError: new (msg: string) => Error;
    };
    vi.mocked(anthropic.messages.stream).mockImplementation(() => {
      throw new AuthenticationError('Invalid API Key — raw SDK details');
    });

    const onValid = vi.fn().mockResolvedValue(undefined);
    const onMalformed = vi.fn();

    await expect(streamQuestions(DEFAULT_PARAMS, onValid, onMalformed)).rejects.toThrow(BadRequestError);
    await expect(streamQuestions(DEFAULT_PARAMS, onValid, onMalformed)).rejects.toThrow(
      'Your API key appears to be invalid',
    );
  });

  it('throws BadRequestError with invalid key message when PermissionDeniedError occurs (AC2)', async () => {
    const { PermissionDeniedError } = await import('@anthropic-ai/sdk') as unknown as {
      PermissionDeniedError: new (msg: string) => Error;
    };
    vi.mocked(anthropic.messages.stream).mockImplementation(() => {
      throw new PermissionDeniedError('Permission denied — raw SDK details');
    });

    const onValid = vi.fn().mockResolvedValue(undefined);
    const onMalformed = vi.fn();

    await expect(streamQuestions(DEFAULT_PARAMS, onValid, onMalformed)).rejects.toThrow(BadRequestError);
    await expect(streamQuestions(DEFAULT_PARAMS, onValid, onMalformed)).rejects.toThrow(
      'Your API key appears to be invalid',
    );
  });

  it('throws BadRequestError with rate limit message when RateLimitError occurs (AC3)', async () => {
    const { RateLimitError } = await import('@anthropic-ai/sdk') as unknown as {
      RateLimitError: new (msg: string) => Error;
    };
    vi.mocked(anthropic.messages.stream).mockImplementation(() => {
      throw new RateLimitError('Rate limit exceeded — raw SDK details');
    });

    const onValid = vi.fn().mockResolvedValue(undefined);
    const onMalformed = vi.fn();

    await expect(streamQuestions(DEFAULT_PARAMS, onValid, onMalformed)).rejects.toThrow(BadRequestError);
    await expect(streamQuestions(DEFAULT_PARAMS, onValid, onMalformed)).rejects.toThrow(
      'insufficient credits or has hit a rate limit',
    );
  });

  it('logs and captures Sentry before re-throwing Anthropic errors (AC4)', async () => {
    const { AuthenticationError } = await import('@anthropic-ai/sdk') as unknown as {
      AuthenticationError: new (msg: string) => Error;
    };
    vi.mocked(anthropic.messages.stream).mockImplementation(() => {
      throw new AuthenticationError('raw SDK error');
    });

    const onValid = vi.fn().mockResolvedValue(undefined);
    const onMalformed = vi.fn();

    await expect(streamQuestions(DEFAULT_PARAMS, onValid, onMalformed)).rejects.toThrow();

    expect(captureExceptionOnce).toHaveBeenCalledWith(
      expect.any(AuthenticationError),
      expect.objectContaining({
        extra: expect.objectContaining({ operation: 'streamQuestions' }),
      }),
    );
  });

  it('re-throws non-Anthropic errors without sanitizing', async () => {
    const networkError = new Error('ECONNREFUSED');
    vi.mocked(anthropic.messages.stream).mockImplementation(() => {
      throw networkError;
    });

    const onValid = vi.fn().mockResolvedValue(undefined);
    const onMalformed = vi.fn();

    await expect(streamQuestions(DEFAULT_PARAMS, onValid, onMalformed)).rejects.toThrow('ECONNREFUSED');
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
