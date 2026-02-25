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
 * In the User message, paste:
 *
 *   <subject>TypeScript Generics</subject>
 *   <goal>Understand how to use generics in function signatures</goal>
 *   <difficulty>easy</difficulty>
 *   <answer_format>mixed</answer_format>
 *   <question_count>4</question_count>
 *   <materials_provided>false</materials_provided>
 *   <materials>No materials provided.</materials>
 *   Generate 4 easy difficulty quiz question(s) in mixed format based on the subject and goal above.
 *
 * Verify: every question is SPOT THE BUG or EVALUATE AI OUTPUT — not
 * "What is a generic?", not "What syntax do you use to define a generic?"
 * Each bug or flaw should be visible from a single read of the code.
 * MCQ distractors represent plausible misreads, not absurd alternatives.
 *
 * ===================================================================
 */

export const getEasyDifficultyPrompt = (): string =>
  `EASY difficulty calibration:
- Primary exercise types: SPOT THE BUG and EVALUATE AI OUTPUT. These are the ONLY types to use at easy difficulty unless the goal explicitly calls for something else.
- Scenarios are contained and single-concept: one function, one algorithm operation, one data structure method. No multi-step reasoning or cross-concept synthesis.
- SPOT THE BUG: bugs must be identifiable to someone who has studied the subject for 30 minutes. Target: off-by-one errors, wrong method called, incorrect return value, missing null/undefined check, simple logic inversion. Do NOT use subtle bugs that require deep expertise.
- EVALUATE AI OUTPUT: present a short function or snippet described as AI-generated. It should contain one clear, identifiable flaw — a correctness issue, an unhandled edge case, or a method used incorrectly. Not multiple issues.
- MCQ distractors: plausible to a complete beginner, clearly wrong to someone who has studied the material. Represent real first-time mistakes, not obviously absurd alternatives. Avoid trick questions.
- Free-text answers: 1–3 sentences. Identify the specific issue and state what the correct behaviour should be.
- Do NOT combine multiple concepts in a single exercise.
- Do NOT require knowledge beyond what is explicitly stated in the materials (if provided).
- Do NOT generate recall questions ("What does X do?"), definition questions ("Define Y"), or syntax questions ("What is the syntax for Z?") — these are FORBIDDEN at every difficulty level.
- Target: a student who has studied the material for 30 minutes should correctly identify the issue 80%+ of the time.`.trim();
