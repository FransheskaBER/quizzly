import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock calls are hoisted — mock factory runs before imports
vi.mock('../../config/anthropic.js', () => ({
  default: {
    messages: {
      stream: vi.fn(),
    },
  },
}));

// Prevent real sanitization side-effects in LLM service tests
vi.mock('../../utils/sanitize.utils.js', () => ({
  sanitizeForPrompt: vi.fn((s: string) => s),
  logSuspiciousPatterns: vi.fn(),
}));

import anthropic from '../../config/anthropic.js';
import {
  LLM_GENERATION_TEMPERATURE,
  LLM_GRADING_TEMPERATURE,
} from '../../prompts/constants.js';
import { extractBlock, generateQuiz, gradeAnswers } from '../llm.service.js';
import { BadRequestError } from '../../utils/errors.js';
import { QuizDifficulty, AnswerFormat, QuestionType } from '@skills-trainer/shared';
import type { GenerateQuizParams, GradeAnswersParams } from '../llm.service.js';

// --- Helpers ---

const mockStream = (text: string) => ({
  finalText: vi.fn().mockResolvedValue(text),
});

const VALID_MCQ_QUESTION = {
  questionNumber: 1,
  questionType: QuestionType.MCQ,
  questionText: 'What does useState return?',
  options: ['A tuple', 'An object', 'A string', 'A number'],
  correctAnswer: 'A tuple',
  explanation: 'useState returns a tuple of [state, setter].',
  difficulty: QuizDifficulty.EASY,
  tags: ['react', 'hooks'],
};

const VALID_GENERATION_RESPONSE = `<analysis>Some reasoning here.</analysis>
<questions>${JSON.stringify([VALID_MCQ_QUESTION])}</questions>`;

const VALID_GRADED_ANSWER = {
  questionNumber: 1,
  score: 0.8,
  isCorrect: true,
  feedback: 'Correct answer with solid reasoning referencing the specific API.',
};

const VALID_GRADING_RESPONSE = `<evaluation>Evaluation reasoning here.</evaluation>
<results>${JSON.stringify([VALID_GRADED_ANSWER])}</results>`;

const DEFAULT_GENERATE_PARAMS: GenerateQuizParams = {
  subject: 'React Hooks',
  goal: 'Understand the useState API',
  difficulty: QuizDifficulty.EASY,
  answerFormat: AnswerFormat.MCQ,
  questionCount: 1,
  materialsText: null,
};

