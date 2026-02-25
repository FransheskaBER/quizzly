import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { SYSTEM_MARKER } from '../constants.js';
import { buildGenerationSystemPrompt } from '../generation/system.prompt.js';
import { buildGenerationUserMessage } from '../generation/user.prompt.js';
import { getEasyDifficultyPrompt } from '../generation/easy.prompt.js';
import { getMediumDifficultyPrompt } from '../generation/medium.prompt.js';
import { getHardDifficultyPrompt } from '../generation/hard.prompt.js';
import { buildGradingSystemPrompt } from '../grading/system.prompt.js';
import { QuizDifficulty, AnswerFormat } from '@skills-trainer/shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Reads a prompt source file as raw text for documentation header checks */
const readPromptSource = (relativePath: string): string =>
  readFileSync(join(__dirname, '..', relativePath), 'utf-8');

// ── Generation system prompt ─────────────────────────────────────────────────

describe('generation system prompt', () => {
  const BASE_PARAMS = {
    subject: 'React Hooks',
    goal: 'Understand the useState API',
    difficulty: QuizDifficulty.EASY,
    answerFormat: AnswerFormat.MCQ,
    questionCount: 3,
    materialsText: null,
  };
  const output = buildGenerationSystemPrompt(BASE_PARAMS);

  it('contains the JSON schema field specifications', () => {
    expect(output).toContain('questionNumber');
    expect(output).toContain('questionType');
    expect(output).toContain('options');
    expect(output).toContain('correctAnswer');
    expect(output).toContain('explanation');
    expect(output).toContain('tags');
  });

  it('contains plan-then-execute instructions with <analysis> and <questions> blocks', () => {
    expect(output).toContain('<analysis>');
    expect(output).toContain('<questions>');
  });

  it('contains injection defense instruction', () => {
    // Must instruct the LLM to treat XML-tagged content as data, not instructions
    expect(output.toLowerCase()).toContain('data');
    expect(output).toMatch(/treat.*content.*xml.*tags.*data|xml.*tags.*data.*not.*instructions/i);
  });

  it('contains the exfiltration system marker', () => {
    expect(output).toContain(SYSTEM_MARKER);
  });

  it('contains output reinforcement instruction', () => {
    // Must explicitly restrict output to only the expected blocks
    expect(output).toMatch(/output only|only.*<analysis>|only.*<questions>/i);
  });
});

// ── Difficulty prompts ────────────────────────────────────────────────────────

describe('difficulty prompts', () => {
  it('easy difficulty prompt is non-empty', () => {
    expect(getEasyDifficultyPrompt().length).toBeGreaterThan(0);
  });

  it('medium difficulty prompt is non-empty', () => {
    expect(getMediumDifficultyPrompt().length).toBeGreaterThan(0);
  });

  it('hard difficulty prompt is non-empty', () => {
    expect(getHardDifficultyPrompt().length).toBeGreaterThan(0);
  });

  it('all three difficulty prompts are distinct strings', () => {
    const easy = getEasyDifficultyPrompt();
    const medium = getMediumDifficultyPrompt();
    const hard = getHardDifficultyPrompt();
    expect(easy).not.toBe(medium);
    expect(medium).not.toBe(hard);
    expect(easy).not.toBe(hard);
  });

  it('generation system prompt dynamically embeds only the requested difficulty calibration', () => {
    const BASE_PARAMS = {
      subject: 'React Hooks',
      goal: 'Understand the useState API',
      difficulty: QuizDifficulty.EASY,
      answerFormat: AnswerFormat.MCQ,
      questionCount: 3,
      materialsText: null,
    };
    
    const easySystem = buildGenerationSystemPrompt({ ...BASE_PARAMS, difficulty: QuizDifficulty.EASY });
    expect(easySystem).toContain('EASY difficulty');
    expect(easySystem).not.toContain('MEDIUM difficulty');
    expect(easySystem).not.toContain('HARD difficulty');

    const mediumSystem = buildGenerationSystemPrompt({ ...BASE_PARAMS, difficulty: QuizDifficulty.MEDIUM });
    expect(mediumSystem).toContain('MEDIUM difficulty');
    expect(mediumSystem).not.toContain('EASY difficulty');
    expect(mediumSystem).not.toContain('HARD difficulty');

    const hardSystem = buildGenerationSystemPrompt({ ...BASE_PARAMS, difficulty: QuizDifficulty.HARD });
    expect(hardSystem).toContain('HARD difficulty');
    expect(hardSystem).not.toContain('EASY difficulty');
    expect(hardSystem).not.toContain('MEDIUM difficulty');
  });
});

// ── Grading system prompt ─────────────────────────────────────────────────────

