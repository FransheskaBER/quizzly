/**
 * Builds the user-role message for a grading API call.
 * Called by gradeAnswers() in llm.service.ts.
 */
export const buildGradingUserMessage = (): string => {
  return 'Please grade the exercises based on the provided system instructions and inputs.';
};
