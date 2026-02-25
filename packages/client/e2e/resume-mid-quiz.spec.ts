import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { signupAndVerify, createE2ECredentials } from './helpers/auth.helper';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test.skip(
  !process.env.ANTHROPIC_API_KEY,
  'ANTHROPIC_API_KEY required for quiz generation',
);

test('resume quiz and previously entered answers persist', async ({ page, baseURL }) => {
  test.setTimeout(240_000);

  const credentials = createE2ECredentials();
  await signupAndVerify(page, baseURL!, credentials);

  await page.goto(`${baseURL}/sessions/new`);
  await page.getByLabel('Session name').fill('E2E Resume Session');
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

  const mcqOption = page.locator('input[type="radio"]').first();
  const freeText = page.getByPlaceholder('Type your answer here...');
  if (await mcqOption.isVisible()) {
    await mcqOption.check();
  } else if (await freeText.isVisible()) {
    await freeText.fill('First answer persists');
  }

  await page.goto(`${baseURL}/sessions`);
  await page.waitForURL(/\/sessions$/);

  await page.getByRole('link', { name: /E2E Resume Session/ }).click();
  await page.waitForURL(/\/sessions\/[a-f0-9-]+$/);

  const quizLink = page.getByRole('link').filter({ hasText: 'in progress' });
  await quizLink.waitFor({ state: 'visible', timeout: 5000 });
  await quizLink.first().click();

  await page.waitForURL(/\/quiz\/[a-f0-9-]+$/);

  const mcqAfter = page.locator('input[type="radio"]').first();
  const freeTextAfter = page.getByPlaceholder('Type your answer here...');
  if (await mcqAfter.isVisible()) {
    await expect(mcqAfter).toBeChecked();
  } else if (await freeTextAfter.isVisible()) {
    await expect(freeTextAfter).toHaveValue('First answer persists');
  }
});
