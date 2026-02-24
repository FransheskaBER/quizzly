import { QuizStatus, QuizDifficulty, AnswerFormat, QuestionType } from '@skills-trainer/shared';

import { prisma } from './db.helper.js';

/**
 * Creates an in-progress quiz attempt with one MCQ question and a blank answer.
 * The correct answer is 'A typed superset of JavaScript'.
 * Use in integration tests to set up a takeable quiz without going through the
 * generation route.
 */
export const createQuizWithAnswers = async (
  userId: string,
  sessionId: string,
): Promise<{ attemptId: string; questionId: string; answerId: string }> => {
  const attempt = await prisma.quizAttempt.create({
    data: {
      sessionId,
      userId,
      difficulty: QuizDifficulty.EASY,
      answerFormat: AnswerFormat.MCQ,
      questionCount: 1,
      materialsUsed: false,
      status: QuizStatus.IN_PROGRESS,
      startedAt: new Date(),
    },
  });

  const question = await prisma.question.create({
    data: {
      quizAttemptId: attempt.id,
      questionNumber: 1,
      questionType: QuestionType.MCQ,
      questionText: 'What is TypeScript?',
      options: [
        'A typed superset of JavaScript',
        'A database',
        'A CSS framework',
        'A markup language',
      ],
      correctAnswer: 'A typed superset of JavaScript',
      explanation: 'TypeScript adds static typing to JavaScript.',
      difficulty: QuizDifficulty.EASY,
      tags: ['typescript'],
    },
  });

  const answer = await prisma.answer.create({
    data: {
      questionId: question.id,
      quizAttemptId: attempt.id,
    },
  });

  return { attemptId: attempt.id, questionId: question.id, answerId: answer.id };
};
