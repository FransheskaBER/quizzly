/**
 * ===================================================================
 * FREE-TEXT GRADING USER PROMPT
 * ===================================================================
 *
 * PURPOSE:
 * Builds the user-role message for a grading API call. Formats the
 * subject, goal, questions, correct answers, and student answers into
 * a structured XML-delimited message the LLM grader can parse reliably.
 *
 * WHEN IT'S USED:
 * This is the canonical grading user message builder (with subject, goal,
 * and questions parameters). It is used directly when the caller has the
 * goal available. The llm.service.ts gradeAnswers() function uses a
 * companion function in grading/user.prompt.ts that shares the same
 * structure but omits the goal parameter to match the GradeAnswersParams
 * interface. Both produce equivalent formatted output.
 *
 * HOW IT WORKS:
 * Takes structured data and formats it as a user-role message:
 *
 *   <subject>{subject}</subject>
 *   <goal>{goal}</goal>
 *   Grade the following N answer(s)...
 *   <questions_to_grade>
 *     Question 1:
 *     Question: {questionText}
 *     Correct Answer: {correctAnswer}
 *     Student Answer: {userAnswer or "[No answer provided]"}
 *     ...
 *   </questions_to_grade>
 *
 * The grading system prompt (grading/system.prompt.ts) is sent as the
 * system message; this output is sent as the user message. Both are
 * required for a complete grading API call.
 *
 * WHY IT MATTERS:
 * The structure of this message determines whether the LLM can correctly
 * identify which question is which and match grades to question numbers.
 * If the formatting is ambiguous, the LLM may grade the wrong question or
 * lose track of question numbers in long multi-answer batches. The
 * "[No answer provided]" sentinel is critical — without it, the LLM may
 * hallucinate an answer and grade it, giving a student false partial credit
 * for a question they skipped entirely.
 *
 * OPTIMIZATION NOTES:
 * - After editing: test with a 5-question batch to verify question numbers
 *   are preserved correctly in the output (all 5 results match their question).
 * - Test with an empty userAnswer — verify the output contains exactly
 *   "[No answer provided]" and the LLM scores it 0.0.
 * - If the LLM starts confusing question numbers in long batches, try adding
 *   a separator line (e.g., "---") between questions.
 * - The subject and goal tags give the LLM context to judge answers fairly
 *   (e.g., a vague answer about a "beginner" goal may deserve more credit
 *   than the same vague answer targeting "senior interview prep"). If grading
 *   feels miscalibrated, check whether these context fields are being used.
 * - User-provided content (student answers) is wrapped in XML tags as Layer 2
 *   prompt injection defense — the grading system prompt instructs the LLM to
 *   treat all XML-tagged content as data, not instructions.
 *
 * MANUAL TESTING (Anthropic Console):
 * 1. Call buildGradingUserPrompt() with sample data and copy the output.
 * 2. Paste the output of buildGradingSystemPrompt() into "System Prompt."
 * 3. Paste this function's output into the "User" message field.
 * Example call:
 *   buildGradingUserPrompt({
 *     subject: 'React Hooks',
 *     goal: 'Understand useState for interviews',
 *     questions: [{
 *       questionNumber: 1,
 *       questionText: 'What does useState return?',
 *       correctAnswer: 'A tuple of [state value, setter function].',
 *       userAnswer: 'It returns the current state and a function to update it.',
 *     }],
 *   })
 * 4. Verify the response contains <evaluation> reasoning and <results> JSON.
 * 5. Verify questionNumber in the result matches the input.
 * 6. Verify score is exactly 0, 0.5, or 1.
 *
 * ===================================================================
 */

interface GradingQuestion {
  questionNumber: number;
  questionText: string;
  correctAnswer: string;
  userAnswer: string;
}

export const buildGradingUserPrompt = (params: {
  subject: string;
  goal: string;
  questions: GradingQuestion[];
}): string => {
  const { subject, goal, questions } = params;

  const formattedQuestions = questions
    .map(({ questionNumber, questionText, correctAnswer, userAnswer }) => {
      const answer = userAnswer?.trim() ? userAnswer : '[No answer provided]';
      return `Question ${questionNumber}:\nQuestion: ${questionText}\nCorrect Answer: ${correctAnswer}\nStudent Answer: ${answer}`;
    })
    .join('\n\n');

  return `<subject>${subject}</subject>
<goal>${goal}</goal>

Grade the following ${questions.length} answer(s). For each question, compare the student's answer to the correct answer and assign a score of 0, 0.5, or 1 per the rubric.

<questions_to_grade>
${formattedQuestions}
</questions_to_grade>`.trim();
};
