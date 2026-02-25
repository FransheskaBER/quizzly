import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { signupAndVerify, createE2ECredentials } from './helpers/auth.helper';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test.skip(
  !process.env.ANTHROPIC_API_KEY,
  'ANTHROPIC_API_KEY required for quiz generation',
);

test('generate quiz, take it, submit, and view results', async ({ page, baseURL }) => {
  test.setTimeout(240_000);

  const credentials = createE2ECredentials();
  await signupAndVerify(page, baseURL!, credentials);

  await page.goto(`${baseURL}/sessions/new`);
  await page.getByLabel('Session name').fill('E2E Quiz Session');
  await page.getByLabel('Subject area').fill('Computer Science');
  await page.getByLabel('Study goal').fill('Practice binary search');
  await page.getByRole('button', { name: 'Create Session' }).click();
  await page.waitForURL(/\/sessions\/[a-f0-9-]+$/);

  const fixturePath = path.join(__dirname, 'fixtures', 'sample-material.txt');
  await page.locator('input[type="file"]').setInputFiles(fixturePath);
  await expect(page.getByText('ready')).toBeVisible({ timeout: 30_000 });

  await page.getByLabel('Number of Questions').fill('5');
  await page.getByRole('button', { name: 'Generate Quiz' }).click();

  const startBtn = page.getByRole('button', { name: 'Start Quiz' });
  await startBtn.waitFor({ state: 'visible', timeout: 150_000 });
  await startBtn.click();

  await page.waitForURL(/\/quiz\/[a-f0-9-]+$/);

  const questionCount = await page.getByText(/Question \d+ of \d+/).first().textContent();
  const match = questionCount?.match(/of (\d+)/);
  const total = match ? parseInt(match[1], 10) : 2;
  for (let i = 0; i < total; i++) {
    const mcqOption = page.locator('input[type="radio"]').first();
    const freeText = page.getByPlaceholder('Type your answer here...');
    if (await mcqOption.isVisible()) {
      await mcqOption.check();
    } else if (await freeText.isVisible()) {
      await freeText.fill('Sample answer for E2E test');
    }
    if (i < total - 1) {
      await page.getByRole('button', { name: 'Next →' }).click();
    }
  }

  await page.getByRole('button', { name: 'Complete Quiz' }).click();
  await page.waitForURL(/\/quiz\/[a-f0-9-]+\/results$/);

  await expect(page.getByText(/Grading your quiz|Loading results|Perfect score|Great effort|Good progress|Keep practicing|Quiz Results/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Final Score')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Explanation').first()).toBeVisible({ timeout: 5000 });
});
