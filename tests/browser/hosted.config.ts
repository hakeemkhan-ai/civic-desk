import { defineConfig } from '@playwright/test';

const baseURL = process.env.APP_ORIGIN;
if (!baseURL || new URL(baseURL).protocol !== 'https:') {
  throw new Error('Provide the hosted HTTPS APP_ORIGIN and existing private account credentials.');
}
for (const name of ['RESIDENT_EMAIL', 'RESIDENT_PASSWORD', 'STAFF_EMAIL', 'STAFF_PASSWORD']) {
  if (!process.env[name]) throw new Error(`Missing ${name}; hosted checks never create accounts.`);
}
if (!process.env.VERIFY_HOSTED_OUTPUT) throw new Error('Use npm run test:ui:hosted.');

export default defineConfig({
  testDir: '.',
  testMatch: 'hosted.spec.ts',
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 180_000,
  globalTimeout: 420_000,
  reporter: [['dot']],
  outputDir: process.env.VERIFY_HOSTED_OUTPUT,
  use: {
    browserName: 'chromium',
    baseURL,
    ignoreHTTPSErrors: false,
    trace: 'off',
    video: 'off',
    screenshot: 'off',
    viewport: { width: 1280, height: 900 },
    serviceWorkers: 'block',
    actionTimeout: 15_000,
    navigationTimeout: 90_000,
  },
});
