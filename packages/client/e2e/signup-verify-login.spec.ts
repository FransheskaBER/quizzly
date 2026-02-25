import { test, expect } from '@playwright/test';
import { signupAndVerify, createE2ECredentials } from './helpers/auth.helper';

test('signup, verify email, and login', async ({ page, baseURL }) => {
  const credentials = createE2ECredentials();
  await signupAndVerify(page, baseURL!, credentials);
  await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible();
  await expect(page.getByText(credentials.username)).toBeVisible();
});
