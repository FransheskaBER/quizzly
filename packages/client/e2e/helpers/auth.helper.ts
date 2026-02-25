import { Page, expect } from '@playwright/test';

export interface SignupCredentials {
  email: string;
  username: string;
  password: string;
}

/** Generate unique E2E credentials. */
export const createE2ECredentials = (): SignupCredentials => ({
  email: `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`,
  username: `e2e-user-${Date.now().toString(36).slice(-6)}`,
  password: 'TestPassword123!',
});

/**
 * Sign up, verify email via test-only endpoint, then log in.
 * Leaves the user authenticated on the dashboard.
 */
export const signupAndVerify = async (
  page: Page,
  baseURL: string,
  credentials: SignupCredentials,
): Promise<void> => {
  await page.goto(`${baseURL}/signup`);
  await page.getByLabel('Email').fill(credentials.email);
  await page.getByLabel('Username').fill(credentials.username);
  await page.getByLabel('Password').fill(credentials.password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: /check your email/i })).toBeVisible();

  const apiBase = baseURL.replace(/\/$/, '');
  const res = await page.request.post(`${apiBase}/api/test/verify-email`, {
    data: { email: credentials.email },
    failOnStatusCode: true,
  });
  if (!res.ok()) {
    throw new Error(`verify-email failed: ${res.status()} ${await res.text()}`);
  }

  await page.goto(`${baseURL}/login`);
  await page.getByLabel('Email').fill(credentials.email);
  await page.getByLabel('Password').fill(credentials.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/dashboard', { waitUntil: 'networkidle' });
};
