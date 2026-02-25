import 'dotenv/config';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

import type { MessageParam } from '@anthropic-ai/sdk/resources/messages.js';
import Anthropic from '@anthropic-ai/sdk';

import {
  llmQuizOutputSchema,
  type LlmGeneratedQuestion,
  type QuizDifficulty,
  type AnswerFormat,
} from '@skills-trainer/shared';

import {
  LLM_MODEL,
  LLM_MAX_TOKENS,
  LLM_GENERATION_TEMPERATURE,
  SYSTEM_MARKER,
  CORRECTIVE_MESSAGE,
} from '../src/prompts/constants.js';
import { buildGenerationSystemPrompt } from '../src/prompts/generation/system.prompt.js';
import { buildGenerationUserMessage } from '../src/prompts/generation/user.prompt.js';
import { extractBlock } from '../src/services/llm.service.js';
import { sanitizeForPrompt } from '../src/utils/sanitize.utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(SERVER_ROOT, 'scripts', 'output');
const SCORECARD_PATH = path.join(OUTPUT_DIR, 'scorecard.json');
const GENERATION_RESULTS_PATH = path.join(OUTPUT_DIR, 'generation-results.json');
const SAMPLE_MATERIAL_PATH = path.join(SERVER_ROOT, 'scripts', 'fixtures', 'sample-material.txt');

// --- Constants ---

const DIFFICULTIES: QuizDifficulty[] = ['easy', 'medium', 'hard'];
const FORMATS: AnswerFormat[] = ['mcq', 'free_text', 'mixed'];
const QUESTIONS_PER_CELL = 3;

const SUBJECTS = [
  'JavaScript',
  'Python Data Structures',
  'System Design',
  'React',
  'SQL',
];

const GOALS = [
  'Preparing for frontend engineer interviews at mid-size startups',
  'Studying algorithms for FAANG interviews',
  'Learning system design fundamentals',
];

const PROMPT_FILES = [
  'generation/system.prompt.ts',
  'generation/easy.prompt.ts',
  'generation/medium.prompt.ts',
  'generation/hard.prompt.ts',
  'grading/system.prompt.ts',
] as const;

// --- Env check ---

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  process.stderr.write('Error: ANTHROPIC_API_KEY is required. Set it in .env or the environment.\n');
  process.exit(1);
}

const anthropic = new Anthropic({ apiKey });

// --- Helpers ---

function hashFile(relativePath: string): string {
  const fullPath = path.join(SERVER_ROOT, 'src', 'prompts', relativePath);
  const content = fs.readFileSync(fullPath, 'utf-8');
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 8);
}

function computePromptHashes(): Record<string, string> {
  const result: Record<string, string> = {};
  for (const file of PROMPT_FILES) {
    try {
      result[file] = hashFile(file);
    } catch {
      result[file] = 'missing';
    }
  }
  return result;
}

function inferExerciseType(questionText: string, tags: string[]): string {
  const text = (questionText + ' ' + tags.join(' ')).toLowerCase();
  if (/use\s+(an?\s+)?ai\s+tool|claude|cursor|chatgpt/i.test(text)) return 'AI_COLLABORATION';
  if (/trade-off|architectural|system\s+design/i.test(text)) return 'ARCHITECTURAL_TRADE_OFF';
  if (/compare|which\s+(is|approach)\s+better/i.test(text)) return 'COMPARE_APPROACHES';
  if (/choose|select\s+the\s+right|correct\s+(algorithm|data\s+structure)/i.test(text))
    return 'CHOOSE_THE_RIGHT_TOOL';
  if (/ai-generated|evaluate\s+(this\s+)?(code|output)/i.test(text)) return 'EVALUATE_AI_OUTPUT';
  if (/bug|identify\s+the\s+(bug|error|issue)/i.test(text)) return 'SPOT_THE_BUG';
  return 'UNKNOWN';
}

async function callLlmStream(
  systemPrompt: string,
  messages: MessageParam[],
  temperature: number,
): Promise<string> {
  const stream = anthropic.messages.stream({
    model: LLM_MODEL,
    max_tokens: LLM_MAX_TOKENS,
    temperature,
    system: systemPrompt,
    messages,
  });
  return stream.finalText();
}

