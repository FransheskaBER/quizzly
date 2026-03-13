/**
 * Runs once before all tests.
 * When USE_DB_COPY=1, performs a deep full copy from DATABASE_URL to TEST_DATABASE_URL.
 */
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverRoot = resolve(__dirname, '../..');

export default async function globalSetup(): Promise<void> {
  execSync('npx tsx scripts/copy-db-to-test.ts', {
    stdio: 'inherit',
    cwd: serverRoot,
    env: { ...process.env },
  });
}
