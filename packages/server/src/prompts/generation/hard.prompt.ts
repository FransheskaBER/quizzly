/**
 * ===================================================================
 * HARD DIFFICULTY CALIBRATION PROMPT
 * ===================================================================
 *
 * PURPOSE:
 * Defines what "hard" means for Quizzly exercise generation — calibrates
 * exercises to test architectural thinking, multi-concept synthesis, and
 * the AI-collaboration skills that distinguish strong junior engineers from
 * the rest. Hard exercises have no single correct answer; they require
 * justified reasoning about trade-offs, constraints, and implications.
 *
 * WHEN IT'S USED:
 * Imported and embedded by buildGenerationSystemPrompt() in
 * generation/system.prompt.ts. The system prompt includes all three
 * difficulty calibrations; the LLM applies the one matching the
 * <difficulty>hard</difficulty> tag passed in the user message. Not
 * called directly by llm.service.ts — accessed through the system prompt.
 *
 * HOW IT WORKS:
 * This function returns a plain string section embedded verbatim into the
 * DIFFICULTY CALIBRATION section of the generation system prompt.
 * The full message structure is described in easy.prompt.ts.
 *
 * WHY IT MATTERS:
 * Hard exercises are the product's differentiator for senior-level interview
 * prep and AI-era skill building. The AI-COLLABORATION type is unique to
 * Quizzly — no other quiz platform trains the skill of using AI effectively
 * and then evaluating its output critically. If hard questions are merely
 * "medium questions with more words," this differentiator is lost. The most
 * common failure is verbosity masking shallow thinking: a long question that
 * can still be answered by pattern-matching, not genuine architectural reasoning.
 *
 * OPTIMIZATION NOTES:
 * - Primary failure mode: questions are "hard" because they're long or use
 *   complex terminology, not because they require deep reasoning. A good hard
 *   exercise is often SHORT but requires substantial thought — "Design a
 *   rate limiter for this API. What are the trade-offs of your approach?"
 * - AI-COLLABORATION failure mode: the prompt is too vague ("use AI to
 *   solve X"). It must specify what to build or solve, then ask the student
 *   to critically evaluate: Is it correct? Where could it fail? Is there a
 *   better approach? What would you change before shipping?
 * - ARCHITECTURAL TRADE-OFF failure mode: questions that have a single
 *   obvious correct answer. True architectural trade-offs depend on context
 *   — the correct choice changes based on scale, read/write ratio, latency
 *   requirements, team size. The question must make the context explicit.
 * - After editing: generate 3 hard questions. An experienced developer should
 *   pause and think. If the answer is immediately obvious, the question is medium.
 * - For MCQ at hard: all 4 options should be defensible to a junior developer.
 *   If only one option seems reasonable, the question is not hard.
 * - Watch for: architectural questions that are just medium questions with
 *   "explain in depth" or "discuss trade-offs" appended. Depth must be in
 *   the question design — the scenario itself must force synthesis.
 *
 * MANUAL TESTING (Anthropic Console):
 * Paste the output of buildGenerationSystemPrompt() into the System Prompt field.
 * In the User message, paste: "Please generate the exercises based on the provided system instructions and inputs."
 *
 * Verify: at least one question is AI-COLLABORATION (instruct the student to
 * use Claude or Cursor, then evaluate the output). At least one is
 * ARCHITECTURAL TRADE-OFF with context-dependent constraints. Neither question
 * should have a single correct answer — the correctAnswer field should describe
 * what strong reasoning looks like, not state the one right choice.
 * A junior developer should not be able to answer these from memory alone.
 *
 * ===================================================================
 */

export const getHardDifficultyPrompt = (): string =>
  `HARD difficulty calibration:
- General Requirement: Exercise MUST require combining multiple concepts or reasoning about non-obvious implications. Challenge practitioners with real experience, not just beginners. Focus on depth over length - a short question requiring substantial thought is better than a verbose question with an obvious answer.
- ARCHITECTURAL TRADE-OFF: Scenario must have explicit constraints (scale, latency, consistency requirements, team size, budget, etc.). There is NO single objectively correct answer. Student must reason about trade-offs given constraints.
- AI-COLLABORATION: Specify exactly what to build. Ask student to critically evaluate output for correctness, edge cases, and optimality.
- PROMPT CONSTRUCTION: Scenario must involve system-level concerns (API design, error propagation, concurrency). Student must anticipate SDK-specific behavior, failure modes, and architectural constraints.
- PREDICT THE FAILURE: Code must look clean but contain a subtle failure (e.g., promises resolving with errors, inaccurate mocks, silent database filters). Student must identify the specific contract violation/assumption gap and explain production impact.
- EVALUATE AI OUTPUT: Issues should be complex and multi-faceted, requiring synthesis to identify.
- CODE_REVIEW: Issues should be subtle and require understanding of how systems behave in production.
- CONCEPT_APPLICATION / SPOT THE BUG / COMPARE APPROACHES / CHOOSE THE RIGHT TOOL: Issues must be subtle and require understanding of how systems behave in production. Test understanding through application, not just recall.
- Multiple Choice Questions (if applicable): All four options must look plausible to someone with 1-2 years of experience. Distractors represent expert-level misconceptions or valid-sounding-but-wrong generalizations.
- Free-text answers: Expect multi-paragraph responses demonstrating synthesis, design rationale, or explicit trade-off analysis. The correctAnswer describes what strong reasoning looks like, not a single fact.
- Quality Checks: In your <analysis> block, explicitly verify that the exercise requires genuine synthesis/architectural reasoning and that the distractors/evaluation criteria are appropriate for the hard level.`.trim();