describe('grading system prompt', () => {
  const BASE_PARAMS = {
    subject: 'React Hooks',
    questionsAndAnswers: [
      {
        questionNumber: 1,
        questionText: 'What does useState return?',
        correctAnswer: 'A tuple of [state, setter].',
        userAnswer: 'A state and a setter.',
      }
    ],
  };
  const output = buildGradingSystemPrompt(BASE_PARAMS);

  it('contains the 3-tier scoring rubric values', () => {
    expect(output).toContain('0.5');
    // Check that both 0 and 1 appear as score values (not just as part of other text)
    expect(output).toMatch(/score.*0|0.*incorrect/i);
    expect(output).toMatch(/score.*1|1.*correct/i);
  });

  it('contains plan-then-execute instructions with <evaluation> and <results> blocks', () => {
    expect(output).toContain('<evaluation>');
    expect(output).toContain('<results>');
  });

  it('contains injection defense instruction', () => {
    expect(output).toMatch(/treat.*content.*xml.*tags.*data|xml.*tags.*data.*not.*instructions/i);
  });

  it('contains the exfiltration system marker', () => {
    expect(output).toContain(SYSTEM_MARKER);
  });

  it('contains output reinforcement instruction', () => {
    expect(output).toMatch(/output only|only.*<evaluation>|only.*<results>/i);
  });

  it('specifies that only 0, 0.5, and 1 are valid scores', () => {
    // Must explicitly state no other score values are allowed
    expect(output).toMatch(/only.*0.*0\.5.*1|0.*0\.5.*1.*only/i);
  });
});

// ── Generation user message (user.prompt.ts) ──────────────────────────────────

describe('generation system prompt variables', () => {
  const BASE_PARAMS = {
    subject: 'React Hooks',
    goal: 'Understand the useState API',
    difficulty: QuizDifficulty.EASY,
    answerFormat: AnswerFormat.MCQ,
    questionCount: 3,
    materialsText: null,
  };

  it('includes subject and goal in the output', () => {
    const output = buildGenerationSystemPrompt(BASE_PARAMS);
    expect(output).toContain('React Hooks');
    expect(output).toContain('Understand the useState API');
  });

  it('includes difficulty, answerFormat, and questionCount in the output', () => {
    const output = buildGenerationSystemPrompt(BASE_PARAMS);
    expect(output).toContain(QuizDifficulty.EASY);
    expect(output).toContain(AnswerFormat.MCQ);
    expect(output).toContain('3');
  });

  it('wraps user-supplied content in XML delimiter tags', () => {
    const output = buildGenerationSystemPrompt(BASE_PARAMS);
    expect(output).toContain('<subject>');
    expect(output).toContain('</subject>');
    expect(output).toContain('<goal>');
    expect(output).toContain('</goal>');
    expect(output).toContain('<study_materials>');
    expect(output).toContain('</study_materials>');
  });

  it('uses "No materials provided." placeholder when materialsText is null', () => {
    const output = buildGenerationSystemPrompt({ ...BASE_PARAMS, materialsText: null });
    expect(output).toContain('No materials provided.');
  });

  it('includes the materials text when materialsText is provided', () => {
    const output = buildGenerationSystemPrompt({
      ...BASE_PARAMS,
      materialsText: 'Hooks let you use state in functional components.',
    });
    expect(output).toContain('Hooks let you use state in functional components.');
  });
});

describe('buildGenerationUserMessage', () => {
  it('returns a static trigger message', () => {
    const output = buildGenerationUserMessage();
    expect(output).toContain('Please generate the exercises');
  });
});

// ── Documentation headers ─────────────────────────────────────────────────────

const REQUIRED_HEADER_SECTIONS = [
  'PURPOSE:',
  'WHEN IT\'S USED:',
  'HOW IT WORKS:',
  'WHY IT MATTERS:',
  'OPTIMIZATION NOTES:',
  'MANUAL TESTING',
];

const PROMPT_FILES = [
  'generation/system.prompt.ts',
  'generation/easy.prompt.ts',
  'generation/medium.prompt.ts',
  'generation/hard.prompt.ts',
  'grading/system.prompt.ts',
];

describe('documentation headers', () => {
  it('all 6 prompt template files contain all required documentation sections', () => {
    for (const filePath of PROMPT_FILES) {
      const source = readPromptSource(filePath);
      for (const section of REQUIRED_HEADER_SECTIONS) {
        expect(
          source,
          `${filePath} is missing documentation section: "${section}"`,
        ).toContain(section);
      }
    }
  });

  it('generation system prompt header warns about Zod schema alignment', () => {
    const source = readPromptSource('generation/system.prompt.ts');
    // Must remind developers that JSON field names must match quiz.schema.ts
    const mentionsSchema = source.includes('quiz.schema') || source.includes('Zod');
    expect(mentionsSchema).toBe(true);
  });
});
