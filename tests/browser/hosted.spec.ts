import { test as base, expect } from '@playwright/test';
import { hostedRequestAllowed } from './hosted-policy.js';
import { assertReflow } from './helpers.js';

const test = base.extend({
  context: async ({ context }, use) => {
    const forbidden: string[] = [];
    const origin = new URL(process.env.APP_ORIGIN!).origin;
    await context.route('**/*', async (route) => {
      const req = route.request();
      if (hostedRequestAllowed(req.method(), req.url(), origin)) return route.continue();
      forbidden.push(`${req.method()} ${new URL(req.url()).pathname}`);
      await route.abort('blockedbyclient');
    });
    await use(context);
    expect(forbidden, 'Hosted application writes are forbidden').toEqual([]);
  },
});

test.afterEach(async ({ page }) => {
  if ((await page.context().cookies()).some((cookie) => cookie.name === 'session')) {
    const response = await page.request.post('/api/auth/logout', {
      headers: { 'X-Civic-Request': '1', Origin: new URL(process.env.APP_ORIGIN!).origin },
    });
    expect(response.status(), 'Revoke the test session even when a hosted assertion fails').toBe(
      204,
    );
  }
});

for (const role of ['RESIDENT', 'STAFF'] as const) {
  test(`${role.toLowerCase()} hosted read-only navigation, existing reports, mobile layout and logout`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', () => errors.push('Hosted page raised a JavaScript error.'));
    // Free Render instances may return a wake-up HTML page before the app is ready.
    await expect
      .poll(
        async () => {
          try {
            const health = await page.request.get('/api/health', { timeout: 10_000 });
            return health.ok() && (await health.json()).ok === true;
          } catch {
            return false;
          }
        },
        { timeout: 90_000, intervals: [1000, 2000, 5000] },
      )
      .toBe(true);
    await page.goto('/');
    await page.getByLabel('Email address').fill(process.env[`${role}_EMAIL`]!);
    await page.getByLabel('Password', { exact: true }).fill(process.env[`${role}_PASSWORD`]!);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
    const cookie = (await page.context().cookies()).find((c) => c.name === 'session');
    expect(cookie?.secure && cookie.httpOnly && cookie.sameSite === 'Strict').toBe(true);
    for (const path of ['/', '/mine', '/following', ...(role === 'STAFF' ? ['/staff'] : [])]) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(
        page.getByRole('status').filter({ hasText: 'Loading community reports' }),
      ).toHaveCount(0);
      await assertReflow(page);
    }
    // Existing owned reports are the only hosted photo/history fixtures. No new records are created.
    await page.goto(role === 'STAFF' ? '/' : '/mine');
    const card = page.locator('.report-card').first();
    await expect(
      card,
      'An existing report is required; this check does not seed hosted data',
    ).toBeVisible();
    await card.click();
    await expect(page.getByRole('heading', { name: 'Report timeline', exact: true })).toBeVisible();
    await expect(page.locator('.timeline li').first()).toBeVisible();
    const available = await page.request.get(
      `/api/complaints?scope=${role === 'STAFF' ? 'all' : 'mine'}`,
    );
    expect(available.ok()).toBe(true);
    const reports = (await available.json()).items as { id: string; photoId?: string }[];
    const withPhoto = reports.find((report) => report.photoId);
    expect(!!withPhoto, 'An existing private photo fixture is required for this check').toBe(true);
    await page.goto(`/complaints/${encodeURIComponent(withPhoto!.id)}`);
    const photos = page.locator('img.report-photo');
    await expect(
      photos,
      'An existing private photo fixture is required for this check',
    ).toHaveCount(1);
    for (const photo of await photos.all()) {
      await expect(photo).toBeVisible();
      expect(
        await photo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
      ).toBe(true);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await assertReflow(page);
    await page.goto('/report');
    await page.getByText('Pin on map (optional)', { exact: true }).click();
    const map = page.getByRole('region', { name: 'Hyderabad location picker' });
    await expect(map).toBeVisible();
    await expect
      .poll(
        async () =>
          (await map.locator('.leaflet-tile-loaded').count()) > 0 ||
          (await page.getByText('Map tiles could not load.', { exact: false }).isVisible()),
      )
      .toBe(true);
    await assertReflow(page);
    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });
}
