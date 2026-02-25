import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { signupAndVerify, createE2ECredentials } from './helpers/auth.helper';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test.skip(
  !process.env.ANTHROPIC_API_KEY,
  'ANTHROPIC_API_KEY required for quiz generation',
);

test('review past quiz results', async ({ page, baseURL }) => {
  test.setTimeout(240_000);

  const credentials = createE2ECredentials();
  await signupAndVerify(page, baseURL!, credentials);

  await page.goto(`${baseURL}/sessions/new`);
  await page.getByLabel('Session name').fill('E2E Results Session');
  await page.getByLabel('Subject area').fill('Computer Science');
  await page.getByLabel('Study goal').fill('Practice REST APIs');
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

  const total = 5;
  for (let i = 0; i < total; i++) {
    const mcqOption = page.locator('input[type="radio"]').first();
    const freeText = page.getByPlaceholder('Type your answer here...');
    if (await mcqOption.isVisible()) {
      await mcqOption.check();
    } else if (await freeText.isVisible()) {
      await freeText.fill('E2E review answer');
    }
    if (i < total - 1) {
      await page.getByRole('button', { name: 'Next →' }).click();
    }
  }

  await page.getByRole('button', { name: 'Complete Quiz' }).click();
  await page.waitForURL(/\/sessions\/[a-f0-9-]+$/);

  await expect(page.getByText('completed')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('link').filter({ hasText: 'completed' }).first().click();

  await page.waitForURL(/\/quiz\/[a-f0-9-]+\/results$/);

  await expect(page.getByText('Final Score')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('correct').or(page.getByText('incorrect')).or(page.getByText('partial'))).toBeVisible();
  await expect(page.getByText('Your answer')).toBeVisible();
  await expect(page.getByText('Model answer').or(page.getByText('Explanation'))).toBeVisible({ timeout: 10_000 });
});
