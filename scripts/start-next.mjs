import 'dotenv/config';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

// Load .env before choosing the port; exported deployment values take precedence.
const require = createRequire(import.meta.url);
const packagePath = require.resolve('next/package.json');
const nextPackage = JSON.parse(readFileSync(packagePath, 'utf8'));
const cli = resolve(
  dirname(packagePath),
  typeof nextPackage.bin === 'string' ? nextPackage.bin : nextPackage.bin.next,
);
const child = spawn(process.execPath, [
  cli,
  'start',
  '--hostname',
  '0.0.0.0',
  '--port',
  process.env.PORT || '3001',
], {
  stdio: 'inherit',
  // npm start always serves the production build, including when the local .env
  // is also used by development and contains NODE_ENV=development.
  env: { ...process.env, NODE_ENV: 'production' },
});

const interrupt = () => child.kill('SIGINT');
const terminate = () => child.kill('SIGTERM');
process.on('SIGINT', interrupt);
process.on('SIGTERM', terminate);
function clearHandlers() {
  process.off('SIGINT', interrupt);
  process.off('SIGTERM', terminate);
}
child.once('error', (error) => {
  clearHandlers();
  console.error('Could not start Next.js:', error.message);
  process.exitCode = 1;
});
child.once('exit', (code, signal) => {
  clearHandlers();
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
