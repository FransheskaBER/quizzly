import { escapeXml } from '../../utils/sanitize.utils.js';

export interface QAEntry {
  questionNumber: number;
  questionText: string;
  correctAnswer: string;
  userAnswer: string;
}

export interface GradingUserPromptParams {
  subject: string;
  questionsAndAnswers: QAEntry[];
}

/**
 * Builds the user-role message for a grading API call.
 * Called by gradeAnswers() in llm.service.ts.
 */
export const buildGradingUserMessage = (params: GradingUserPromptParams): string => {
  const { subject, questionsAndAnswers } = params;

  const formattedQuestionsAndAnswers = questionsAndAnswers
    .map(({ questionNumber, questionText, correctAnswer }) => {
      return `Question ${questionNumber}:\nQuestion: ${escapeXml(questionText)}\nCorrect Answer: ${escapeXml(correctAnswer)}`;
    })
    .join('\n\n');

  const formattedStudentAnswers = questionsAndAnswers
    .map(({ questionNumber, userAnswer }) => {
      const answer = userAnswer?.trim() ? userAnswer : '[No answer provided]';
      return `Question ${questionNumber}:\nStudent Answer: ${escapeXml(answer)}`;
    })
    .join('\n\n');

  return `<subject>
${escapeXml(subject)}
</subject>

Here are the questions with their correct answers:

<questions_and_answers>
${formattedQuestionsAndAnswers}
</questions_and_answers>

Here are the student's submitted answers:

<student_answers>
${formattedStudentAnswers}
</student_answers>

Please grade the exercises based on the provided system instructions and inputs.`.trim();
};
