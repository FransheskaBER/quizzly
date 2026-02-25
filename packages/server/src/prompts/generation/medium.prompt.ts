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
 * In the User message, paste:
 *
 *   <subject>JavaScript Array Methods</subject>
 *   <goal>Understand when to use map vs forEach vs filter for interviews</goal>
 *   <difficulty>medium</difficulty>
 *   <answer_format>mixed</answer_format>
 *   <question_count>4</question_count>
 *   <materials_provided>false</materials_provided>
 *   <materials>No materials provided.</materials>
 *   Generate 4 medium difficulty quiz question(s) in mixed format based on the subject and goal above.
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
- Primary exercise types: COMPARE APPROACHES and CHOOSE THE RIGHT TOOL. SPOT THE BUG is also valid at medium but must use subtle bugs (see below). EVALUATE AI OUTPUT is valid when the code has a non-obvious flaw requiring understanding, not just recognition.
- COMPARE APPROACHES: both implementations must look plausible. The correct choice depends on a concrete constraint (time complexity, memory, mutability, use-case context). The student must justify their choice with explicit reasoning — "this is O(n log n) while this is O(n²) for the given input size."
- CHOOSE THE RIGHT TOOL: present a realistic scenario with a specific constraint. The correct algorithm or data structure is not immediately obvious — the student must reason about the problem's shape (e.g. frequency counting, ordering requirements, lookup speed).
- SPOT THE BUG at medium: bugs must be subtle — a logical error that looks correct at first glance, an off-by-one that only surfaces under specific conditions, or an edge case the implementation misses. Not a wrong method name or typo.
- Scenarios may connect 2 related concepts or apply a concept to a context not explicitly covered in the materials — but never 3+ concepts or deep expertise.
- MCQ distractors: represent mistakes that experienced beginners actually make — wrong but require genuine understanding to distinguish from the correct answer. Not obviously wrong at a glance.
- Free-text answers: expect explanation and analysis (3–5 sentences). A correct answer demonstrates reasoning about trade-offs, not just recall of what was written.
- Success signal: cannot be answered by keyword-scanning the material — requires reading carefully and reasoning about the specific scenario.
- Do NOT make exercises that are simply definitions with longer phrasing (that's easy). Do NOT require 3+ concept synthesis or architectural expertise (that's hard).`.trim();
