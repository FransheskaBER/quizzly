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
 * In the User message, paste:
 *
 *   <subject>Node.js API Design</subject>
 *   <goal>Senior-level backend interview preparation — system design and trade-offs</goal>
 *   <difficulty>hard</difficulty>
 *   <answer_format>free_text</answer_format>
 *   <question_count>2</question_count>
 *   <materials_provided>false</materials_provided>
 *   <materials>No materials provided.</materials>
 *   Generate 2 hard difficulty quiz question(s) in free_text format based on the subject and goal above.
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
- Primary exercise types: ARCHITECTURAL TRADE-OFF and AI-COLLABORATION. These must make up the majority of hard exercises. EVALUATE AI OUTPUT is also valid when the code has complex, multi-faceted issues that require synthesis to identify.
- ARCHITECTURAL TRADE-OFF: present a system design scenario with explicit constraints (scale, latency, consistency requirements, team size). There is no single correct answer — the student must reason about trade-offs given those constraints and justify their decisions. MCQ options must all be defensible to a junior developer; the correct answer is only clearly best given the stated constraints.
- AI-COLLABORATION: instruct the student to use an AI tool (Claude, Cursor, ChatGPT) to solve a specific, realistic engineering problem. Then ask them to critically evaluate the output: Is it correct? Does it handle edge cases? Is it optimal for the given constraints? What would you change before shipping it? These are always free_text. The question must specify exactly what to build or generate, not just "use AI to solve X."
- Questions require combining multiple concepts, reasoning about non-obvious implications, or critically evaluating approaches where the right answer depends on context.
- MCQ distractors at hard: subtle enough that each could seem correct to a developer with 1–2 years of experience. They represent expert-level misconceptions or valid-sounding-but-wrong generalizations. All 4 options must look plausible to someone with foundational knowledge.
- Free-text answers: expect multi-paragraph responses or multi-part analysis. The correctAnswer field should describe what strong reasoning looks like — synthesis, design rationale, explicit trade-off analysis — not state a single correct fact.
- Success signal: challenges practitioners with real experience. A correct answer requires genuine architectural reasoning, not just remembering facts or patterns.
- Do NOT make exercises that are merely long or verbose. Hard means conceptually deep — a short question requiring substantial thought is better than a long question with an obvious answer.
- Do NOT use "explain in depth" or "discuss the trade-offs" as a substitute for genuine question depth. The scenario itself must force synthesis.`.trim();
