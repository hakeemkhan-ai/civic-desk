import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

export async function freePort() {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  return port;
}

export async function run(
  command: string,
  args: string[],
  options: {
    env?: NodeJS.ProcessEnv;
    timeout?: number;
    quiet?: boolean;
    signal?: AbortSignal;
  } = {},
) {
  options.signal?.throwIfAborted();
  const child = spawn(command, args, {
    env: options.env ?? process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  for (const stream of [child.stdout, child.stderr])
    stream.on('data', (data: Buffer) => {
      output = (output + data.toString()).slice(-100_000);
      if (!options.quiet) process.stdout.write(data);
    });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill('SIGTERM');
  }, options.timeout ?? 120_000);
  const force = setTimeout(() => child.kill('SIGKILL'), (options.timeout ?? 120_000) + 10_000);
  let abortForce: ReturnType<typeof setTimeout> | undefined;
  const abort = () => {
    child.kill('SIGTERM');
    abortForce = setTimeout(() => child.kill('SIGKILL'), 10_000);
  };
  options.signal?.addEventListener('abort', abort, { once: true });
  try {
    await new Promise<void>((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => {
        if (options.signal?.aborted) return reject(options.signal.reason);
        if (timedOut) return reject(new Error(`${command} timed out.`));
        if (code === 0) resolve();
        else
          reject(
            new Error(
              `${command} failed (${signal ?? code}).${options.quiet ? `\n${output}` : ''}`,
            ),
          );
      });
    });
    return output.trim();
  } finally {
    clearTimeout(timer);
    clearTimeout(force);
    clearTimeout(abortForce);
    options.signal?.removeEventListener('abort', abort);
  }
}

export function cancellationScope() {
  const controller = new AbortController();
  const cancel = () =>
    controller.abort(new Error('Verification interrupted; cleaning up its resources.'));
  process.once('SIGINT', cancel);
  process.once('SIGTERM', cancel);
  return {
    signal: controller.signal,
    close() {
      process.off('SIGINT', cancel);
      process.off('SIGTERM', cancel);
    },
  };
}

export async function until(check: () => Promise<boolean>, description: string, timeout = 60_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return;
    await delay(500);
  }
  throw new Error(`Timed out waiting for ${description}.`);
}

export async function stop(child: ChildProcess | undefined) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const done = new Promise<void>((resolve) => child.once('exit', () => resolve()));
  child.kill('SIGTERM');
  let forced = false;
  const timer = setTimeout(() => {
    forced = true;
    child.kill('SIGKILL');
  }, 15_000);
  try {
    await done;
    if (forced) throw new Error('Verification child required SIGKILL during cleanup.');
  } finally {
    clearTimeout(timer);
  }
}

export async function verifyBrowserEvidence() {
  const report = JSON.parse(await readFile('.cache/browser-verification/browser.json', 'utf8'));
  assert(report.stats.expected > 0, 'Browser evidence must contain executed passing scenarios.');
  for (const key of ['unexpected', 'skipped', 'flaky']) assert.equal(report.stats[key], 0);
  assert.equal(report.errors.length, 0);
  await access('.cache/browser-verification/report/index.html');
}
