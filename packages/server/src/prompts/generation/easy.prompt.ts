/**
 * ===================================================================
 * EASY DIFFICULTY CALIBRATION PROMPT
 * ===================================================================
 *
 * PURPOSE:
 * Defines what "easy" means for Quizzly exercise generation — calibrates
 * which exercise types to use, how deep the scenarios should be, and what
 * "success" looks like for a student who has studied the material for 30
 * minutes. Easy exercises test focused evaluation skills on single-concept,
 * contained scenarios — not recall, not definitions.
 *
 * WHEN IT'S USED:
 * Imported and embedded by buildGenerationSystemPrompt() in
 * generation/system.prompt.ts. The system prompt includes all three
 * difficulty calibrations; the LLM applies the one matching the
 * <difficulty>easy</difficulty> tag passed in the user message. Not
 * called directly by llm.service.ts — accessed through the system prompt.
 *
 * HOW IT WORKS:
 * This function returns a plain string section that is embedded verbatim
 * into the DIFFICULTY CALIBRATION section of the generation system prompt.
 * The full message structure the LLM sees:
 *   system: [role + exercise types + schema + quality rules + ALL 3
 *            difficulty calibrations + injection defense]
 *   user:   <subject>...</subject> <goal>...</goal>
 *           <difficulty>easy</difficulty> <answer_format>...</answer_format>
 *           <question_count>N</question_count> <materials>...</materials>
 *
 * WHY IT MATTERS:
 * Without precise calibration, the LLM defaults in two wrong directions:
 * (1) it generates recall/definition questions ("What does X do?") because
 * that is what most quiz data looks like, or (2) it makes exercises too
 * hard. Easy exercises must be genuinely evaluative — the student must look
 * at code and identify a real problem — but contained enough that someone
 * who has studied the subject for 30 minutes can succeed 80%+ of the time.
 * The PRD explicitly defines Easy as: spot the bug, evaluate AI output,
 * single-concept focused evaluation. NOT definitions or syntax recall.
 *
 * OPTIMIZATION NOTES:
 * - Primary failure mode #1: LLM generates "What is X?" or "Which method
 *   does Y?" questions. These are recall, not evaluation. The QUALITY RULES
 *   forbid them, but check after any edit by generating 5 easy questions and
 *   verifying every one requires the student to look at code and evaluate it.
 * - Primary failure mode #2: bugs are too subtle or require cross-concept
 *   reasoning (that's medium). Easy bugs should be identifiable by someone
 *   who has read the material once: off-by-one, wrong return value, missing
 *   null check, incorrect method call.
 * - Primary failure mode #3: AI OUTPUT exercises present code that is too
 *   complex or has multiple issues. Easy AI output evaluation should have
 *   one obvious flaw — the kind a diligent student spots immediately.
 * - After editing: generate 5 easy SPOT THE BUG questions. Someone who
 *   studied the subject for 30 minutes should correctly identify the bug
 *   80%+ of the time. If it requires deep expertise, the question is medium.
 * - Check MCQ distractors: should represent real first-time mistakes, not
 *   absurd wrong answers. The student should have to think, not just dismiss.
 *
 * MANUAL TESTING (Anthropic Console):
 * Paste the output of buildGenerationSystemPrompt() into the System Prompt field.
 * In the User message, paste: "Please generate the exercises based on the provided system instructions and inputs."
 * Verify: every question is SPOT THE BUG, EVALUATE AI OUTPUT, or PROMPT CONSTRUCTION.
 * Each bug or flaw should be visible from a single read of the code.
 * MCQ distractors represent plausible misreads, not absurd alternatives.
 *
 * ===================================================================
 */

export const getEasyDifficultyPrompt = (): string =>
  `EASY difficulty calibration:
- Exercise Type Restrictions: Use ONLY the exercise types specified. For EASY, prioritize SPOT THE BUG, EVALUATE AI OUTPUT, and PROMPT CONSTRUCTION.
- Scope and Complexity:
  - Single concept only — one function, one algorithm operation, one data structure method.
  - No multi-step reasoning or cross-concept synthesis.
  - Contained scenario that can be understood in 30 seconds.
  - If learning materials are provided, use ONLY knowledge explicitly stated in them.
- Bug/Flaw Difficulty (for SPOT THE BUG and EVALUATE AI OUTPUT):
  - Identifiable to someone who studied the subject for 30 minutes.
  - Appropriate bugs: off-by-one errors, wrong method called, incorrect return value, missing null/undefined check, simple logic inversion (e.g., < instead of >).
  - AVOID: subtle bugs requiring deep expertise, race conditions, complex edge cases, performance issues, style issues.
- For SPOT THE BUG exercises:
  - Snippet must be short (5-15 lines maximum).
  - Include exactly ONE bug.
  - Expected answer length: 1-3 sentences explaining the fix.
- For EVALUATE AI OUTPUT exercises:
  - Snippet must be short (5-15 lines maximum).
  - Include exactly ONE clear flaw: correctness issue, unhandled edge case, or method used incorrectly.
  - Expected answer length: 1-3 sentences stating correct behavior.
- For PROMPT CONSTRUCTION exercises:
  - Present a simple, single-function requirement.
  - MCQ format: Provide 4 prompt options where one includes critical constraints and others miss at least one key detail.
  - Free-text format: Ask student to identify 2-3 specific constraints the AI would likely miss (2-4 sentences).
  - Critical constraints: handle empty input, define ambiguous terms precisely, specify return type on edge cases, clarify expected data format.
- Multiple Choice Questions (if applicable):
  - Distractors must be plausible to a complete beginner and represent real first-time mistakes.
  - Avoid obviously absurd alternatives or trick questions.
  - Each distractor should have a clear reason why it's wrong in the explanation.
- Target Success Rate: A student who studied the material for 30 minutes should correctly identify the issue 80%+ of the time.`.trim();
