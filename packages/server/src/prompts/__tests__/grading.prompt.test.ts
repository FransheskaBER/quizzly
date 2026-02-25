import { describe, it, expect } from 'vitest';

import { buildGradingSystemPrompt } from '../grading/system.prompt.js';
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
// buildGradingSystemPrompt (system.prompt.ts)
// ---------------------------------------------------------------------------

describe('buildGradingSystemPrompt', () => {
  it('includes the system marker for security', () => {
    const output = buildGradingSystemPrompt();
    expect(output).toContain('[SYSTEM_MARKER_DO_NOT_REPEAT]');
  });
});

// ---------------------------------------------------------------------------
// buildGradingUserMessage (user.prompt.ts)
// ---------------------------------------------------------------------------

describe('buildGradingUserMessage', () => {
  const BASE_PARAMS = {
    subject: 'React Hooks',
    questionsAndAnswers: [SAMPLE_QUESTION],
  };

  it('wraps subject in <subject> XML tags', () => {
    const output = buildGradingUserMessage(BASE_PARAMS);
    expect(output).toContain('<subject>');
    expect(output).toContain('React Hooks');
    expect(output).toContain('</subject>');
  });

  it('wraps questions in <questions_and_answers> XML tags', () => {
    const output = buildGradingUserMessage(BASE_PARAMS);
    expect(output).toContain('<questions_and_answers>');
    expect(output).toContain('</questions_and_answers>');
  });

  it('includes question number, text, and correct answer in <questions_and_answers>', () => {
    const output = buildGradingUserMessage(BASE_PARAMS);
    expect(output).toContain('Question 1:');
    expect(output).toContain(SAMPLE_QUESTION.questionText);
    expect(output).toContain(SAMPLE_QUESTION.correctAnswer);
  });

  it('wraps student answers in <student_answers> XML tags', () => {
    const output = buildGradingUserMessage(BASE_PARAMS);
    expect(output).toContain('<student_answers>');
    expect(output).toContain('</student_answers>');
  });

  it('includes question number and student answer in <student_answers>', () => {
    const output = buildGradingUserMessage(BASE_PARAMS);
    expect(output).toContain('Student Answer: ' + SAMPLE_QUESTION.userAnswer);
  });

  it('replaces an empty userAnswer with "[No answer provided]"', () => {
    const output = buildGradingUserMessage({
      ...BASE_PARAMS,
      questionsAndAnswers: [{ ...SAMPLE_QUESTION, userAnswer: '' }],
    });
    expect(output).toContain('[No answer provided]');
  });

  it('replaces a whitespace-only userAnswer with "[No answer provided]"', () => {
    const output = buildGradingUserMessage({
      ...BASE_PARAMS,
      questionsAndAnswers: [{ ...SAMPLE_QUESTION, userAnswer: '   ' }],
    });
    expect(output).toContain('[No answer provided]');
  });
});