function parseBlock(response: string, blockName: string): unknown {
  const block = extractBlock(response, blockName);
  if (block === null) return null;
  try {
    return JSON.parse(block);
  } catch {
    return null;
  }
}

interface GenerationResult {
  questions: LlmGeneratedQuestion[];
  retried: boolean;
  failed: boolean;
  parseError?: string;
}

async function runGeneration(
  subject: string,
  goal: string,
  difficulty: QuizDifficulty,
  answerFormat: AnswerFormat,
  questionCount: number,
  materialsText: string | null,
): Promise<GenerationResult> {
  const sanitizedSubject = sanitizeForPrompt(subject);
  const sanitizedGoal = sanitizeForPrompt(goal);
  const sanitizedMaterials = materialsText !== null ? sanitizeForPrompt(materialsText) : null;

  const promptParams = {
    subject: sanitizedSubject,
    goal: sanitizedGoal,
    difficulty,
    answerFormat,
    questionCount,
    materialsText: sanitizedMaterials,
  };
  const systemPrompt = buildGenerationSystemPrompt(difficulty);
  const userMessage = buildGenerationUserMessage(promptParams);

  const firstMessages: MessageParam[] = [{ role: 'user', content: userMessage }];
  let firstResponse: string;
  try {
    firstResponse = await callLlmStream(systemPrompt, firstMessages, LLM_GENERATION_TEMPERATURE);
  } catch (err) {
    return {
      questions: [],
      retried: false,
      failed: true,
      parseError: err instanceof Error ? err.message : String(err),
    };
  }

  if (firstResponse.includes(SYSTEM_MARKER)) {
    return {
      questions: [],
      retried: false,
      failed: true,
      parseError: 'Response contains system marker (exfiltration attempt)',
    };
  }

  const firstBlock = parseBlock(firstResponse, 'questions');
  const firstParsed = firstBlock !== null ? llmQuizOutputSchema.safeParse(firstBlock) : null;
  if (firstParsed?.success) {
    return { questions: firstParsed.data, retried: false, failed: false };
  }

  // Retry
  const retryMessages: MessageParam[] = [
    { role: 'user', content: userMessage },
    { role: 'assistant', content: firstResponse },
    { role: 'user', content: CORRECTIVE_MESSAGE },
  ];
  let retryResponse: string;
  try {
    retryResponse = await callLlmStream(systemPrompt, retryMessages, LLM_GENERATION_TEMPERATURE);
  } catch (err) {
    return {
      questions: [],
      retried: true,
      failed: true,
      parseError: err instanceof Error ? err.message : String(err),
    };
  }

  if (retryResponse.includes(SYSTEM_MARKER)) {
    return {
      questions: [],
      retried: true,
      failed: true,
      parseError: 'Response contains system marker (exfiltration attempt)',
    };
  }

  const retryBlock = parseBlock(retryResponse, 'questions');
  const retryParsed = retryBlock !== null ? llmQuizOutputSchema.safeParse(retryBlock) : null;
  if (retryParsed?.success) {
    return { questions: retryParsed.data, retried: true, failed: false };
  }

  const firstError = firstParsed?.success === false ? firstParsed.error.message : 'parse failed';
  return {
    questions: [],
    retried: true,
    failed: true,
    parseError: `Validation failed after retry. First attempt: ${firstError}`,
  };
}

