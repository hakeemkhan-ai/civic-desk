import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

const artifacts = resolve(import.meta.dirname, '../../.cache/browser-verification');

const baseURL = process.env.VERIFY_BASE_URL;
if (!baseURL || !/^https:\/\/localhost:\d+$/.test(baseURL)) {
  throw new Error(
    'Use npm run verify:browser-docker or npm run verify:browser (isolated HTTPS only).',
  );
}

export default defineConfig({
  testDir: '.',
  testMatch: 'isolated.spec.ts',
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  timeout: 60_000,
  globalTimeout: 12 * 60_000,
  expect: { timeout: 10_000 },
  outputDir: resolve(artifacts, 'results'),
  reporter: [
    ['list'],
    ['html', { outputFolder: resolve(artifacts, 'report'), open: 'never' }],
    ['json', { outputFile: resolve(artifacts, 'browser.json') }],
  ],
  use: {
    browserName: 'chromium',
    baseURL,
    // Caddy's private CA is confined to this disposable verification stack.
    ignoreHTTPSErrors: true,
    viewport: { width: 1280, height: 900 },
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    serviceWorkers: 'block',
  },
});
