import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { request } from '@playwright/test';
import { resetFixture, verificationDatabase } from '../tests/browser/data.js';
import {
  cancellationScope,
  freePort,
  run,
  until,
  verifyBrowserEvidence,
} from './verification/process.js';

// Explicit project, file and env-file prevent Compose from discovering .env or normal compose.yaml.
const id = randomBytes(6).toString('hex');
const project = `civic-verify-${id}`;
const cancellation = cancellationScope();
let cleaningUp = false;
const image = `civic-verify:${id}`;
const directory = await mkdtemp(join(tmpdir(), `${project}-`));
const envFile = join(directory, 'compose.env');
const evidence: Record<string, unknown> = {
  project,
  startedAt: new Date().toISOString(),
  checks: [],
};
const passed = (name: string) => {
  (evidence.checks as string[]).push(name);
  console.log(`PASS ${name}`);
};
// Keep Docker's connection settings, but don't pass app secrets or Compose override settings.
const dockerEnv: NodeJS.ProcessEnv = {
  NODE_ENV: 'test',
  ...Object.fromEntries(
    Object.entries(process.env).filter(([key]) =>
      [
        'PATH',
        'HOME',
        'TMPDIR',
        'DOCKER_HOST',
        'DOCKER_CONTEXT',
        'DOCKER_CONFIG',
        'DOCKER_TLS_VERIFY',
        'DOCKER_CERT_PATH',
        'SSH_AUTH_SOCK',
      ].includes(key),
    ),
  ),
};
const docker = (args: string[], timeout = 120_000, quiet = true) =>
  run('docker', args, {
    env: dockerEnv,
    timeout,
    quiet,
    signal: cleaningUp ? undefined : cancellation.signal,
  });
const compose = (args: string[], timeout?: number, quiet?: boolean) =>
  docker(
    ['compose', '--env-file', envFile, '-p', project, '-f', 'compose.verify.yaml', ...args],
    timeout,
    quiet,
  );
const container = async (service: string) => {
  const value = await compose(['ps', '--all', '-q', service]);
  assert.match(value, /^[a-f0-9]+$/);
  return value;
};
const inspectState = async (service: string) =>
  JSON.parse(await docker(['inspect', '--format', '{{json .State}}', await container(service)]));
