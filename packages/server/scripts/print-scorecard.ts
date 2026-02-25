import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = path.resolve(__dirname, '..');
const SCORECARD_PATH = path.join(SERVER_ROOT, 'scripts', 'output', 'scorecard.json');

interface ScorecardEntry {
  runId: string;
  timestamp: string;
  scope: string;
  difficultiesEvaluated: string[];
  generation?: {
    totalQuestions: number;
    aggregate?: { zodPassRate?: number; retries?: number; failures?: number };
    byDifficulty?: Record<
      string,
      {
        evaluated?: boolean;
        totalGenerated?: number;
        zodPassRate?: number;
        carriedFromRun?: string;
        typeDistribution?: Record<string, number>;
      }
    >;
  };
  grading?: {
    totalGraded?: number;
    aggregate?: { accuracyRate?: number };
    byDifficulty?: Record<
      string,
      {
        evaluated?: boolean;
        totalGraded?: number;
        accuracyRate?: number;
        strong?: { expected: number; correct: number };
        partial?: { expected: number; correct: number };
        wrong?: { expected: number; correct: number };
      }
    >;
  };
  promptFilesHash?: Record<string, string>;
  changedSinceLastRun?: string[];
}

function formatRunId(runId: string): string {
  return runId.replace('T', ' ').replace('-00Z', '').slice(0, 16);
}