function loadScorecard(): Array<Record<string, unknown>> {
  if (!fs.existsSync(SCORECARD_PATH)) return [];
  const raw = fs.readFileSync(SCORECARD_PATH, 'utf-8');
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

function findLastFullRun(scorecard: Array<Record<string, unknown>>): Record<string, unknown> | null {
  for (let i = scorecard.length - 1; i >= 0; i--) {
    if (scorecard[i].scope === 'full') return scorecard[i];
  }
  return null;
}

function ensureOutputDir(): void {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
}

// --- Main ---

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const difficultyArg = args.find((a) => a.startsWith('--difficulty='));
  const targetedDifficulty = difficultyArg
    ? (difficultyArg.split('=')[1] as QuizDifficulty)
    : null;

  const isTargeted = targetedDifficulty !== null;
  const difficultiesToRun = isTargeted ? [targetedDifficulty] : DIFFICULTIES;

  ensureOutputDir();

  const currentHashes = computePromptHashes();
  const scorecard = loadScorecard();

  if (isTargeted) {
    const lastFull = findLastFullRun(scorecard);
    const systemPromptHashKey = 'generation/system.prompt.ts';
    if (lastFull?.promptFilesHash && typeof lastFull.promptFilesHash === 'object') {
      const lastHashes = lastFull.promptFilesHash as Record<string, string>;
      const lastSystemHash = lastHashes[systemPromptHashKey];
      const currentSystemHash = currentHashes[systemPromptHashKey];
      if (lastSystemHash !== undefined && lastSystemHash !== currentSystemHash) {
        process.stderr.write(
          `⚠ generation/system.prompt.ts has changed since last full run.\n` +
            `  Partial results would mix old system prompt (medium, hard) with new system prompt (${targetedDifficulty}).\n` +
            `  Run without --difficulty flag for a full evaluation.\n`,
        );
        process.exit(1);
      }
    }
  }

  process.stdout.write('🔍 Checking prompt changes...\n');
  const prevEntry = scorecard[scorecard.length - 1];
  const prevHashes = (prevEntry?.promptFilesHash as Record<string, string>) ?? {};
  const changedFiles: string[] = [];
  for (const [file, hash] of Object.entries(currentHashes)) {
    if (prevHashes[file] !== undefined && prevHashes[file] !== hash) {
      changedFiles.push(file);
      process.stdout.write(`   ${file} — CHANGED (was ${prevHashes[file]}, now ${hash})\n`);
    }
  }
  if (changedFiles.length === 0 && prevEntry) {
    process.stdout.write('   All prompts — unchanged\n');
  }
  process.stdout.write('\n');

  const sampleMaterial = fs.existsSync(SAMPLE_MATERIAL_PATH)
    ? fs.readFileSync(SAMPLE_MATERIAL_PATH, 'utf-8')
    : null;

  if (!sampleMaterial && !isTargeted) {
    process.stderr.write(`Warning: sample material not found at ${SAMPLE_MATERIAL_PATH}\n`);
  }

  const runId = new Date().toISOString().replace(/:/g, '-').slice(0, 19) + 'Z';
  const timestamp = new Date().toISOString();

  const allResults: Array<{
    difficulty: string;
    format: string;
    exerciseType: string;
    questionText: string;
    options: string[] | null;
    correctAnswer: string;
    explanation: string;
    zodPassed: boolean;
    parseError?: string;
    materialsProvided: boolean;
  }> = [];

  let totalGenerated = 0;
  let totalCalls = 0;
  let successfulCalls = 0;
  let totalRetries = 0;
  let totalFailures = 0;

  const byDifficulty: Record<
    string,
    {
      evaluated: boolean;
      totalGenerated: number;
      zodPassRate: number;
      typeDistribution: Record<string, number>;
      withMaterials: number;
      withoutMaterials: number;
      retries: number;
      failures: number;
    }
  > = {};

  const lastFull = findLastFullRun(scorecard);
  for (const d of DIFFICULTIES) {
    const evaluated = difficultiesToRun.includes(d);
    if (evaluated) {
      byDifficulty[d] = {
        evaluated: true,
        totalGenerated: 0,
        zodPassRate: 0,
        typeDistribution: {},
        withMaterials: 0,
        withoutMaterials: 0,
        retries: 0,
        failures: 0,
      };
    } else if (lastFull?.generation?.byDifficulty?.[d]) {
      byDifficulty[d] = {
        evaluated: false,
        carriedFromRun: lastFull.runId as string,
      } as (typeof byDifficulty)[string];
    }
  }

  process.stdout.write(
    `📝 Generating questions ${isTargeted ? `[${targetedDifficulty} only]` : ''}...\n`,
  );

  let cellIndex = 0;
  for (const difficulty of difficultiesToRun) {
    for (const format of FORMATS) {
      for (const withMaterials of [true, false]) {
        const subject = SUBJECTS[cellIndex % SUBJECTS.length];
        const goal = GOALS[cellIndex % GOALS.length];
        const materialsText = withMaterials ? sampleMaterial : null;
        const label = `${difficulty} + ${format} + ${withMaterials ? 'with' : 'without'} materials`;

        const result = await runGeneration(
          subject,
          goal,
          difficulty as QuizDifficulty,
          format as AnswerFormat,
          QUESTIONS_PER_CELL,
          materialsText,
        );

        const passed = result.questions.length;
        const expected = QUESTIONS_PER_CELL;
        const status = passed === expected ? '✓' : '✗';
        process.stdout.write(
          `   ${label} ${'.'.repeat(Math.max(0, 35 - label.length))} ${passed}/${expected} ${status}\n`,
        );

        for (const q of result.questions) {
          const exerciseType = inferExerciseType(q.questionText, q.tags ?? []);
          allResults.push({
            difficulty,
            format,
            exerciseType,
            questionText: q.questionText,
            options: q.options,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation,
            zodPassed: true,
            materialsProvided: withMaterials,
          });
          byDifficulty[difficulty].typeDistribution[exerciseType] =
            (byDifficulty[difficulty].typeDistribution[exerciseType] ?? 0) + 1;
          if (withMaterials) byDifficulty[difficulty].withMaterials++;
          else byDifficulty[difficulty].withoutMaterials++;
        }

        if (result.failed) {
          allResults.push({
            difficulty,
            format,
            exerciseType: 'FAILED',
            questionText: '',
            options: null,
            correctAnswer: '',
            explanation: '',
            zodPassed: false,
            parseError: result.parseError,
            materialsProvided: withMaterials,
          });
        }

        totalGenerated += result.questions.length;
        totalCalls++;
        if (!result.failed) successfulCalls++;
        if (result.retried) totalRetries++;
        if (result.failed) totalFailures++;
        byDifficulty[difficulty].totalGenerated += result.questions.length;
        if (result.retried) byDifficulty[difficulty].retries++;
        if (result.failed) byDifficulty[difficulty].failures++;

        cellIndex++;
      }
    }
  }

  const cellsPerDifficulty = FORMATS.length * 2;
  for (const d of difficultiesToRun) {
    const diff = byDifficulty[d];
    if (diff?.evaluated) {
      const successForDiff = cellsPerDifficulty - (diff.failures ?? 0);
      diff.zodPassRate = successForDiff / cellsPerDifficulty;
    }
  }

  fs.writeFileSync(
    GENERATION_RESULTS_PATH,
    JSON.stringify(
      { runId, timestamp, scope: isTargeted ? `${targetedDifficulty} only` : 'full', questions: allResults },
      null,
      2,
    ),
  );

  const scope = isTargeted ? `${targetedDifficulty} only` : 'full';
  const entry: Record<string, unknown> = {
    runId,
    timestamp,
    scope,
    difficultiesEvaluated: difficultiesToRun,
    generation: {
      totalQuestions: allResults.length,
      aggregate: {
        zodPassRate: totalCalls > 0 ? successfulCalls / totalCalls : 0,
        retries: totalRetries,
        failures: totalFailures,
      },
      byDifficulty,
    },
    grading: {},
    promptFilesHash: currentHashes,
    changedSinceLastRun: changedFiles,
    notes: '',
  };

  scorecard.push(entry);
  fs.writeFileSync(SCORECARD_PATH, JSON.stringify(scorecard, null, 2));

  process.stdout.write(
    `\n✅ Generation complete: ${totalGenerated} questions, ${successfulCalls}/${totalCalls} passed Zod, ${totalRetries} retries, ${totalFailures} failures\n`,
  );
}

main().catch((err) => {
  process.stderr.write(String(err) + '\n');
  process.exit(1);
});
