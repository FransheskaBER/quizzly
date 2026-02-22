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

export const buildGradingUserMessage = (params: GradingUserPromptParams): string => {
  const { subject, questionsAndAnswers } = params;

  const qaPairs = questionsAndAnswers
    .map(
      ({ questionNumber, questionText, correctAnswer, userAnswer }) =>
        `Question ${questionNumber}: ${questionText}\nExpected answer: ${correctAnswer}\nUser's answer: ${userAnswer}`,
    )
    .join('\n\n');

  return `Subject: ${subject}

Grade the following ${questionsAndAnswers.length} answer(s):

${qaPairs}`.trim();
};