function pct(value: number): string {
  if (value === undefined || Number.isNaN(value)) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

function main(): void {
  if (!fs.existsSync(SCORECARD_PATH)) {
    process.stderr.write(`Scorecard not found at ${SCORECARD_PATH}. Run eval:generation first.\n`);
    process.exit(1);
  }

  const scorecard = JSON.parse(fs.readFileSync(SCORECARD_PATH, 'utf-8')) as ScorecardEntry[];

  const colRun = 20;
  const colScope = 11;
  const colChanged = 14;
  const colZod = 10;
  const colGrade = 11;

  const top = '╔' + '═'.repeat(colRun) + '╦' + '═'.repeat(colScope) + '╦' + '═'.repeat(colChanged) + '╦' + '═'.repeat(colZod) + '╦' + '═'.repeat(colGrade) + '╗';
  const header = '║ Run                 ║ Scope     ║ Changed        ║ Zod Pass ║ Grade Acc ║';
  const sep = '╠' + '═'.repeat(colRun) + '╬' + '═'.repeat(colScope) + '╬' + '═'.repeat(colChanged) + '╬' + '═'.repeat(colZod) + '╬' + '═'.repeat(colGrade) + '╣';
  const bottom = '╚' + '═'.repeat(colRun) + '╩' + '═'.repeat(colScope) + '╩' + '═'.repeat(colChanged) + '╩' + '═'.repeat(colZod) + '╩' + '═'.repeat(colGrade) + '╝';

  process.stdout.write('\n');
  process.stdout.write('╔══════════════════════════════════════════════════════════════════════════╗\n');
  process.stdout.write('║                        QUIZZLY PROMPT SCORECARD                        ║\n');
  process.stdout.write('╠' + '═'.repeat(colRun) + '╦' + '═'.repeat(colScope) + '╦' + '═'.repeat(colChanged) + '╦' + '═'.repeat(colZod) + '╦' + '═'.repeat(colGrade) + '╣\n');
  process.stdout.write(header + '\n');
  process.stdout.write(sep + '\n');

  let prevEntry: ScorecardEntry | null = null;
  let bestRun: { runId: string; accuracy: number } | null = null;

  const row = (run: string, scope: string, ch: string, zod: string, grade: string) =>
    '║' + run.padEnd(colRun) + '║' + scope.padEnd(colScope) + '║' + ch.padEnd(colChanged) + '║' + zod.padEnd(colZod) + '║' + grade.padEnd(colGrade) + '║\n';

  for (const entry of scorecard) {
    const runLabel = formatRunId(entry.runId);
    const scopeLabel = (entry.scope ?? 'full').slice(0, 9).padEnd(9);
    const changedLabel = (
      entry.changedSinceLastRun?.length ? (entry.changedSinceLastRun[0] ?? '') : '(baseline)'
    ).slice(0, 12).padEnd(12);

    const genAgg = entry.generation?.aggregate;
    const gradeAcc = entry.grading?.aggregate?.accuracyRate;

    const sysZod = genAgg?.zodPassRate !== undefined ? pct(genAgg.zodPassRate) : '—';
    process.stdout.write(row(runLabel, scopeLabel, changedLabel, '', ''));
    process.stdout.write(row('  system (gen)', '', '', sysZod, '—'));

    const diffs = ['easy', 'medium', 'hard'];
    for (const d of diffs) {
      const genDiff = entry.generation?.byDifficulty?.[d];
      const gradDiff = entry.grading?.byDifficulty?.[d];
      const carried = genDiff && !genDiff.evaluated && genDiff.carriedFromRun;
      const zodVal = genDiff?.zodPassRate;
      const accVal = gradDiff?.accuracyRate;

      let zodStr = zodVal !== undefined ? pct(zodVal) : '·';
      let accStr = accVal !== undefined ? pct(accVal) : '·';

      if (prevEntry && !carried) {
        const prevGen = prevEntry.generation?.byDifficulty?.[d];
        const prevGrad = prevEntry.grading?.byDifficulty?.[d];
        if (zodVal !== undefined && prevGen?.zodPassRate !== undefined) {
          if (zodVal > prevGen.zodPassRate) zodStr += ' ▲';
          else if (zodVal < prevGen.zodPassRate) zodStr += ' ▼';
          else zodStr += ' ·';
        } else if (prevGen) zodStr += ' ·';
        if (accVal !== undefined && prevGrad?.accuracyRate !== undefined) {
          if (accVal > prevGrad.accuracyRate) accStr += ' ▲';
          else if (accVal < prevGrad.accuracyRate) accStr += ' ▼';
          else accStr += ' ·';
        } else if (prevGrad) accStr += ' ·';
      } else if (carried) {
        zodStr += ' ·';
        accStr += ' ·';
      }

      const chLabel = entry.changedSinceLastRun?.includes(`generation/${d}.prompt.ts`) ? '← CHANGED' : '';
      process.stdout.write(row(`  ${d}`, '', chLabel, zodStr, accStr));
    }

    if (entry.grading?.aggregate) {
      const gradAcc = entry.grading.aggregate.accuracyRate;
      let gradStr = gradAcc !== undefined ? pct(gradAcc) : '·';
      if (prevEntry?.grading?.aggregate?.accuracyRate !== undefined && gradAcc !== undefined) {
        const prevG = prevEntry.grading.aggregate.accuracyRate;
        if (gradAcc > prevG) gradStr += ' ▲';
        else if (gradAcc < prevG) gradStr += ' ▼';
        else gradStr += ' ·';
      }
      const gradChLabel = entry.changedSinceLastRun?.some((f) => f.includes('grading')) ? '← CHANGED' : '';
      process.stdout.write(row('  grading', '', gradChLabel, '·', gradStr));
    }

    process.stdout.write(sep + '\n');

    if (gradeAcc !== undefined && gradeAcc > 0) {
      if (!bestRun || gradeAcc > bestRun.accuracy) {
        bestRun = { runId: entry.runId, accuracy: gradeAcc };
      }
    }

    prevEntry = entry;
  }

  process.stdout.write(bottom + '\n');
  process.stdout.write('\n· = carried from previous run    ▲ = improved    ▼ = regressed\n\n');

  if (scorecard.length >= 2) {
    const latest = scorecard[scorecard.length - 1];
    const previous = scorecard[scorecard.length - 2];

    process.stdout.write('─'.repeat(75) + '\n');
    process.stdout.write(`📊 ANALYSIS: Run ${formatRunId(latest.runId)} vs ${formatRunId(previous.runId)}\n`);
    process.stdout.write('─'.repeat(75) + '\n\n');

    const lines: string[] = [];

    const latestGrad = latest.grading?.aggregate?.accuracyRate;
    const prevGrad = previous.grading?.aggregate?.accuracyRate;
    if (latestGrad !== undefined && prevGrad !== undefined) {
      const delta = latestGrad - prevGrad;
      if (delta < 0) {
        lines.push(`Overall grading accuracy REGRESSED: ${pct(prevGrad)} → ${pct(latestGrad)} (${(delta * 100).toFixed(1)}%).`);
      } else if (delta > 0) {
        lines.push(`Overall grading accuracy IMPROVED: ${pct(prevGrad)} → ${pct(latestGrad)} (+${(delta * 100).toFixed(1)}%).`);
      }
    }

    for (const d of ['easy', 'medium', 'hard']) {
      const curr = latest.grading?.byDifficulty?.[d];
      const prev = previous.grading?.byDifficulty?.[d];
      if (curr?.accuracyRate !== undefined && prev?.accuracyRate !== undefined) {
        const delta = curr.accuracyRate - prev.accuracyRate;
        if (delta < -0.05) {
          lines.push(
            `${d} grading accuracy REGRESSED: ${pct(prev.accuracyRate)} → ${pct(curr.accuracyRate)} (${(delta * 100).toFixed(1)}%).`,
          );
        }
      }
    }

    const latestZod = latest.generation?.aggregate?.zodPassRate;
    const prevZod = previous.generation?.aggregate?.zodPassRate;
    if (latestZod !== undefined && prevZod !== undefined && latestZod < prevZod) {
      lines.push(
        `Zod pass rate dropped: ${pct(prevZod)} → ${pct(latestZod)}. Check output format instructions in generation prompts.`,
      );
    }

    if (lines.length === 0) {
      lines.push('No significant changes detected between runs.');
    }

    for (const line of lines) {
      process.stdout.write(line + '\n');
    }

    process.stdout.write('\n');
  }

  if (bestRun) {
    process.stdout.write(
      `Best run so far: ${formatRunId(bestRun.runId)} (${(bestRun.accuracy * 100).toFixed(1)}% overall grading accuracy).\n`,
    );
  }
  process.stdout.write('─'.repeat(75) + '\n');
}

main();