let created = false;
let api: Awaited<ReturnType<typeof request.newContext>> | undefined;
let mongoClient: ReturnType<typeof verificationDatabase> | undefined;
try {
  assert.equal(process.versions.node.split('.')[0], '24', 'Use Node 24, matching CI.');
  evidence.commit = await run('git', ['rev-parse', 'HEAD'], { quiet: true });
  await mkdir('.cache/browser-verification', { recursive: true });
  await writeFile('.cache/browser-verification/docker.json', JSON.stringify(evidence, null, 2));
  try {
    await docker(['info', '--format', '{{.ServerVersion}}']);
  } catch {
    throw new Error(
      'Docker daemon unavailable. Start Docker, then rerun verify:browser-docker; no container checks were skipped.',
    );
  }
  await docker(['compose', 'version']);
  const httpsPort = await freePort();
  const httpPort = await freePort();
  const mongoPort = await freePort();
  const origin = `https://localhost:${httpsPort}`;
  const uri = `mongodb://127.0.0.1:${mongoPort}/civic_verify_${id}`;
  process.env.VERIFY_MONGO_URI = uri;
  const writeEnvironment = (webPort: number) =>
    writeFile(
      envFile,
      [
        `VERIFY_IMAGE=${image}`,
        `VERIFY_DB=civic_verify_${id}`,
        `VERIFY_MONGO_PORT=${mongoPort}`,
        `VERIFY_HTTPS_PORT=${httpsPort}`,
        `VERIFY_HTTP_PORT=${httpPort}`,
        `VERIFY_WEB_PORT=${webPort}`,
        '',
      ].join('\n'),
      { mode: 0o600 },
    );
  await writeEnvironment(3001);
  await compose(['config', '--quiet']);
  created = true;
  await compose(['build', 'web'], 600_000, false);
  evidence.imageId = await docker(['image', 'inspect', '--format', '{{.Id}}', image]);
  await compose(
    ['up', '-d', '--wait', '--wait-timeout', '120', 'mongo', 'web', 'tls'],
    180_000,
    false,
  );
  api = await request.newContext({ baseURL: origin, ignoreHTTPSErrors: true, timeout: 15_000 });
  const healthy = async () => (await api!.get('/api/health').catch(() => null))?.ok() ?? false;
  await until(healthy, 'TLS proxy and default-port health');
  assert.equal((await api.get(`http://127.0.0.1:${httpPort}/api/health`)).status(), 200);
  assert.equal((await api.get('/charminar.svg')).status(), 200);
  const page = await api.get('/');
  assert.equal(page.status(), 200);
  const html = await page.text();
  const asset = /(?:src|href)="(\/_next\/static\/[^"?]+\.js[^"\s]*)"/.exec(html)?.[1];
  assert(asset, 'Built JavaScript asset must be linked');
  assert.equal((await api.get(asset.replaceAll('&amp;', '&'))).status(), 200);
  const webId = await container('web');
  assert.equal(await docker(['inspect', '--format', '{{json .Mounts}}', webId]), '[]');
  await compose([
    'exec',
    '-T',
    'web',
    'node',
    '--input-type=module',
    '-e',
    `
    import assert from 'node:assert/strict';
    import { existsSync } from 'node:fs';
    assert.equal(process.versions.node.split('.')[0], '24');
    assert.notEqual(process.getuid(), 0);
    for (const name of ['next', 'sharp', 'mongodb', 'tsx']) await import(name);
    assert(!existsSync('/app/.env'));
    assert(!existsSync('/app/.git'));
    assert(!existsSync('/app/node_modules/vitest'));
  `,
  ]);
  passed(
    'actual runtime image: Node 24, non-root, production dependencies/assets, no source mounts or local secrets, default port',
  );
  const data = await resetFixture();
  const headers = { 'X-Civic-Request': '1', Origin: origin };
  assert.equal(
    (
      await api.post('/api/auth/login', {
        headers,
        data: {
          email: data.users[0].email,
          password: data.password,
        },
      })
    ).status(),
    200,
  );
  assert.equal(
    (await api.put(`/api/complaints/${data.report._id}/follow`, { headers })).status(),
    200,
  );
  const before = await (await api.get(`/api/complaints/${data.report._id}`)).json();
  const photoBefore = await (await api.get(`/api/uploads/${data.photoId}`)).body();
  const assertPersisted = async () => {
    assert.equal((await api!.get('/api/auth/me')).status(), 200, 'Account/session must persist');
    assert.deepEqual(await (await api!.get(`/api/complaints/${data.report._id}`)).json(), before);
    assert.deepEqual(await (await api!.get(`/api/uploads/${data.photoId}`)).body(), photoBefore);
  };
  await compose(['up', '-d', '--no-deps', '--force-recreate', '--wait', 'web'], 120_000);
  // Caddy re-resolves web's DNS when its upstream connection is recreated.
  await until(healthy, 'web recreation');
  await assertPersisted();
  await compose(['restart', 'mongo']);
  await until(healthy, 'database restart');
  await assertPersisted();
  passed(
    'report, photo bytes, account/session, following and history persist across web recreation and Mongo restart',
  );
  await compose(['stop', 'mongo']);
  await until(
    async () => (await inspectState('web')).Health.Status === 'unhealthy',
    'unhealthy state during database outage',
    90_000,
  );
  assert.equal(await healthy(), false);
  await compose(['start', 'mongo']);
  await until(
    async () => (await inspectState('web')).Health.Status === 'healthy',
    'health recovery after database outage',
    90_000,
  );
  await assertPersisted();
  passed('database outage marks web unhealthy and recovers without a web restart');
  await compose(['stop', '-t', '15', 'web']);
  const stopped = await inspectState('web');
  assert.equal(stopped.Running, false);
  assert.equal(stopped.Pid, 0);
  assert.equal(stopped.OOMKilled, false);
  assert([0, 143].includes(stopped.ExitCode), 'Web must handle SIGTERM without SIGKILL');
  assert.equal(await healthy(), false, 'No orphan HTTP server may remain after shutdown');
  passed('web SIGTERM exits without SIGKILL, OOM or orphan HTTP listener');
  await writeEnvironment(4011);
  await compose(['up', '-d', '--no-deps', '--force-recreate', '--wait', 'web', 'tls'], 120_000);
  await until(healthy, 'overridden port');
  assert.equal(await compose(['exec', '-T', 'web', 'node', '-p', 'process.env.PORT']), '4011');
  passed('PORT override serves production HTTP and passes the inherited image health command');
  mongoClient = await verificationDatabase().connect();
  const db = mongoClient.db();
  const pendingBefore = await db.collection('complaints').find({}).toArray();
  const aiRunsBefore = await db.collection('aiRuns').countDocuments();
  await compose(['--profile', 'worker', 'up', '-d', '--no-deps', 'worker']);
  await until(
    async () =>
      (await compose(['logs', '--no-color', 'worker'])).includes(
        'provider unavailable; jobs remain pending',
      ),
    'AI-disabled worker startup',
  );
  await delay(6500); // More than one real worker polling interval.
  assert.deepEqual(await db.collection('complaints').find({}).toArray(), pendingBefore);
  assert.equal(await db.collection('aiRuns').countDocuments(), aiRunsBefore);
  assert.equal((await inspectState('worker')).Running, true);
  assert.equal(
    (await inspectState('worker')).Health,
    undefined,
    'Worker must not inherit an HTTP health check',
  );
  await compose(['stop', '-t', '15', 'worker']);
  const workerState = await inspectState('worker');
  assert.equal(workerState.ExitCode, 0);
  assert.equal(workerState.Pid, 0);
  passed(
    'same-image direct-Node worker starts, leaves jobs pending without AI, and drains shutdown cleanly (active-job drain covered by unit test)',
  );
  await mongoClient.close();
  mongoClient = undefined;
  // Browser fixtures reset only this disposable database; authentication stays below production limits.
  await run(
    process.execPath,
    [
      'node_modules/@playwright/test/cli.js',
      'test',
      '--config',
      'tests/browser/playwright.config.ts',
      ...process.argv.slice(2),
    ],
    {
      env: { ...process.env, VERIFY_BASE_URL: origin, VERIFY_MONGO_URI: uri, OPENAI_API_KEY: '' },
      timeout: 780_000,
      signal: cancellation.signal,
    },
  );
  await verifyBrowserEvidence();
  passed(
    'Chromium browser scenarios against the production Docker image over HTTPS, with HTML/JSON evidence',
  );
  evidence.result = 'passed';
} catch (error) {
  evidence.result = 'failed';
  evidence.error = error instanceof Error ? error.message : String(error);
  console.error(evidence.error);
  process.exitCode = 1;
} finally {
  cleaningUp = true;
  const connections = await Promise.allSettled([api?.dispose(), mongoClient?.close()]);
  for (const connection of connections) {
    if (connection.status === 'rejected') {
      evidence.connectionCleanupError = String(connection.reason);
      process.exitCode = 1;
    }
  }
  await mkdir('.cache/browser-verification', { recursive: true });
  if (created) {
    try {
      await compose(
        ['--profile', 'worker', 'down', '--volumes', '--remove-orphans'],
        120_000,
        false,
      );
    } catch (error) {
      evidence.cleanupError = String(error);
      process.exitCode = 1;
    }
    try {
      await docker(['image', 'rm', image]);
    } catch (error) {
      evidence.imageCleanupError = String(error);
      process.exitCode = 1;
    }
  }
  evidence.finishedAt = new Date().toISOString();
  if (evidence.cleanupError || evidence.imageCleanupError || evidence.connectionCleanupError) {
    evidence.result = 'failed';
  }
  await writeFile('.cache/browser-verification/docker.json', JSON.stringify(evidence, null, 2));
  await rm(directory, { recursive: true, force: true });
  cancellation.close();
}
