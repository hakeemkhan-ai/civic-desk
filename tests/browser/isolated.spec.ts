import { test as base, expect } from '@playwright/test';
import { resetFixture, verificationDatabase, type FixtureData } from './data.js';
import type { Complaint } from '../../server/db.js';
import { assertAccessible, assertReflow, compare, login, manualDraft } from './helpers.js';

const test = base.extend<{ data: FixtureData }>({
  data: async ({}, use) => {
    await use(await resetFixture());
  },
  page: async ({ page, data }, use) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (
        message.type() === 'error' &&
        /content security policy|hydration|hydrating/i.test(message.text())
      ) {
        errors.push(message.text());
      }
    });
    await page.route('https://tile.openstreetmap.org/**', (route) =>
      route.fulfill({
        contentType: 'image/png',
        body: data.image,
      }),
    );
    await use(page);
    expect(errors, 'No JavaScript, CSP, or hydration failures').toEqual([]);
  },
});

test('registration, secure session, manual fallback, filters, following and logout', async ({
  page,
  data,
}) => {
  const response = await page.goto('/');
  const policy = response!.headers()['content-security-policy'];
  const nonce = /'nonce-([^']+)'/.exec(policy)?.[1];
  expect(nonce).toBeTruthy();
  expect(policy).not.toContain("'unsafe-eval'");
  expect(
    await page.locator('script').evaluateAll((scripts) => scripts.every((s) => !!s.nonce)),
  ).toBe(true);
  expect(
    await page
      .locator('script')
      .first()
      .evaluate((s) => s.nonce),
  ).toBe(nonce);
  await assertAccessible(page);
  await page.getByRole('button', { name: 'New here?' }).click();
  await page.getByLabel('Your name').fill('Synthetic registered resident');
  await page.getByLabel('Email address').fill('registered@browser.example');
  await page.getByLabel('Password', { exact: false }).fill(data.password);
  await page.getByRole('button', { name: 'Create resident account', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  const cookie = (await page.context().cookies()).find((c) => c.name === 'session');
  expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Strict' });
  expect(await page.evaluate(() => document.cookie)).not.toContain('session=');
  await page.goto('/report');
  await page
    .getByLabel('What’s happening?', { exact: false })
    .fill('Synthetic manual fallback notes.');
  const failedAI = page.waitForResponse((r) => r.url().endsWith('/api/drafts'));
  await page.getByRole('button', { name: 'Help me draft this' }).click();
  expect((await failedAI).status()).toBe(503);
  await expect(page.getByRole('main').getByRole('alert')).toBeVisible();
  await page.getByRole('button', { name: 'Write it myself' }).click();
  await expect(page.getByRole('combobox', { name: 'Category', exact: true })).toBeVisible();
  await page.goto('/');
  await page.getByRole('button', { name: 'Water', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No reports here yet.' })).toBeVisible();
  await page.getByRole('button', { name: 'All categories', exact: true }).click();
  await page.getByRole('combobox', { name: 'Filter by status' }).selectOption('submitted');
  await page.getByRole('link', { name: /Synthetic library pothole/ }).click();
  await page.getByRole('button', { name: 'Follow this report', exact: true }).click();
  await page.getByRole('navigation').getByRole('link', { name: 'Following', exact: true }).click();
  await expect(page).toHaveURL('/following');
  await expect(page.getByRole('heading', { name: data.report.content.title })).toBeVisible();
  await page.reload();
  await page.getByRole('link', { name: /Synthetic library pothole/ }).click();
  await page.getByRole('button', { name: 'Following · unfollow', exact: true }).click();
  await page.getByRole('navigation').getByRole('link', { name: 'My reports' }).click();
  await expect(page.getByRole('heading', { name: 'No reports here yet.' })).toBeVisible();
  await page.goto('/staff');
  await expect(page.getByText('Staff access is required.', { exact: true })).toBeVisible();
  expect((await page.request.get('/api/staff/metrics')).status()).toBe(403);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  expect((await page.request.get('/api/complaints')).status()).toBe(401);
});

test('photo upload retry and lost submission response preserve a single report', async ({
  page,
  data,
}) => {
  await login(page, data);
  await manualDraft(page, 'Synthetic retry verification', data.image);
  await assertAccessible(page);
  await compare(page);
  await assertAccessible(page);
  let uploads = 0;
  await page.route('**/api/uploads', async (route) => {
    uploads++;
    if (uploads === 1)
      await route.fulfill({ status: 503, json: { error: 'Synthetic upload outage' } });
    else await route.continue();
  });
  let submissions = 0;
  const keys: string[] = [];
  await page.route('**/api/complaints', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    submissions++;
    keys.push(route.request().headers()['idempotency-key']);
    if (submissions === 1) {
      expect((await route.fetch()).status()).toBe(201);
      await route.fulfill({ status: 503, json: { error: 'Synthetic lost response' } });
    } else await route.continue();
  });
  const submit = page.getByRole('button', { name: 'Submit a new report', exact: true });
  await submit.click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Synthetic upload outage');
  await submit.click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Synthetic lost response');
  await submit.click();
  await expect(page).toHaveURL(/\/complaints\/[a-f0-9-]+$/);
  await expect(page.getByRole('heading', { name: 'Synthetic retry verification' })).toBeVisible();
  const photo = page.getByRole('img', { name: /Photo attached by the resident/ });
  await expect(photo).toBeVisible();
  expect(
    await photo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
  ).toBe(true);
  expect(uploads).toBe(2); // failed upload + successful upload, then cached ID on retry
  expect(submissions).toBe(2);
  expect(new Set(keys).size).toBe(1);
  const client = await verificationDatabase().connect();
  try {
    expect(await client.db().collection('complaints').countDocuments()).toBe(2);
    expect(await client.db().collection('uploads').countDocuments()).toBe(2);
  } finally {
    await client.close();
  }
  await page.reload();
  await expect(photo).toBeVisible();
  await page.goto('/mine');
  await expect(page.getByRole('heading', { name: 'Synthetic retry verification' })).toBeVisible();
});

test('oversized, malformed and unsupported photos fail safely; other residents cannot view photos', async ({
  page,
  data,
}) => {
  await login(page, data);
  await page.goto('/report');
  await page.getByLabel('Add a photo', { exact: false }).setInputFiles({
    name: 'oversized.png',
    mimeType: 'image/png',
    buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
  });
  await expect(page.getByRole('main').getByRole('alert')).toContainText('under 5 MB');
  for (const [name, mimeType, buffer] of [
    ['malformed.png', 'image/png', Buffer.from('synthetic invalid image')],
    ['unsupported.svg', 'image/svg+xml', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')],
  ] as const) {
    await page
      .getByLabel('What’s happening?', { exact: false })
      .fill('Synthetic invalid attachment report.');
    await page
      .getByLabel('Add a photo', { exact: false })
      .setInputFiles({ name, mimeType, buffer });
    await page.getByRole('button', { name: 'Write it myself' }).click();
    await compare(page);
    const upload = page.waitForResponse((r) => r.url().endsWith('/api/uploads'));
    await page.getByRole('button', { name: 'Submit a new report', exact: true }).click();
    expect((await upload).status()).toBe(400);
    await expect(page.getByRole('main').getByRole('alert')).toBeVisible();
    await page.getByRole('button', { name: 'Edit draft' }).click();
    await page.getByRole('button', { name: 'Back', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Sign out' }).click();
  await login(page, data, 2);
  await page.goto(`/complaints/${data.report._id}`);
  await expect(page.getByRole('heading', { name: data.report.content.title })).toBeVisible();
  await expect(page.getByRole('img', { name: /Photo attached/ })).toHaveCount(0);
  expect((await page.request.get(`/api/uploads/${data.photoId}`)).status()).toBe(403);
  expect(
    (
      await page.request.post(`/api/complaints/${data.report._id}/status`, {
        headers: { 'X-Civic-Request': '1', Origin: process.env.VERIFY_BASE_URL! },
        data: { status: 'under review', note: 'Synthetic unauthorized decision', version: 1 },
      })
    ).status(),
  ).toBe(403);
});

test('duplicate comparison and comparison failure keep the manual path available', async ({
  page,
  data,
}) => {
  await login(page, data);
  await manualDraft(page, data.report.content.title);
  await page
    .getByRole('textbox', { name: 'Description', exact: true })
    .fill(data.report.content.description);
  await page.getByRole('combobox', { name: 'Category', exact: true }).selectOption('roads');
  await compare(page);
  await expect(
    page.locator('.candidate').getByRole('heading', { name: data.report.content.title }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Follow this incident', exact: true }).first().click();
  await expect(page).toHaveURL(`/complaints/${data.report._id}`);
  await expect(page.getByRole('button', { name: 'Following · unfollow' })).toBeVisible();
  await manualDraft(page);
  await page.route('**/api/duplicates', (route) => route.abort('failed'));
  await compare(page);
  await expect(
    page.getByText('Similar reports could not be checked.', { exact: true }),
  ).toBeVisible();
  await page.unroute('**/api/duplicates');
  await page.getByRole('button', { name: 'Try checking again', exact: true }).click();
  await expect(page.getByText('Word matching · semantic search unavailable')).toBeVisible();
  await page.getByRole('button', { name: 'Submit a new report', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Synthetic browser water leak' })).toBeVisible();
});

test('map click, drag, keyboard pan/zoom, center and manual coordinates survive tile failure', async ({
  page,
  data,
}) => {
  await login(page, data);
  await page.goto('/report');
  await page.getByText('Pin on map (optional)', { exact: true }).click();
  const map = page.getByRole('region', { name: 'Hyderabad location picker' });
  await expect(map.locator('.leaflet-tile-loaded').first()).toBeVisible();
  await map.click({ position: { x: 180, y: 110 } });
  await expect(page.locator('.map-coordinates')).toContainText('Selected:');
  await page.getByText('Add coordinates or an asset number (optional)', { exact: true }).click();
  const latitude = page.getByLabel('Latitude', { exact: true });
  const longitude = page.getByLabel('Longitude', { exact: true });
  const beforeDrag = await latitude.inputValue();
  const pin = map.locator('.leaflet-marker-icon');
  await map.scrollIntoViewIfNeeded();
  await expect
    .poll(async () => {
      const markerBox = await pin.boundingBox();
      const mapBox = await map.boundingBox();
      return markerBox && mapBox
        ? Math.abs(markerBox.x + markerBox.width / 2 - mapBox.x - mapBox.width / 2)
        : Infinity;
    })
    .toBeLessThan(2);
  const box = (await pin.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 70, box.y + box.height / 2 + 50, { steps: 12 });
  await page.mouse.up();
  await expect(latitude).not.toHaveValue(beforeDrag);
  const beforePan = await longitude.inputValue();
  await map.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('+');
  // Wait for Leaflet pan/zoom animation to settle, rather than racing its center.
  await expect
    .poll(async () => {
      await page.getByRole('button', { name: 'Use map center', exact: true }).click();
      return longitude.inputValue();
    })
    .not.toBe(beforePan);
  await page.getByRole('button', { name: 'Clear pin', exact: true }).click();
  await expect(latitude).toHaveValue('');
  await expect(longitude).toHaveValue('');
  await page.route('https://tile.openstreetmap.org/**', (route) => route.abort());
  // Remount the picker so every tile request is fresh rather than Leaflet's cached zoom tiles.
  await page.getByText('Pin on map (optional)', { exact: true }).click();
  await expect(map).toHaveCount(0);
  await page.getByText('Pin on map (optional)', { exact: true }).click();
  // Move to uncached tiles; Chromium can retain decoded images across a picker remount.
  await latitude.fill('17.9');
  await longitude.fill('78.9');
  await expect(
    page.getByRole('status').filter({ hasText: 'Map tiles could not load' }),
  ).toBeVisible();
  await latitude.fill('17.4');
  await longitude.fill('78.5');
  await expect(page.locator('.map-coordinates')).toHaveText('Selected: 17.400000, 78.500000');
  await assertAccessible(page);
});

test('staff edits survive following, review and consecutive statuses; stale updates fail visibly', async ({
  page,
  data,
}) => {
  await login(page, data, 1);
  await page.goto(`/complaints/${data.report._id}`);
  await expect(page.getByRole('img', { name: /Photo attached by the resident/ })).toBeVisible();
  await page.getByLabel('Approved title').fill('Synthetic staff-approved pothole');
  await page
    .getByLabel('Approved description')
    .fill('Synthetic verified description beside the demonstration library.');
  await page
    .getByLabel('Decision note', { exact: false })
    .fill('Synthetic staff decision retained between updates.');
  await page.getByRole('button', { name: 'Follow this report', exact: true }).click();
  await expect(page.getByLabel('Approved title')).toHaveValue('Synthetic staff-approved pothole');
  await page.getByRole('button', { name: 'Following · unfollow', exact: true }).click();
  await expect(page.getByLabel('Approved description')).toHaveValue(
    'Synthetic verified description beside the demonstration library.',
  );
  await page.getByRole('button', { name: 'Confirm review', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Synthetic staff-approved pothole', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Save status update', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Next status' })).toHaveValue('assigned');
  await expect(page.getByLabel('Decision note', { exact: false })).toHaveValue(
    'Synthetic staff decision retained between updates.',
  );
  await page.getByRole('button', { name: 'Save status update', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Next status' })).toHaveValue('in progress');
  await expect(page.locator('.timeline li')).toHaveCount(4);
  const client = await verificationDatabase().connect();
  try {
    await client
      .db()
      .collection<Complaint>('complaints')
      .updateOne({ _id: data.report._id }, { $inc: { version: 1 } });
  } finally {
    await client.close();
  }
  await page.getByRole('button', { name: 'Save status update', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(/changed|refresh/i);
  await assertAccessible(page);
  await page.setViewportSize({ width: 320, height: 844 });
  await assertReflow(page);
  await assertAccessible(page);
  const timeline = page.getByRole('list', { name: 'Report history' });
  await timeline.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => timeline.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
});

test('list network recovery, CSRF and expired-session errors are visible', async ({
  page,
  data,
}) => {
  await login(page, data);
  await page.route('**/api/complaints?**', (route) => route.abort());
  await page.goto('/mine');
  await expect(page.getByRole('main').getByRole('alert')).toBeVisible();
  await page.unroute('**/api/complaints?**');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('heading', { name: data.report.content.title })).toBeVisible();
  expect(
    (
      await page.request.put(`/api/complaints/${data.report._id}/follow`, {
        headers: { Origin: 'https://foreign.example', 'X-Civic-Request': '1' },
      })
    ).status(),
  ).toBe(403);
  await page.goto(`/complaints/${data.report._id}`);
  const follow = page.getByRole('button', { name: 'Follow this report', exact: true });
  // Expire a loaded session, not the initial /auth/me request that hydrates the page.
  await expect(follow).toBeEnabled();
  const client = await verificationDatabase().connect();
  try {
    await client
      .db()
      .collection('sessions')
      .updateMany({}, { $set: { expiresAt: new Date(0) } });
  } finally {
    await client.close();
  }
  await follow.click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(/session|sign in/i);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
});

test('desktop, phone and 320px reflow have named controls, keyboard access and no clipping', async ({
  page,
  data,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await assertReflow(page);
  await assertAccessible(page);
  await page.screenshot({ path: testInfo.outputPath('320-auth.png'), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await login(page, data);
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: width === 1280 ? 900 : 844 });
    for (const path of ['/', '/report', `/complaints/${data.report._id}`]) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      if (path === '/')
        await expect(page.getByRole('heading', { name: data.report.content.title })).toBeVisible();
      await assertReflow(page);
      await assertAccessible(page);
      await page.screenshot({
        path: testInfo.outputPath(
          `${width}-${path === '/' ? 'list' : path === '/report' ? 'form' : 'detail'}.png`,
        ),
        fullPage: true,
      });
    }
  }
  await page.goto('/report');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
  await page.keyboard.press('Enter');
  let reachedNotes = false;
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press('Tab');
    if (
      await page
        .getByLabel('What’s happening?', { exact: false })
        .evaluate((el) => el === document.activeElement)
    ) {
      reachedNotes = true;
      await page.keyboard.type('Synthetic keyboard-only report notes.');
      break;
    }
  }
  expect(reachedNotes).toBe(true);
  await expect(page.getByRole('button', { name: 'Write it myself' })).toBeEnabled();
});
