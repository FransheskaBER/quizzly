import { describe, it, expect } from 'vitest';

import { buildGradingUserPrompt } from '../grading/freetext.prompt.js';
import { buildGradingUserMessage } from '../grading/user.prompt.js';

// ---------------------------------------------------------------------------
// Shared fixture
// ---------------------------------------------------------------------------

const SAMPLE_QUESTION = {
  questionNumber: 1,
  questionText: 'What does useState return?',
  correctAnswer: 'A tuple of [state, setter].',
  userAnswer: 'It returns a state variable and a function to update it.',
};

// ---------------------------------------------------------------------------
// buildGradingUserPrompt (freetext.prompt.ts) — has goal param
// ---------------------------------------------------------------------------

describe('buildGradingUserPrompt', () => {
  const BASE_PARAMS = {
    subject: 'React Hooks',
    goal: 'Understand useState for interviews',
    questions: [SAMPLE_QUESTION],
  };

  it('wraps subject in <subject> XML tags', () => {
    const output = buildGradingUserPrompt(BASE_PARAMS);
    expect(output).toContain('<subject>React Hooks</subject>');
  });

  it('wraps goal in <goal> XML tags', () => {
    const output = buildGradingUserPrompt(BASE_PARAMS);
    expect(output).toContain('<goal>Understand useState for interviews</goal>');
  });

  it('wraps questions in <questions_to_grade> XML tags', () => {
    const output = buildGradingUserPrompt(BASE_PARAMS);
    expect(output).toContain('<questions_to_grade>');
    expect(output).toContain('</questions_to_grade>');
  });

  it('includes question number, question text, correct answer, and student answer', () => {
    const output = buildGradingUserPrompt(BASE_PARAMS);
    expect(output).toContain('Question 1:');
    expect(output).toContain(SAMPLE_QUESTION.questionText);
    expect(output).toContain(SAMPLE_QUESTION.correctAnswer);
    expect(output).toContain(SAMPLE_QUESTION.userAnswer);
  });

  it('replaces an empty userAnswer with the "[No answer provided]" sentinel', () => {
    const output = buildGradingUserPrompt({
      ...BASE_PARAMS,
      questions: [{ ...SAMPLE_QUESTION, userAnswer: '' }],
    });
    expect(output).toContain('[No answer provided]');
    expect(output).not.toContain('Student Answer: \n');
  });

  it('replaces a whitespace-only userAnswer with "[No answer provided]"', () => {
    const output = buildGradingUserPrompt({
      ...BASE_PARAMS,
      questions: [{ ...SAMPLE_QUESTION, userAnswer: '   ' }],
    });
    expect(output).toContain('[No answer provided]');
  });

  it('includes the answer count in the preamble', () => {
    const output = buildGradingUserPrompt({
      ...BASE_PARAMS,
      questions: [SAMPLE_QUESTION, { ...SAMPLE_QUESTION, questionNumber: 2 }],
    });
    expect(output).toContain('2 answer(s)');
  });

  it('separates multiple questions with a double newline', () => {
    const output = buildGradingUserPrompt({
      ...BASE_PARAMS,
      questions: [SAMPLE_QUESTION, { ...SAMPLE_QUESTION, questionNumber: 2 }],
    });
    // The formatted questions block should have a blank line between each
    expect(output).toContain('Question 1:\n');
    expect(output).toContain('\n\nQuestion 2:');
  });
});

// ---------------------------------------------------------------------------
// buildGradingUserMessage (user.prompt.ts) — no goal param, used by llm.service
// ---------------------------------------------------------------------------

describe('buildGradingUserMessage', () => {
  const BASE_PARAMS = {
    subject: 'React Hooks',
    questionsAndAnswers: [SAMPLE_QUESTION],
  };

  it('wraps subject in <subject> XML tags', () => {
    const output = buildGradingUserMessage(BASE_PARAMS);
    expect(output).toContain('<subject>React Hooks</subject>');
  });

  it('wraps questions in <questions_to_grade> XML tags', () => {
    const output = buildGradingUserMessage(BASE_PARAMS);
    expect(output).toContain('<questions_to_grade>');
    expect(output).toContain('</questions_to_grade>');
  });

  it('includes question number, text, correct answer, and student answer', () => {
    const output = buildGradingUserMessage(BASE_PARAMS);
    expect(output).toContain('Question 1:');
    expect(output).toContain(SAMPLE_QUESTION.questionText);
    expect(output).toContain(SAMPLE_QUESTION.correctAnswer);
    expect(output).toContain(SAMPLE_QUESTION.userAnswer);
  });

  it('replaces an empty userAnswer with "[No answer provided]"', () => {
    const output = buildGradingUserMessage({
      ...BASE_PARAMS,
      questionsAndAnswers: [{ ...SAMPLE_QUESTION, userAnswer: '' }],
    });
    expect(output).toContain('[No answer provided]');
  });

  it('does not include a <goal> tag (no goal param in this variant)', () => {
    const output = buildGradingUserMessage(BASE_PARAMS);
    expect(output).not.toContain('<goal>');
  });
});