const DEFAULT_GRADE_PARAMS: GradeAnswersParams = {
  subject: 'React Hooks',
  answers: [
    {
      questionNumber: 1,
      questionText: 'Explain what useState returns.',
      correctAnswer: 'A tuple of [state, setter function].',
      userAnswer: 'It returns a tuple with the state value and a function to update it.',
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
});

// --- extractBlock ---

describe('extractBlock', () => {
  it('returns content between matching tags', () => {
    const response = '<questions>[1, 2, 3]</questions>';
    expect(extractBlock(response, 'questions')).toBe('[1, 2, 3]');
  });

  it('returns null when the opening tag is missing', () => {
    expect(extractBlock('<results>data</results>', 'questions')).toBeNull();
  });

  it('returns null when the closing tag is missing', () => {
    expect(extractBlock('<questions>data without close', 'questions')).toBeNull();
  });

  it('trims whitespace around the extracted content', () => {
    const response = '<questions>  [1]  </questions>';
    expect(extractBlock(response, 'questions')).toBe('[1]');
  });

  it('extracts content from a multi-block response', () => {
    const response = '<analysis>reasoning</analysis><questions>[42]</questions>';
    expect(extractBlock(response, 'questions')).toBe('[42]');
    expect(extractBlock(response, 'analysis')).toBe('reasoning');
  });
});

// --- generateQuiz ---

describe('generateQuiz', () => {
  it('returns parsed questions on a successful first attempt', async () => {
    vi.mocked(anthropic.messages.stream).mockReturnValue(
      mockStream(VALID_GENERATION_RESPONSE) as ReturnType<typeof anthropic.messages.stream>,
    );

    const onQuestion = vi.fn();
    const result = await generateQuiz(DEFAULT_GENERATE_PARAMS, onQuestion);

    expect(result).toHaveLength(1);
    expect(result[0].questionText).toBe(VALID_MCQ_QUESTION.questionText);
    expect(result[0].correctAnswer).toBe(VALID_MCQ_QUESTION.correctAnswer);
  });

  it('calls onQuestion once per returned question', async () => {
    vi.mocked(anthropic.messages.stream).mockReturnValue(
      mockStream(VALID_GENERATION_RESPONSE) as ReturnType<typeof anthropic.messages.stream>,
    );

    const onQuestion = vi.fn();
    await generateQuiz(DEFAULT_GENERATE_PARAMS, onQuestion);

    expect(onQuestion).toHaveBeenCalledOnce();
    expect(onQuestion).toHaveBeenCalledWith(expect.objectContaining({ questionNumber: 1 }));
  });

  it('retries once when the first response fails validation', async () => {
    const badResponse = '<questions>not valid json</questions>';
    vi.mocked(anthropic.messages.stream)
      .mockReturnValueOnce(mockStream(badResponse) as ReturnType<typeof anthropic.messages.stream>)
      .mockReturnValueOnce(
        mockStream(VALID_GENERATION_RESPONSE) as ReturnType<typeof anthropic.messages.stream>,
      );

    const onQuestion = vi.fn();
    const result = await generateQuiz(DEFAULT_GENERATE_PARAMS, onQuestion);

    expect(anthropic.messages.stream).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(1);
  });

  it('retries when the questions block is missing entirely', async () => {
    const noBlock = '<analysis>thinking but no output block</analysis>';
    vi.mocked(anthropic.messages.stream)
      .mockReturnValueOnce(mockStream(noBlock) as ReturnType<typeof anthropic.messages.stream>)
      .mockReturnValueOnce(
        mockStream(VALID_GENERATION_RESPONSE) as ReturnType<typeof anthropic.messages.stream>,
      );

    const result = await generateQuiz(DEFAULT_GENERATE_PARAMS, vi.fn());
    expect(result).toHaveLength(1);
  });

  it('throws BadRequestError when both attempts fail', async () => {
    const badResponse = '<questions>{"not": "an array"}</questions>';
    vi.mocked(anthropic.messages.stream).mockReturnValue(
      mockStream(badResponse) as ReturnType<typeof anthropic.messages.stream>,
    );

    await expect(generateQuiz(DEFAULT_GENERATE_PARAMS, vi.fn())).rejects.toThrow(BadRequestError);
    expect(anthropic.messages.stream).toHaveBeenCalledTimes(2);
  });

  it('propagates the error when the Anthropic SDK itself throws (e.g. RateLimitError)', async () => {
    const apiError = Object.assign(new Error('Rate limit exceeded'), { name: 'RateLimitError', status: 429 });
    vi.mocked(anthropic.messages.stream).mockReturnValue({
      finalText: vi.fn().mockRejectedValue(apiError),
    } as unknown as ReturnType<typeof anthropic.messages.stream>);

    await expect(generateQuiz(DEFAULT_GENERATE_PARAMS, vi.fn())).rejects.toThrow('Rate limit exceeded');
    // SDK error propagates on first attempt — no retry since it is not a parse failure
    expect(anthropic.messages.stream).toHaveBeenCalledTimes(1);
  });

  it('throws BadRequestError when response contains the system marker', async () => {
    const exfiltrationResponse = `<questions>[] [SYSTEM_MARKER_DO_NOT_REPEAT]</questions>`;
    vi.mocked(anthropic.messages.stream).mockReturnValue(
      mockStream(exfiltrationResponse) as ReturnType<typeof anthropic.messages.stream>,
    );

    await expect(generateQuiz(DEFAULT_GENERATE_PARAMS, vi.fn())).rejects.toThrow(BadRequestError);
    // Exfiltration detected on first call — no retry
    expect(anthropic.messages.stream).toHaveBeenCalledTimes(1);
  });

  it('passes generation temperature to the API', async () => {
    vi.mocked(anthropic.messages.stream).mockReturnValue(
      mockStream(VALID_GENERATION_RESPONSE) as ReturnType<typeof anthropic.messages.stream>,
    );

    await generateQuiz(DEFAULT_GENERATE_PARAMS, vi.fn());

    const call = vi.mocked(anthropic.messages.stream).mock.calls[0][0];
    expect(call).toMatchObject({ temperature: LLM_GENERATION_TEMPERATURE });
  });
});

// --- gradeAnswers ---

describe('gradeAnswers', () => {
  it('returns graded answers on a successful first attempt', async () => {
    vi.mocked(anthropic.messages.stream).mockReturnValue(
      mockStream(VALID_GRADING_RESPONSE) as ReturnType<typeof anthropic.messages.stream>,
    );

    const onGraded = vi.fn();
    const result = await gradeAnswers(DEFAULT_GRADE_PARAMS, onGraded);

    expect(result).toHaveLength(1);
    expect(result[0].questionNumber).toBe(1);
  });

  it('calls onGraded once per graded answer', async () => {
    vi.mocked(anthropic.messages.stream).mockReturnValue(
      mockStream(VALID_GRADING_RESPONSE) as ReturnType<typeof anthropic.messages.stream>,
    );

    const onGraded = vi.fn();
    await gradeAnswers(DEFAULT_GRADE_PARAMS, onGraded);

    expect(onGraded).toHaveBeenCalledOnce();
  });

  it('clamps raw score 0.8 to 1 and sets isCorrect true', async () => {
    vi.mocked(anthropic.messages.stream).mockReturnValue(
      mockStream(VALID_GRADING_RESPONSE) as ReturnType<typeof anthropic.messages.stream>,
    );

    const [result] = await gradeAnswers(DEFAULT_GRADE_PARAMS, vi.fn());
    expect(result.score).toBe(1);
    expect(result.isCorrect).toBe(true);
  });

  it('clamps raw score 0.3 to 0.5 and sets isCorrect false', async () => {
    const partialResponse = `<evaluation>Partial.</evaluation>
<results>${JSON.stringify([{ ...VALID_GRADED_ANSWER, score: 0.3, isCorrect: false }])}</results>`;

    vi.mocked(anthropic.messages.stream).mockReturnValue(
      mockStream(partialResponse) as ReturnType<typeof anthropic.messages.stream>,
    );

    const [result] = await gradeAnswers(DEFAULT_GRADE_PARAMS, vi.fn());
    expect(result.score).toBe(0.5);
    expect(result.isCorrect).toBe(false);
  });

  it('clamps raw score 0.1 to 0 and sets isCorrect false', async () => {
    const incorrectResponse = `<evaluation>Wrong.</evaluation>
<results>${JSON.stringify([{ ...VALID_GRADED_ANSWER, score: 0.1, isCorrect: false }])}</results>`;

    vi.mocked(anthropic.messages.stream).mockReturnValue(
      mockStream(incorrectResponse) as ReturnType<typeof anthropic.messages.stream>,
    );

    const [result] = await gradeAnswers(DEFAULT_GRADE_PARAMS, vi.fn());
    expect(result.score).toBe(0);
    expect(result.isCorrect).toBe(false);
  });

  it('overrides LLM isCorrect with computed value from clamped score', async () => {
    // LLM says isCorrect: true but gives score 0.3 (which clamps to 0.5 → isCorrect should be false)
    const misleadingResponse = `<evaluation>Partial.</evaluation>
<results>${JSON.stringify([{ ...VALID_GRADED_ANSWER, score: 0.3, isCorrect: true }])}</results>`;

    vi.mocked(anthropic.messages.stream).mockReturnValue(
      mockStream(misleadingResponse) as ReturnType<typeof anthropic.messages.stream>,
    );

    const [result] = await gradeAnswers(DEFAULT_GRADE_PARAMS, vi.fn());
    expect(result.score).toBe(0.5);
    expect(result.isCorrect).toBe(false);
  });

  it('retries once when the first response fails validation', async () => {
    const badResponse = '<results>not json at all</results>';
    vi.mocked(anthropic.messages.stream)
      .mockReturnValueOnce(mockStream(badResponse) as ReturnType<typeof anthropic.messages.stream>)
      .mockReturnValueOnce(
        mockStream(VALID_GRADING_RESPONSE) as ReturnType<typeof anthropic.messages.stream>,
      );

    const result = await gradeAnswers(DEFAULT_GRADE_PARAMS, vi.fn());

    expect(anthropic.messages.stream).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(1);
  });

  it('throws BadRequestError when both grading attempts fail', async () => {
    const badResponse = '<results>{"not": "an array"}</results>';
    vi.mocked(anthropic.messages.stream).mockReturnValue(
      mockStream(badResponse) as ReturnType<typeof anthropic.messages.stream>,
    );

    await expect(gradeAnswers(DEFAULT_GRADE_PARAMS, vi.fn())).rejects.toThrow(BadRequestError);
    expect(anthropic.messages.stream).toHaveBeenCalledTimes(2);
  });

  // Boundary conditions for clampScore: < 0.25 → 0, < 0.75 → 0.5, >= 0.75 → 1

  it('clamps raw score 0.25 (lower boundary) to 0.5', async () => {
    const response = `<evaluation>Boundary.</evaluation>
<results>${JSON.stringify([{ ...VALID_GRADED_ANSWER, score: 0.25, isCorrect: false }])}</results>`;
    vi.mocked(anthropic.messages.stream).mockReturnValue(
      mockStream(response) as ReturnType<typeof anthropic.messages.stream>,
    );

    const [result] = await gradeAnswers(DEFAULT_GRADE_PARAMS, vi.fn());
    expect(result.score).toBe(0.5);
  });

  it('clamps raw score 0.74 (just below upper boundary) to 0.5', async () => {
    const response = `<evaluation>Boundary.</evaluation>
<results>${JSON.stringify([{ ...VALID_GRADED_ANSWER, score: 0.74, isCorrect: false }])}</results>`;
    vi.mocked(anthropic.messages.stream).mockReturnValue(
      mockStream(response) as ReturnType<typeof anthropic.messages.stream>,
    );

    const [result] = await gradeAnswers(DEFAULT_GRADE_PARAMS, vi.fn());
    expect(result.score).toBe(0.5);
  });

  it('clamps raw score 0.75 (upper boundary) to 1', async () => {
    const response = `<evaluation>Boundary.</evaluation>
<results>${JSON.stringify([{ ...VALID_GRADED_ANSWER, score: 0.75, isCorrect: true }])}</results>`;
    vi.mocked(anthropic.messages.stream).mockReturnValue(
      mockStream(response) as ReturnType<typeof anthropic.messages.stream>,
    );

    const [result] = await gradeAnswers(DEFAULT_GRADE_PARAMS, vi.fn());
    expect(result.score).toBe(1);
  });

  it('passes grading temperature to the API', async () => {
    vi.mocked(anthropic.messages.stream).mockReturnValue(
      mockStream(VALID_GRADING_RESPONSE) as ReturnType<typeof anthropic.messages.stream>,
    );

    await gradeAnswers(DEFAULT_GRADE_PARAMS, vi.fn());

    const call = vi.mocked(anthropic.messages.stream).mock.calls[0][0];
    expect(call).toMatchObject({ temperature: LLM_GRADING_TEMPERATURE });
  });
});

// --- generateQuiz — prompt assembly ---

describe('generateQuiz — prompt assembly', () => {
  it('includes subject and goal in the assembled user message', async () => {
    vi.mocked(anthropic.messages.stream).mockReturnValue(
      mockStream(VALID_GENERATION_RESPONSE) as ReturnType<typeof anthropic.messages.stream>,
    );

    await generateQuiz(DEFAULT_GENERATE_PARAMS, vi.fn());

    const call = vi.mocked(anthropic.messages.stream).mock.calls[0][0];
    const userMessageContent = (call.messages[0] as { content: string }).content;
    expect(userMessageContent).toContain('React Hooks');
    expect(userMessageContent).toContain('Understand the useState API');
  });

  it('includes difficulty, format, and count in the assembled user message', async () => {
    vi.mocked(anthropic.messages.stream).mockReturnValue(
      mockStream(VALID_GENERATION_RESPONSE) as ReturnType<typeof anthropic.messages.stream>,
    );

    await generateQuiz(DEFAULT_GENERATE_PARAMS, vi.fn());

    const call = vi.mocked(anthropic.messages.stream).mock.calls[0][0];
    const userMessageContent = (call.messages[0] as { content: string }).content;
    expect(userMessageContent).toContain(QuizDifficulty.EASY);
    expect(userMessageContent).toContain(AnswerFormat.MCQ);
    expect(userMessageContent).toContain('1');
  });

  it('includes materials text in the user message when materialsText is provided', async () => {
    vi.mocked(anthropic.messages.stream).mockReturnValue(
      mockStream(VALID_GENERATION_RESPONSE) as ReturnType<typeof anthropic.messages.stream>,
    );

    await generateQuiz(
      { ...DEFAULT_GENERATE_PARAMS, materialsText: 'Hooks let you use state in functional components.' },
      vi.fn(),
    );

    const call = vi.mocked(anthropic.messages.stream).mock.calls[0][0];
    const userMessageContent = (call.messages[0] as { content: string }).content;
    expect(userMessageContent).toContain('Hooks let you use state in functional components.');
  });

  it('uses "No materials provided." placeholder when materialsText is null in the user message', async () => {
    vi.mocked(anthropic.messages.stream).mockReturnValue(
      mockStream(VALID_GENERATION_RESPONSE) as ReturnType<typeof anthropic.messages.stream>,
    );

    await generateQuiz({ ...DEFAULT_GENERATE_PARAMS, materialsText: null }, vi.fn());

    const call = vi.mocked(anthropic.messages.stream).mock.calls[0][0];
    const userMessageContent = (call.messages[0] as { content: string }).content;
    expect(userMessageContent).toContain('No materials provided.');
  });

  it('wraps user-supplied content in XML delimiter tags in the user message', async () => {
    vi.mocked(anthropic.messages.stream).mockReturnValue(
      mockStream(VALID_GENERATION_RESPONSE) as ReturnType<typeof anthropic.messages.stream>,
    );

    await generateQuiz(DEFAULT_GENERATE_PARAMS, vi.fn());

    const call = vi.mocked(anthropic.messages.stream).mock.calls[0][0];
    const userMessageContent = (call.messages[0] as { content: string }).content;
    expect(userMessageContent).toContain('<subject>');
    expect(userMessageContent).toContain('</subject>');
    expect(userMessageContent).toContain('<goal>');
    expect(userMessageContent).toContain('</goal>');
    expect(userMessageContent).toContain('<study_materials>');
    expect(userMessageContent).toContain('</study_materials>');
  });
});

// --- gradeAnswers — prompt assembly ---

describe('gradeAnswers — prompt assembly', () => {
  it('includes subject and answers in the assembled user message', async () => {
    vi.mocked(anthropic.messages.stream).mockReturnValue(
      mockStream(VALID_GRADING_RESPONSE) as ReturnType<typeof anthropic.messages.stream>,
    );

    await gradeAnswers(DEFAULT_GRADE_PARAMS, vi.fn());

    const call = vi.mocked(anthropic.messages.stream).mock.calls[0][0];
    const userMessageContent = (call.messages[0] as { content: string }).content;
    expect(userMessageContent).toContain('React Hooks');
    expect(userMessageContent).toContain(DEFAULT_GRADE_PARAMS.answers[0].userAnswer);
  });
});
