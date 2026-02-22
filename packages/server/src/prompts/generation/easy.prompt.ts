/**
 * ===================================================================
 * EASY DIFFICULTY CALIBRATION PROMPT
 * ===================================================================
 *
 * PURPOSE:
 * Defines what "easy" means for quiz question generation — calibrates
 * question depth, distractor plausibility, and expected answer length
 * so the LLM targets foundational understanding, not expert recall.
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
 *   system: [role + plan-then-execute + schema + quality rules + ALL 3
 *            difficulty calibrations + injection defense]
 *   user:   <subject>...</subject> <goal>...</goal>
 *           <difficulty>easy</difficulty> <answer_format>...</answer_format>
 *           <question_count>N</question_count> <materials>...</materials>
 *
 * WHY IT MATTERS:
 * Without this calibration, the LLM defaults to expert-level questions —
 * the model's training data skews heavily toward complex material. A bootcamp
 * graduate attempting an "easy" quiz will face questions far beyond their
 * current level, destroying their confidence and making the product useless
 * as a study tool. Users will churn in the first session.
 *
 * OPTIMIZATION NOTES:
 * - Primary failure mode: questions are too hard. The LLM's concept of "easy"
 *   often means "easy for a senior developer," not a bootcamp graduate.
 * - After editing: generate 5 easy MCQ questions on a clearly documented topic
 *   (e.g., "JavaScript — learn basic array methods"). A student who read the
 *   material for 30 minutes should get 4/5+ correct.
 * - Check MCQ distractors: clearly wrong to someone who studied, but plausible
 *   to a complete beginner. If all 3 distractors look absurd or obviously wrong,
 *   they aren't teaching students where their real knowledge gaps are.
 * - Check free-text answers: should be 1–3 sentences. If the model answer is a
 *   paragraph, the question is medium, not easy.
 * - Watch for: questions that test trivia (exact API method name) instead of
 *   foundational understanding (what the concept does).
 *
 * MANUAL TESTING (Anthropic Console):
 * Paste the output of buildGenerationSystemPrompt() into the System Prompt field.
 * In the User message, paste:
 *
 *   <subject>JavaScript Arrays</subject>
 *   <goal>Understand basic array methods for interviews</goal>
 *   <difficulty>easy</difficulty>
 *   <answer_format>mcq</answer_format>
 *   <question_count>3</question_count>
 *   <materials_provided>false</materials_provided>
 *   <materials>No materials provided.</materials>
 *   Generate 3 easy difficulty quiz question(s) in mcq format based on the subject and goal above.
 *
 * Verify: questions test basic array concepts (e.g., what does .push() return,
 * what is the index of the first element), not prototype chains or memory models.
 * Each MCQ has one unambiguous correct answer and 3 plausible-but-wrong distractors.
 *
 * ===================================================================
 */

export const getEasyDifficultyPrompt = (): string =>
  `EASY difficulty calibration:
- Focus on foundational understanding: definitions, basic syntax, and single-step application of individual concepts.
- Questions should be directly answerable from the provided study materials without inference, comparison, or cross-concept reasoning.
- MCQ distractors: clearly wrong to someone who has studied the material, but plausible to a complete beginner (e.g., common first-time mistakes, incorrect but familiar-sounding terms). Avoid trick questions.
- Free-text answers: short (1–3 sentences). The correctAnswer field should be the simplest complete correct response.
- Do NOT combine multiple concepts in a single question.
- Do NOT require knowledge beyond what is explicitly stated in the materials (if provided).
- Target: a bootcamp graduate who has studied the material for 30 minutes should answer 80%+ of easy questions correctly.`.trim();
