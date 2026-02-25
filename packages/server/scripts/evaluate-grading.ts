import 'dotenv/config';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

import type { MessageParam } from '@anthropic-ai/sdk/resources/messages.js';
import Anthropic from '@anthropic-ai/sdk';

import { llmGradedAnswersOutputSchema, type LlmGradedAnswer } from '@skills-trainer/shared';

import {
  LLM_MODEL,
  LLM_MAX_TOKENS,
  LLM_GRADING_TEMPERATURE,
  SYSTEM_MARKER,
  CORRECTIVE_MESSAGE,
} from '../src/prompts/constants.js';
import { buildGradingSystemPrompt } from '../src/prompts/grading/system.prompt.js';
import { buildGradingUserMessage } from '../src/prompts/grading/user.prompt.js';
import { extractBlock } from '../src/services/llm.service.js';
import { sanitizeForPrompt } from '../src/utils/sanitize.utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(SERVER_ROOT, 'scripts', 'output');
const SCORECARD_PATH = path.join(OUTPUT_DIR, 'scorecard.json');
const GENERATION_RESULTS_PATH = path.join(OUTPUT_DIR, 'generation-results.json');
const GRADING_RESULTS_PATH = path.join(OUTPUT_DIR, 'grading-results.json');

const PROMPT_FILES = [
  'generation/system.prompt.ts',
  'generation/easy.prompt.ts',
  'generation/medium.prompt.ts',
  'generation/hard.prompt.ts',
  'grading/system.prompt.ts',
  'grading/freetext.prompt.ts',
] as const;

const FIVE_MINUTES_MS = 5 * 60 * 1000;

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

function createPartialAnswer(correctAnswer: string): string {
  const sentences = correctAnswer.split(/[.!?]+/).filter((s) => s.trim());
  if (sentences.length <= 1) {
    return correctAnswer.slice(0, Math.ceil(correctAnswer.length * 0.4));
  }
  return sentences[0].trim() + '.';
}

const WRONG_ANSWER = 'This answer is incorrect. I am not sure of the correct approach.';

function isFeedbackSpecific(feedback: string, submittedAnswer: string): boolean {
  if (feedback.length < 50) return false;
  const answerWords = submittedAnswer
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3);
  if (answerWords.length === 0) return true;
  const feedbackLower = feedback.toLowerCase();
  const matches = answerWords.filter((w) => feedbackLower.includes(w));
  return matches.length >= Math.min(1, Math.ceil(answerWords.length * 0.2));
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

interface GradingResult {
  results: LlmGradedAnswer[];
  retried: boolean;
  failed: boolean;
}

async function runGrading(
  subject: string,
  questionsAndAnswers: Array<{
    questionNumber: number;
    questionText: string;
    correctAnswer: string;
    userAnswer: string;
  }>,
): Promise<GradingResult> {
  const sanitizedSubject = sanitizeForPrompt(subject);
  const systemPrompt = buildGradingSystemPrompt();
  const userMessage = buildGradingUserMessage({
    subject: sanitizedSubject,
    questionsAndAnswers: questionsAndAnswers.map((q) => ({
      questionNumber: q.questionNumber,
      questionText: q.questionText,
      correctAnswer: q.correctAnswer,
      userAnswer: q.userAnswer,
    })),
  });

  const firstMessages: MessageParam[] = [{ role: 'user', content: userMessage }];
  let firstResponse: string;
  try {
    firstResponse = await callLlmStream(systemPrompt, firstMessages, LLM_GRADING_TEMPERATURE);
  } catch {
    return { results: [], retried: false, failed: true };
  }

  if (firstResponse.includes(SYSTEM_MARKER)) {
    return { results: [], retried: false, failed: true };
  }

  const firstBlock = parseBlock(firstResponse, 'results');
  const firstParsed =
    firstBlock !== null ? llmGradedAnswersOutputSchema.safeParse(firstBlock) : null;
  if (firstParsed?.success) {
    return { results: firstParsed.data, retried: false, failed: false };
  }

  const retryMessages: MessageParam[] = [
    { role: 'user', content: userMessage },
    { role: 'assistant', content: firstResponse },
    { role: 'user', content: CORRECTIVE_MESSAGE },
  ];
  let retryResponse: string;
  try {
    retryResponse = await callLlmStream(systemPrompt, retryMessages, LLM_GRADING_TEMPERATURE);
  } catch {
    return { results: [], retried: true, failed: true };
  }

  if (retryResponse.includes(SYSTEM_MARKER)) {
    return { results: [], retried: true, failed: true };
  }

  const retryBlock = parseBlock(retryResponse, 'results');
  const retryParsed = retryBlock !== null ? llmGradedAnswersOutputSchema.safeParse(retryBlock) : null;
  if (retryParsed?.success) {
    return { results: retryParsed.data, retried: true, failed: false };
  }

  return { results: [], retried: true, failed: true };
}

