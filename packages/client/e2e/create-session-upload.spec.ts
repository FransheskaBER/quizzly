import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { signupAndVerify, createE2ECredentials } from './helpers/auth.helper';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('create session and upload material', async ({ page, baseURL }) => {
  const credentials = createE2ECredentials();
  await signupAndVerify(page, baseURL!, credentials);

  await page.goto(`${baseURL}/sessions/new`);
  await page.getByLabel('Session name').fill('E2E Test Session');
  await page.getByLabel('Subject area').fill('Computer Science');
  await page.getByLabel('Study goal').fill('Practice binary search and REST APIs');
  await page.getByRole('button', { name: 'Create Session' }).click();
  await page.waitForURL(/\/sessions\/[a-f0-9-]+$/);

  await expect(page.getByRole('heading', { name: 'E2E Test Session' })).toBeVisible();

  const fixturePath = path.join(__dirname, 'fixtures', 'sample-material.txt');
  await page.locator('input[type="file"]').setInputFiles(fixturePath);

  await expect(page.getByText('sample-material.txt')).toBeVisible();
  await expect(page.getByText('ready')).toBeVisible({ timeout: 30_000 });
});
