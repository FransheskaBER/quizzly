/**
 * ===================================================================
 * MEDIUM DIFFICULTY CALIBRATION PROMPT
 * ===================================================================
 *
 * PURPOSE:
 * Defines what "medium" means for Quizzly exercise generation — calibrates
 * exercises to require applied reasoning and trade-off analysis rather than
 * surface-level identification. Students must think carefully about why one
 * approach is better, what algorithmic implications a choice has, or why a
 * subtle bug is wrong — not just spot an obvious error.
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
 * Too easy: the student spots an obvious bug or picks the faster algorithm
 * without needing to reason about the trade-off (that's easy).
 * Too hard: the student needs to synthesise 3+ concepts or reason about
 * deep architectural implications (that's hard).
 * The sweet spot: "I know these concepts, but I need to think to choose
 * the right one here and justify why." Medium must train judgment, not
 * just identification.
 *
 * OPTIMIZATION NOTES:
 * - Primary failure mode (wrong type): LLM generates SPOT THE BUG with
 *   an obvious bug, which is easy. Medium SPOT THE BUG requires a subtle
 *   logical error — not a typo or wrong method, but a correct-looking
 *   implementation that fails under a specific condition.
 * - Primary failure mode (too easy): COMPARE APPROACHES where one option
 *   is obviously better. Both approaches must look plausible; the student
 *   has to reason about constraints to pick the right one.
 * - Primary failure mode (too hard): exercises that require combining 3+
 *   concepts or expertise the materials don't provide. Stick to 2 related
 *   concepts at most.
 * - After editing: generate 5 medium questions. Verify you cannot answer
 *   them by keyword-scanning the material — you must read carefully and
 *   reason. If any answer is immediately obvious from the question text,
 *   the exercise is too easy.
 * - For COMPARE APPROACHES: the "why" must reference a concrete trade-off
 *   (time complexity, memory use, readability in a given context), not just
 *   "this one is cleaner."
 *
 * MANUAL TESTING (Anthropic Console):
 * Paste the output of buildGenerationSystemPrompt() into the System Prompt field.
 * In the User message, paste: "Please generate the exercises based on the provided system instructions and inputs."
 *
 * Verify: questions require active reasoning about trade-offs or subtle
 * correctness, not just recall or obvious identification. At least one
 * COMPARE APPROACHES question should require explaining why one method
 * suits the scenario better (e.g. "you need a new array" vs "side effects
 * are intentional"). MCQ distractors should be tempting to someone who
 * has studied but hasn't applied the concept under constraints.
 *
 * ===================================================================
 */

export const getMediumDifficultyPrompt = (): string =>
  `MEDIUM difficulty calibration:
- Exercise Type Restrictions: For MEDIUM, prioritize COMPARE APPROACHES, CHOOSE THE RIGHT TOOL, PROMPT CONSTRUCTION, and PREDICT THE FAILURE. SPOT THE BUG is valid but must use subtle bugs. EVALUATE AI OUTPUT is valid when the code has a non-obvious flaw requiring understanding.
- General Requirement: Must require active reasoning and analysis, not just keyword recall or pattern matching.
- For COMPARE APPROACHES: Verify both options look plausible and the choice depends on concrete constraints (time/space complexity, mutability, specific use-case requirements).
- For CHOOSE THE RIGHT TOOL: Verify the scenario has specific constraints that make the correct choice non-obvious.
- For SPOT THE BUG: Verify the bug is subtle (logical error, edge case, off-by-one under specific conditions) — not a typo or obviously wrong method name.
- For PROMPT CONSTRUCTION: Verify it requires specifying error handling, input validation, return types, and at least one non-obvious constraint.
- For PREDICT THE FAILURE: Verify the code looks correct on casual inspection and the bug stems from common patterns (wrong defaults, async issues, missing null checks, boundary conditions, loose test assertions).
- Multiple Choice Questions (if applicable): Distractors must represent genuine mistakes experienced beginners make. They must require genuine understanding to distinguish from the correct answer (plausibly wrong rather than obviously wrong).
- Free-text answers: Require 3-5 sentences of explanation/reasoning.
- Complexity limits: Do NOT require 3+ concept synthesis or deep architectural expertise. Cannot be answered by simply scanning for keywords.
- Analysis Checks: In your <analysis> block, ensure you explicitly consider whether the exercise requires genuine understanding vs. keyword-scanning, and confirm the MCQ distractors are plausibly wrong.`.trim();
