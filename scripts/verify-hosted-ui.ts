import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'dotenv';
import { cancellationScope, run } from './verification/process.js';

// Explicit file only; never auto-load the local development .env or save hosted artifacts.
const args = process.argv.slice(2);
const fileIndex = args.indexOf('--env-file');
const credentials = fileIndex >= 0 ? parse(await readFile(args[fileIndex + 1])) : {};
if (fileIndex >= 0) args.splice(fileIndex, 2);
const directory = await mkdtemp(join(tmpdir(), 'civic-hosted-ui-'));
const cancellation = cancellationScope();
try {
  await run(
    process.execPath,
    [
      'node_modules/@playwright/test/cli.js',
      'test',
      '--config',
      'tests/browser/hosted.config.ts',
      ...args,
    ],
    {
      env: { ...process.env, ...credentials, VERIFY_HOSTED_OUTPUT: directory },
      timeout: 450_000,
      signal: cancellation.signal,
    },
  );
  console.log(
    'PASS hosted read-only UI checks; no screenshots, video, traces or reports retained.',
  );
} catch {
  console.error('Hosted UI verification failed. Private temporary results have been removed.');
  process.exitCode = 1;
} finally {
  await rm(directory, { recursive: true, force: true });
  cancellation.close();
}