function clampScore(raw: number): 0 | 0.5 | 1 {
  if (raw < 0.25) return 0;
  if (raw < 0.75) return 0.5;
  return 1;
}

function loadScorecard(): Array<Record<string, unknown>> {
  if (!fs.existsSync(SCORECARD_PATH)) return [];
  const raw = fs.readFileSync(SCORECARD_PATH, 'utf-8');
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
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
  const targetedDifficulty = difficultyArg ? difficultyArg.split('=')[1] : null;

  if (!fs.existsSync(GENERATION_RESULTS_PATH)) {
    process.stderr.write(
      `Error: ${GENERATION_RESULTS_PATH} not found. Run eval:generation first.\n`,
    );
    process.exit(1);
  }

  const genFile = JSON.parse(fs.readFileSync(GENERATION_RESULTS_PATH, 'utf-8')) as
    | { runId?: string; timestamp?: string; questions: Array<Record<string, unknown>> }
    | Array<Record<string, unknown>>;

  const generationResults = Array.isArray(genFile) ? genFile : genFile.questions;

  const freeTextQuestions = generationResults.filter(
    (r: Record<string, unknown>) =>
      r.zodPassed && r.format !== 'mcq' && r.questionText,
  );

  const questionsByDifficulty = targetedDifficulty
    ? freeTextQuestions.filter((q: Record<string, unknown>) => q.difficulty === targetedDifficulty)
    : freeTextQuestions;

  const minQuestions = targetedDifficulty ? 3 : 10;
  if (questionsByDifficulty.length < minQuestions) {
    process.stderr.write(
      `Error: Need at least ${minQuestions} free-text questions for ${targetedDifficulty ?? 'full'} run. Found ${questionsByDifficulty.length}.\n`,
    );
    process.exit(1);
  }

  const questionsToGrade = questionsByDifficulty;

  ensureOutputDir();

  const currentHashes = computePromptHashes();
  const scorecard = loadScorecard();

  const genResultsMtime = fs.statSync(GENERATION_RESULTS_PATH).mtimeMs;
  const now = Date.now();
  const recentGeneration = now - genResultsMtime < FIVE_MINUTES_MS;

  let lastGenEntry: Record<string, unknown> | undefined;
  if (fs.existsSync(GENERATION_RESULTS_PATH)) {
    const genFileContent = JSON.parse(fs.readFileSync(GENERATION_RESULTS_PATH, 'utf-8'));
    if (genFileContent?.runId && !Array.isArray(genFileContent)) {
      lastGenEntry = scorecard.find((e) => e.runId === genFileContent.runId) as
        | Record<string, unknown>
        | undefined;
    }
  }
  if (!lastGenEntry && scorecard.length > 0) {
    lastGenEntry = scorecard.filter(
      (e) => (e.generation as Record<string, unknown>)?.totalQuestions > 0,
    ).pop() as Record<string, unknown> | undefined;
  }

  let runId: string;
  let timestamp: string;
  let scope: string;

  if (recentGeneration && lastGenEntry) {
    runId = lastGenEntry.runId as string;
    timestamp = lastGenEntry.timestamp as string;
    scope = lastGenEntry.scope as string;
  } else {
    runId = new Date().toISOString().replace(/:/g, '-').slice(0, 19) + 'Z';
    timestamp = new Date().toISOString();
    scope = targetedDifficulty ? `${targetedDifficulty} only` : 'full';
  }

  process.stdout.write(
    `📝 Grading ${targetedDifficulty ?? 'all'} questions (3 answer variants each)...\n`,
  );

  const gradingResults: Array<{
    questionText: string;
    questionDifficulty: string;
    submittedAnswer: string;
    expectedTier: 'strong' | 'partial' | 'wrong';
    actualScore: number;
    feedback: string;
    feedbackIsSpecific: boolean;
  }> = [];

  let totalGraded = 0;
  let totalFailures = 0;
  let correctScores = 0;

  const expectedByTier = { strong: 1, partial: 0.5, wrong: 0 };
  const byDifficulty: Record<
    string,
    {
      evaluated: boolean;
      totalGraded: number;
      accuracyRate: number;
      strong: { expected: number; correct: number };
      partial: { expected: number; correct: number };
      wrong: { expected: number; correct: number };
    }
  > = {};

  for (const q of questionsToGrade) {
    byDifficulty[q.difficulty] ??= {
      evaluated: true,
      totalGraded: 0,
      accuracyRate: 0,
      strong: { expected: 0, correct: 0 },
      partial: { expected: 0, correct: 0 },
      wrong: { expected: 0, correct: 0 },
    };
  }

  interface Q { difficulty: string; questionText: string; correctAnswer: string }
  for (let i = 0; i < questionsToGrade.length; i++) {
    const q = questionsToGrade[i] as Q;
    const subject = q.difficulty === 'easy' ? 'JavaScript' : q.difficulty === 'medium' ? 'React' : 'System Design';

    const strongAnswer = q.correctAnswer;
    const partialAnswer = createPartialAnswer(q.correctAnswer);

    const qaList = [
      { questionNumber: 1, questionText: q.questionText, correctAnswer: q.correctAnswer, userAnswer: strongAnswer },
      { questionNumber: 2, questionText: q.questionText, correctAnswer: q.correctAnswer, userAnswer: partialAnswer },
      { questionNumber: 3, questionText: q.questionText, correctAnswer: q.correctAnswer, userAnswer: WRONG_ANSWER },
    ];

    const result = await runGrading(subject, qaList);

    if (result.failed) {
      totalFailures++;
      process.stdout.write(`   Q${i + 1}: failed\n`);
      continue;
    }

    const graded = result.results.map((r) => ({
      ...r,
      score: clampScore(r.score),
    }));

    const strongResult = graded.find((g) => g.questionNumber === 1);
    const partialResult = graded.find((g) => g.questionNumber === 2);
    const wrongResult = graded.find((g) => g.questionNumber === 3);

    const strongOk = strongResult?.score === 1;
    const partialOk = partialResult?.score === 0.5;
    const wrongOk = wrongResult?.score === 0;

    const status = `${strongOk ? '✓' : '✗'}  partial=${partialOk ? '✓' : '✗'}  wrong=${wrongOk ? '✓' : '✗'}`;
    process.stdout.write(`   Q${i + 1}: strong=${strongResult?.score ?? '?'} ${status}\n`);

    for (const [idx, variant] of ['strong', 'partial', 'wrong'] as const) {
      const res = graded.find((g) => g.questionNumber === idx + 1);
      const expected = expectedByTier[variant];
      const actual = res?.score ?? -1;
      const isCorrect = actual === expected;
      if (isCorrect) correctScores++;
      gradingResults.push({
        questionText: q.questionText,
        questionDifficulty: q.difficulty,
        submittedAnswer: qaList[idx].userAnswer,
        expectedTier: variant,
        actualScore: actual,
        feedback: res?.feedback ?? '',
        feedbackIsSpecific: res ? isFeedbackSpecific(res.feedback, qaList[idx].userAnswer) : false,
      });
      byDifficulty[q.difficulty][variant].expected++;
      if (isCorrect) byDifficulty[q.difficulty][variant].correct++;
    }
    totalGraded += 3;
  }

  for (const d of Object.keys(byDifficulty)) {
    const diff = byDifficulty[d];
    const total = diff.strong.expected + diff.partial.expected + diff.wrong.expected;
    diff.totalGraded = total;
    diff.accuracyRate = total > 0 ? (diff.strong.correct + diff.partial.correct + diff.wrong.correct) / total : 0;
  }

  fs.writeFileSync(GRADING_RESULTS_PATH, JSON.stringify(gradingResults, null, 2));

  const accuracyRate = totalGraded > 0 ? correctScores / totalGraded : 0;

  let entry = scorecard.find((e) => e.runId === runId) as Record<string, unknown> | undefined;
  if (!entry) {
    entry = {
      runId,
      timestamp,
      scope,
      difficultiesEvaluated: targetedDifficulty ? [targetedDifficulty] : ['easy', 'medium', 'hard'],
      generation: {},
      grading: {},
      promptFilesHash: currentHashes,
      changedSinceLastRun: [],
      notes: '',
    };
    scorecard.push(entry);
  }

  entry.grading = {
    totalGraded,
    aggregate: { accuracyRate },
    byDifficulty,
  };
  entry.promptFilesHash = currentHashes;

  fs.writeFileSync(SCORECARD_PATH, JSON.stringify(scorecard, null, 2));

  process.stdout.write(
    `\n✅ Grading complete: ${totalGraded}/${totalGraded + totalFailures * 3} graded, ${totalFailures} failures\n`,
  );
}

main().catch((err) => {
  process.stderr.write(String(err) + '\n');
  process.exit(1);
});
