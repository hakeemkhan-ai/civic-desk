import { expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { FixtureData } from './data.js';

export async function login(page: Page, data: FixtureData, account = 0) {
  await page.goto('/');
  await page.getByLabel('Email address').fill(data.users[account].email);
  await page.getByLabel('Password', { exact: true }).fill(data.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
}

export async function assertAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).options({ preload: false }).analyze();
  expect(
    results.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? '')),
  ).toEqual([]);
}

export async function assertReflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  for (const control of await page
    .locator('button:visible, input:visible, select:visible, textarea:visible, nav a:visible')
    .all()) {
    const box = await control.boundingBox();
    if (box) {
      expect(box.x, 'Control must not clip beyond the left viewport edge').toBeGreaterThanOrEqual(
        -1,
      );
      expect(
        box.x + box.width,
        'Control must not clip beyond the right viewport edge',
      ).toBeLessThanOrEqual((page.viewportSize()?.width ?? 0) + 1);
    }
  }
}

export async function manualDraft(
  page: Page,
  title = 'Synthetic browser water leak',
  photo?: Buffer,
) {
  await page.goto('/report');
  await page
    .getByLabel('What’s happening?', { exact: false })
    .fill(
      'Synthetic browser verification: water leaking beside the demonstration garden entrance.',
    );
  await page.getByLabel('Where is it?', { exact: false }).fill('Synthetic Hyderabad garden');
  if (photo)
    await page.getByLabel('Add a photo', { exact: false }).setInputFiles({
      name: 'synthetic.png',
      mimeType: 'image/png',
      buffer: photo,
    });
  await page.getByRole('button', { name: 'Write it myself' }).click();
  await page.getByLabel('Report title', { exact: true }).fill(title);
  await page.getByRole('combobox', { name: 'Category', exact: true }).selectOption('water');
}

export async function compare(page: Page) {
  await page.getByRole('button', { name: 'Check similar reports', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Has someone already reported it?' }),
  ).toBeVisible();
}
