import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import sharp from 'sharp';
import { issueInvitation } from '../server/invitations.js';

// Run after `npm run build`. Every write is confined to a fresh, disposable
// MongoDB; the project's .env, persistent database and existing accounts are untouched.
async function freePort() {
  const probe = createServer();
  await new Promise<void>((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', resolve);
  });
  const port = (probe.address() as { port: number }).port;
  await new Promise<void>((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function stop(child: ChildProcess | undefined) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
  child.kill('SIGTERM');
  let force: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      exited,
      new Promise<void>((resolve) => {
        force = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 10000);
      }),
    ]);
    await exited;
  } finally {
    clearTimeout(force);
  }
}

let mongo: MongoMemoryServer | undefined;
let client: MongoClient | undefined;
let web: ChildProcess | undefined;
let environmentDirectory: string | undefined;
let serverOutput = '';
try {
  mongo = await MongoMemoryServer.create({ binary: { version: '7.0.24' } });
  const uri = mongo.getUri('civic_next_smoke');
  client = await new MongoClient(uri, { promoteBuffers: true }).connect();
  const db = client.db();
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  // Production expects public HTTPS; HTTP here is the internal upstream connection.
  const origin = `https://localhost:${port}`;
  environmentDirectory = await mkdtemp(join(tmpdir(), 'civic-next-env-'));
  const environmentPath = join(environmentDirectory, 'web.env');
  await writeFile(environmentPath, `PORT=${port}\nNODE_ENV=development\n`, { mode: 0o600 });
  const webEnvironment: NodeJS.ProcessEnv = {
    ...process.env,
    NEXT_TELEMETRY_DISABLED: '1',
    MONGODB_URI: uri,
    APP_ORIGIN: origin,
    OPENAI_API_KEY: '',
    DEMO_ACCOUNTS: 'false',
    TRUST_PROXY_HOPS: '0',
    RETRIEVAL_MODE: 'exact',
    DOTENV_CONFIG_PATH: environmentPath,
  };
  // Exercise the actual production launcher, including .env PORT handling and
  // production cookie/CSP enforcement even when a local file says development.
  delete webEnvironment.PORT;
  // Next's ambient types mark NODE_ENV readonly; this is our own mutable copy.
  Reflect.deleteProperty(webEnvironment, 'NODE_ENV');
  web = spawn(process.execPath, ['scripts/start-next.mjs'], {
    cwd: process.cwd(),
    env: webEnvironment,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let launchError: Error | undefined;
  web.once('error', (error) => { launchError = error; });
  for (const stream of [web.stdout, web.stderr]) stream?.on('data', (chunk: Buffer) => {
    serverOutput = (serverOutput + chunk.toString()).slice(-12000);
  });
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (launchError) throw launchError;
    if (web.exitCode !== null) throw new Error('Next.js exited before becoming ready.');
    try {
      ready = (await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(2000) })).ok;
    } catch { /* The child may still be binding its port. */ }
    if (ready) break;
    await delay(250);
  }
  assert(ready, 'Next.js health endpoint did not become ready. Build the app first.');

  for (const path of ['/', '/following', '/mine', '/staff', '/report', `/complaints/${randomUUID()}`]) {
    const page = await fetch(`${base}${path}`);
    assert.equal(page.status, 200, `${path} must support direct navigation`);
    const html = await page.text();
    assert(html.includes('Civic Desk'), `${path} must render application metadata`);
    const policy = page.headers.get('content-security-policy') ?? '';
    const nonce = /'nonce-([^']+)'/.exec(policy)?.[1];
    assert(nonce, `${path} must receive a nonce CSP`);
    const scripts = html.match(/<script\b[^>]*>/g) ?? [];
    assert(scripts.length > 0, 'Next.js must emit bootstrap scripts');
    for (const script of scripts) assert(script.includes(`nonce="${nonce}"`), 'Bootstrap script nonce must match its response CSP');
    assert(!policy.includes("'unsafe-eval'"), 'Production CSP must not permit eval');
    if (path === '/') {
      const assets = [...html.matchAll(/(?:src|href)="(\/_next\/static\/[^\"]+)"/g)].map((match) => match[1]);
      assert(assets.some((asset) => asset.includes('.js')), 'Next.js JS assets must be linked');
      assert(assets.some((asset) => asset.includes('.css')), 'Next.js styles must be linked');
      for (const asset of new Set(assets)) {
        assert.equal((await fetch(`${base}${asset.replaceAll('&amp;', '&')}`)).status, 200, 'Built assets must be served');
      }
    }
  }
  assert.equal((await fetch(`${base}/charminar.svg`)).status, 200);
  assert.equal((await fetch(`${base}/missing-smoke-page`)).status, 404);
  console.log('PASS Next.js production pages, deep links, assets and matching script nonces');

  const headers = { 'X-Civic-Request': '1', Origin: origin };
  async function call(path: string, options: RequestInit = {}, cookie?: string) {
    const response = await fetch(`${base}/api${path}`, {
      ...options,
      headers: { ...headers, ...(cookie ? { Cookie: cookie } : {}), ...options.headers },
      signal: AbortSignal.timeout(15000),
    });
    assert(response.headers.get('cache-control')?.includes('no-store'), 'API responses must not be cached');
    return response;
  }
  const jsonBody = (value: unknown): RequestInit => ({
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value),
  });
  const apiRoot = await call('');
  assert.equal(apiRoot.status, 401);
  assert(apiRoot.headers.get('content-type')?.includes('application/json'), 'Bare /api must use the native handler');
  const headRoot = await call('', { method: 'HEAD' });
  assert.equal(headRoot.status, 401);
  assert.equal(await headRoot.text(), '');
  assert.equal((await call('/complaints')).status, 401);
  assert.equal((await fetch(`${base}/api/auth/register`, jsonBody({}))).status, 403);
  const password = `smoke-${randomUUID()}`;
  const residentInvitation = await issueInvitation(db, 'resident@smoke.example');
  const registration = await call('/auth/register', jsonBody({ email: 'resident@smoke.example', name: 'Synthetic resident', password, invitation: residentInvitation }));
  assert.equal(registration.status, 202);
  assert.equal(registration.headers.getSetCookie().length, 0);
  const resident = await call('/auth/login', jsonBody({ email: 'resident@smoke.example', password }));
  assert.equal(resident.status, 200);
  const cookieHeader = resident.headers.getSetCookie()[0];
  assert(cookieHeader?.includes('HttpOnly') && cookieHeader.includes('SameSite=Strict') && cookieHeader.includes('Secure'));
  const residentCookie = cookieHeader.split(';')[0];
  const residentId = (await resident.json()).id as string;
  const staffInvitation = await issueInvitation(db, 'staff@smoke.example');
  assert.equal((await call('/auth/register', jsonBody({ email: 'staff@smoke.example', name: 'Synthetic staff', password, invitation: staffInvitation }))).status, 202);
  const staff = await call('/auth/login', jsonBody({ email: 'staff@smoke.example', password }));
  assert.equal(staff.status, 200);
  const staffCookie = staff.headers.getSetCookie()[0].split(';')[0];
  await db.collection('users').updateOne({ email: 'staff@smoke.example' }, { $set: { role: 'staff' } });
  assert.equal((await call('/auth/me', {}, residentCookie)).status, 200);
  assert.equal((await call('/auth/login', jsonBody({ email: 'resident@smoke.example', password: 'incorrect-password' }))).status, 401);

  const original = {
    notes: 'Synthetic smoke report: pothole beside the demonstration library.',
    location: { label: 'Synthetic Hyderabad location', area: 'central', precision: 'exact', lat: 17.385, lng: 78.4867, assetId: '' },
    observedAt: null,
  };
  const content = { title: 'Synthetic library pothole', description: original.notes, category: 'roads' };
  assert.equal((await call('/drafts', jsonBody(original), residentCookie)).status, 503);
  const idempotencyKey = randomUUID();
  const submission = () => call('/complaints', {
    ...jsonBody({ original, content }),
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
  }, residentCookie);
  const created = await submission();
  assert.equal(created.status, 201);
  const complaint = await created.json();
  const retry = await submission();
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).id, complaint.id);
  const duplicates = await call('/duplicates', jsonBody({ original, content }), residentCookie);
  assert.equal(duplicates.status, 200);
  assert.equal((await call(`/complaints/${complaint.id}/status`, jsonBody({ status: 'under review', version: 1, note: 'Synthetic review started' }), residentCookie)).status, 403);
  const changed = await call(`/complaints/${complaint.id}/status`, jsonBody({ status: 'under review', version: 1, note: 'Synthetic review started' }), staffCookie);
  assert.equal(changed.status, 200);
  const updated = await changed.json();
  assert.equal(updated.version, 2);
  assert.equal(updated.timeline.length, 2);
  assert.equal((await call(`/complaints/${complaint.id}/status`, jsonBody({ status: 'under review', version: 1, note: 'Synthetic stale update' }), staffCookie)).status, 409);
  assert.equal((await call(`/complaints/${complaint.id}/follow`, { method: 'PUT' }, residentCookie)).status, 200);
  assert.equal((await (await call('/complaints?scope=following', {}, residentCookie)).json()).total, 1);

  const photoBytes = await sharp({ create: { width: 4, height: 4, channels: 3, background: 'green' } }).png().toBuffer();
  const form = new FormData();
  form.append('photo', new File([photoBytes], 'synthetic.png', { type: 'image/png' }));
  const upload = await call('/uploads', { method: 'POST', body: form }, residentCookie);
  assert.equal(upload.status, 201);
  const photoId = (await upload.json()).id;
  const image = await call(`/uploads/${photoId}`, {}, residentCookie);
  assert.equal(image.status, 200);
  assert.equal(image.headers.get('content-type'), 'image/jpeg');
  assert.equal((await sharp(Buffer.from(await image.arrayBuffer())).metadata()).format, 'jpeg');
  const savedSession = await db.collection('sessions').findOne({ userId: residentId });
  assert(savedSession && String(savedSession._id) !== residentCookie.slice('session='.length), 'Only the session hash may be stored');
  const logout = await call('/auth/logout', { method: 'POST' }, residentCookie);
  assert.equal(logout.status, 204);
  assert(logout.headers.getSetCookie()[0].includes('Max-Age=0'));
  assert.equal((await call('/auth/me', {}, residentCookie)).status, 401);
  assert.equal(await db.collection('complaints').countDocuments(), 1);
  console.log('PASS actual Next.js auth, CSRF, manual fallback, idempotency, staff permissions, timeline, following, private photo normalization and logout');
  await stop(web);
  await assert.rejects(
    fetch(`${base}/api/health`, { signal: AbortSignal.timeout(2000) }),
    'Stopping the launcher must also stop the Next.js child server',
  );
  console.log('PASS production launcher .env PORT, production enforcement and graceful child shutdown');
  console.log('All smoke writes used an isolated temporary database; no AI provider calls were made.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Next.js smoke verification failed.');
  // The child has only synthetic configuration and no provider key; omit tokens
  // and request bodies from diagnostics nevertheless.
  if (serverOutput) console.error(serverOutput.replace(/session=[^\s;]+/g, 'session=[redacted]'));
  process.exitCode = 1;
} finally {
  await stop(web);
  await client?.close();
  await mongo?.stop();
  if (environmentDirectory) {
    await unlink(join(environmentDirectory, 'web.env')).catch(() => undefined);
    await rmdir(environmentDirectory).catch(() => undefined);
  }
}
