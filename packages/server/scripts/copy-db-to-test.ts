#!/usr/bin/env tsx
/**
 * Deep full copy: copies DATABASE_URL (source) to TEST_DATABASE_URL (target).
 * Schema + data are copied so tests run against real data.
 *
 * Run when USE_DB_COPY=1 (e.g. USE_DB_COPY=1 npm test).
 * Skipped when: CI, or source === target, or USE_DB_COPY is not set.
 */

import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env') });

const source = process.env.DATABASE_URL;
const target = process.env.TEST_DATABASE_URL;
const useCopy = process.env.USE_DB_COPY === '1' || process.env.USE_DB_COPY === 'true';

const isLocal = (url: string) => /localhost|127\.0\.0\.1/.test(url);

export async function copyDatabaseToTest(): Promise<void> {
  if (!useCopy) return;
  if (process.env.CI) return; // CI has no source with data; skip
  if (!source || !target) {
    throw new Error(
      'USE_DB_COPY requires both DATABASE_URL (source) and TEST_DATABASE_URL (target) in .env',
    );
  }
  if (!isLocal(source) || !isLocal(target)) {
    throw new Error(
      'Both DATABASE_URL and TEST_DATABASE_URL must point to localhost/127.0.0.1 for safe copy',
    );
  }
  if (source === target) {
    return; // Same DB; nothing to copy
  }

  // pg_dump --clean --if-exists dumps schema+data with DROP statements for target cleanup
  // --no-owner avoids permission issues when restoring
  const cmd = `pg_dump --clean --if-exists --no-owner "${source}" | psql "${target}"`;
  execSync(cmd, {
    stdio: 'inherit',
    shell: true,
  });
}

// Run when executed directly (e.g. npx tsx scripts/copy-db-to-test.ts)
const isMain = process.argv[1]?.includes('copy-db-to-test');
if (isMain) {
  copyDatabaseToTest().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
