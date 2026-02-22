interface QAEntry {
  questionNumber: number;
  questionText: string;
  correctAnswer: string;
  userAnswer: string;
}

interface GradingUserPromptParams {
  subject: string;
  questionsAndAnswers: QAEntry[];
}

/**
 * Builds the user-role message for a grading API call.
 * Called by gradeAnswers() in llm.service.ts.
 *
 * Wraps user content in XML delimiters (Layer 2 injection defense).
 * Empty or whitespace-only answers are replaced with "[No answer provided]"
 * to prevent the LLM from hallucinating an answer and awarding partial credit.
 */
export const buildGradingUserMessage = (params: GradingUserPromptParams): string => {
  const { subject, questionsAndAnswers } = params;

  const formattedQuestions = questionsAndAnswers
    .map(({ questionNumber, questionText, correctAnswer, userAnswer }) => {
      const answer = userAnswer?.trim() ? userAnswer : '[No answer provided]';
      return `Question ${questionNumber}:\nQuestion: ${questionText}\nCorrect Answer: ${correctAnswer}\nStudent Answer: ${answer}`;
    })
    .join('\n\n');

  return `<subject>${subject}</subject>

Grade the following ${questionsAndAnswers.length} answer(s). For each question, compare the student's answer to the correct answer and assign a score of 0, 0.5, or 1 per the rubric.

<questions_to_grade>
${formattedQuestions}
</questions_to_grade>`.trim();
};
