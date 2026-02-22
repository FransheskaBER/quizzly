/**
 * ===================================================================
 * MEDIUM DIFFICULTY CALIBRATION PROMPT
 * ===================================================================
 *
 * PURPOSE:
 * Defines what "medium" means for quiz question generation — calibrates
 * questions to test applied understanding rather than recall, requiring
 * genuine comprehension to answer correctly.
 *
 * WHEN IT'S USED:
 * Imported and embedded by buildGenerationSystemPrompt() in
 * generation/system.prompt.ts. The system prompt includes all three
 * difficulty calibrations; the LLM applies the one matching the
 * <difficulty>medium</difficulty> tag passed in the user message. Not
 * called directly by llm.service.ts — accessed through the system prompt.
 *
 * HOW IT WORKS:
 * This function returns a plain string section embedded verbatim into the
 * DIFFICULTY CALIBRATION section of the generation system prompt.
 * The full message structure is described in easy.prompt.ts.
 *
 * WHY IT MATTERS:
 * Medium is the most common difficulty and has the narrowest sweet spot.
 * If calibrated too low, medium questions become definition lookups (same as
 * easy). If calibrated too high, they become research problems (same as hard).
 * The wrong calibration means users can't tell if they're improving — a core
 * value proposition of the product fails silently.
 *
 * OPTIMIZATION NOTES:
 * - Primary failure mode (too easy): questions only ask "what is X?" with the
 *   answer directly in the materials. If a student can answer by copying a
 *   sentence from the study material, the question is not medium.
 * - Primary failure mode (too hard): questions require combining 3+ concepts
 *   or deep expertise. If the correct answer requires reasoning not derivable
 *   from the materials, the question belongs at hard.
 * - Sweet spot: "I understand this concept, but I need to think to apply it here."
 * - After editing: generate 5 medium questions. Verify you cannot answer them
 *   correctly by keyword-scanning the material — but you can after carefully
 *   re-reading and reasoning about it.
 * - For code questions: the bug or output should require tracing execution, not
 *   just recognizing a keyword. An off-by-one error in a loop is medium; a
 *   memory leak from circular references is hard.
 *
 * MANUAL TESTING (Anthropic Console):
 * Paste the output of buildGenerationSystemPrompt() into the System Prompt field.
 * In the User message, paste:
 *
 *   <subject>JavaScript Arrays</subject>
 *   <goal>Understand when to use map vs forEach vs filter</goal>
 *   <difficulty>medium</difficulty>
 *   <answer_format>mixed</answer_format>
 *   <question_count>4</question_count>
 *   <materials_provided>false</materials_provided>
 *   <materials>No materials provided.</materials>
 *   Generate 4 medium difficulty quiz question(s) in mixed format based on the subject and goal above.
 *
 * Verify: questions ask about application and trade-offs (e.g., "which method
 * would you choose to build a new array?"), not just definitions. MCQ distractors
 * are methods that look like they could work but are incorrect for the specific
 * use case. At least one free_text question requires a short explanation.
 *
 * ===================================================================
 */

export const getMediumDifficultyPrompt = (): string =>
  `MEDIUM difficulty calibration:
- Focus on applied understanding: using concepts in new contexts, comparing approaches, and identifying trade-offs.
- Questions may connect 2 related concepts or apply a concept to a scenario not explicitly covered in the materials.
- MCQ distractors: represent mistakes that experienced beginners actually make — wrong, but require genuine understanding to distinguish from the correct answer (not obviously wrong at a glance).
- Free-text answers: expect explanations and analysis (3–5 sentences). A correct answer demonstrates understanding, not just recall of what was written.
- Code questions: predict the output of a realistic short snippet, identify a subtle bug, or choose the correct implementation for a stated constraint.
- Success signal: cannot be answered correctly by keyword-scanning the material — requires reading carefully and reasoning about it.
- Do NOT make questions that are simply definitions with longer phrasing (that's easy). Do NOT require combining 3+ concepts or deep expertise (that's hard).`.trim();
