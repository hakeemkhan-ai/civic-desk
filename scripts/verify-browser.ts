// Portable production browser check when Docker is unavailable. This does not verify the image.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer as createHTTPS } from 'node:https';
import { request as upstreamRequest } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  cancellationScope,
  freePort,
  run,
  stop,
  until,
  verifyBrowserEvidence,
} from './verification/process.js';

const directory = await mkdtemp(join(tmpdir(), 'civic-browser-'));
const cancellation = cancellationScope();
let mongo: MongoMemoryServer | undefined;
let web: ChildProcess | undefined;
let tls: ReturnType<typeof createHTTPS> | undefined;
try {
  assert.equal(process.versions.node.split('.')[0], '24', 'Use Node 24, matching CI.');
  await run(process.execPath, ['node_modules/next/dist/bin/next', 'build', '--webpack'], {
    env: { ...process.env, OPENAI_API_KEY: '', NEXT_TELEMETRY_DISABLED: '1' },
    timeout: 300_000,
    signal: cancellation.signal,
  });
  mongo = await MongoMemoryServer.create({ binary: { version: '7.0.24' } });
  const uri = mongo.getUri(`civic_verify_${randomBytes(6).toString('hex')}`);
  const port = await freePort();
  const tlsPort = await freePort();
  const origin = `https://localhost:${tlsPort}`;
  const dotenv = join(directory, 'empty.env');
  await writeFile(dotenv, '', { mode: 0o600 });
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(port),
    APP_ORIGIN: origin,
    MONGODB_URI: uri,
    OPENAI_API_KEY: '',
    DEMO_ACCOUNTS: 'false',
    RETRIEVAL_MODE: 'exact',
    TRUST_PROXY_HOPS: '0',
    DOTENV_CONFIG_PATH: dotenv,
    NEXT_TELEMETRY_DISABLED: '1',
  };
  web = spawn(process.execPath, ['scripts/start-next.mjs'], { env, stdio: 'inherit' });
  let launchError: Error | undefined;
  web.once('error', (error) => {
    launchError = error;
  });
  await until(async () => {
    cancellation.signal.throwIfAborted();
    if (launchError) throw launchError;
    if (web!.exitCode !== null) throw new Error('Production server exited before readiness.');
    return fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(2000) })
      .then((r) => r.ok)
      .catch(() => false);
  }, 'production server');
  await run(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-days',
      '1',
      '-subj',
      '/CN=localhost',
      '-addext',
      'subjectAltName=DNS:localhost',
      '-keyout',
      join(directory, 'key.pem'),
      '-out',
      join(directory, 'cert.pem'),
    ],
    { quiet: true, signal: cancellation.signal },
  );
  tls = createHTTPS(
    {
      key: await readFile(join(directory, 'key.pem')),
      cert: await readFile(join(directory, 'cert.pem')),
    },
    (req, res) => {
      const upstream = upstreamRequest(
        {
          hostname: '127.0.0.1',
          port,
          method: req.method,
          path: req.url,
          headers: req.headers,
        },
        (response) => {
          res.writeHead(response.statusCode ?? 502, response.headers);
          response.pipe(res);
        },
      );
      upstream.on('error', () => {
        res.writeHead(502);
        res.end();
      });
      req.pipe(upstream);
    },
  );
  await new Promise<void>((resolve, reject) => {
    tls!.once('error', reject);
    tls!.listen(tlsPort, '127.0.0.1', resolve);
  });
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
      env: { ...env, VERIFY_BASE_URL: origin, VERIFY_MONGO_URI: uri },
      timeout: 780_000,
      signal: cancellation.signal,
    },
  );
  await verifyBrowserEvidence();
  console.log(
    'PASS isolated production browser suite. Docker execution and manual review remain separate.',
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  tls?.closeAllConnections();
  if (tls) await new Promise<void>((resolve) => tls!.close(() => resolve()));
  try {
    await stop(web);
  } finally {
    await mongo?.stop();
    await rm(directory, { recursive: true, force: true });
    cancellation.close();
  }
}
