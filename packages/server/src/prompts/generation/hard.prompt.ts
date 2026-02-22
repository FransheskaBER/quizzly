/**
 * ===================================================================
 * HARD DIFFICULTY CALIBRATION PROMPT
 * ===================================================================
 *
 * PURPOSE:
 * Defines what "hard" means for quiz question generation — calibrates
 * questions to test deep understanding, architectural reasoning, and
 * the ability to evaluate trade-offs rather than recall facts.
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
 * Hard questions are the product's differentiator for senior-level interview
 * prep. If they're not genuinely challenging, experienced practitioners will
 * dismiss the product as too basic. The most common failure is questions that
 * are merely long or verbose rather than conceptually deep — students can
 * pattern-match to an answer without understanding the underlying reasoning.
 * This makes hard questions useless for identifying real knowledge gaps.
 *
 * OPTIMIZATION NOTES:
 * - Primary failure mode: questions that are "hard" because they're long or
 *   use obscure terminology, not because they require deep reasoning. A good
 *   hard question is often SHORT but requires substantial thought.
 * - Distinguishing hard from medium: hard questions should make experienced
 *   developers pause and think. Medium questions make beginners think.
 * - Test signal: if you can answer the question correctly after reading the
 *   material twice, it's probably medium. Hard questions require synthesis,
 *   experience, or reasoning about implications not stated in the materials.
 * - After editing: generate 3 hard questions and have an experienced developer
 *   review them. Would they need to think carefully? Are the MCQ distractors
 *   genuinely tempting to someone with 2+ years of experience?
 * - For MCQ: all 4 options should look plausible to a junior developer. If only
 *   one option seems reasonable, the question is not hard.
 * - Watch for: questions that are just medium questions with "explain in depth"
 *   or "discuss the trade-offs" appended. Depth must be in the question design,
 *   not just the instruction.
 *
 * MANUAL TESTING (Anthropic Console):
 * Paste the output of buildGenerationSystemPrompt() into the System Prompt field.
 * In the User message, paste:
 *
 *   <subject>JavaScript Event Loop</subject>
 *   <goal>Senior-level interview preparation on async JavaScript</goal>
 *   <difficulty>hard</difficulty>
 *   <answer_format>free_text</answer_format>
 *   <question_count>2</question_count>
 *   <materials_provided>false</materials_provided>
 *   <materials>No materials provided.</materials>
 *   Generate 2 hard difficulty quiz question(s) in free_text format based on the subject and goal above.
 *
 * Verify: questions require reasoning about non-obvious implications (e.g.,
 * "what happens when a microtask queue item schedules another microtask?"),
 * not just asking the student to describe the event loop. Model answers should
 * be multi-sentence analyses, not definitions. A junior developer should not
 * be able to answer from memory after one read of the topic.
 *
 * ===================================================================
 */

export const getHardDifficultyPrompt = (): string =>
  `HARD difficulty calibration:
- Focus on deep understanding: architectural decisions, edge cases, performance implications, and trade-offs where no answer is universally "right."
- Questions require combining multiple concepts, reasoning about non-obvious implications, or critically evaluating approaches.
- MCQ distractors: subtle enough that each could seem correct to a junior developer. They represent expert-level misconceptions or valid-sounding-but-wrong generalizations. All 4 options should look plausible to someone with basic knowledge of the topic.
- Free-text answers: expect full paragraph responses or multi-part analysis. The correctAnswer should demonstrate synthesis, design reasoning, or critical evaluation — not just description.
- Code questions: debug complex multi-step scenarios with non-obvious interactions, optimize under specific constraints, or critique an architectural choice with specific trade-offs explained.
- Some questions may ask the student to evaluate AI-generated output or use an external AI tool as part of their answer — treat these as free_text questions.
- Success signal: challenges experienced practitioners. A correct answer requires genuine reasoning about implications, not just remembering facts.
- Do NOT make questions that are merely long or verbose. Hard means conceptually deep — a short question that requires substantial thought is better than a long question with an obvious answer.`.trim();
