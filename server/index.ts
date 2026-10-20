import { connect } from './db.js';
import { makeProvider } from './ai/provider.js';
import { AIService } from './ai/service.js';
import { startWorker } from './retrieval/worker.js';
import { assertRuntimeConfig } from './config.js';

// Next.js owns HTTP. This persistent process owns embedding work so jobs do not
// depend on a request remaining alive or a particular web instance receiving traffic.
assertRuntimeConfig();
const { db, client } = await connect();
const ai = new AIService(db, makeProvider());
const stop = startWorker(db, ai);
console.log(
  `Civic Desk embedding worker · ${ai.provider ? 'AI configured' : 'provider unavailable; jobs remain pending'}`,
);
let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  await stop();
  await client.close();
}
function onSignal() {
  shutdown().catch(() => {
    console.error('Embedding worker shutdown failed.');
    process.exitCode = 1;
  });
}
process.once('SIGINT', onSignal);
process.once('SIGTERM', onSignal);
