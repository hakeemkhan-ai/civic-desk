import { connect } from './db.js';
import { createApp } from './app.js';
import { config } from './config.js';
import { startWorker } from './retrieval/worker.js';
const { db, client } = await connect();
const { app, ai } = createApp(db);
const server = app.listen(config.PORT, '0.0.0.0', () =>
  console.log(
    `Civic Desk API http://localhost:${config.PORT} · ${ai.provider ? 'AI configured' : 'manual / keyword mode'}`,
  ),
);
server.requestTimeout = 60000;
const stop = startWorker(db, ai);
async function shutdown() {
  stop();
  server.close();
  await client.close();
  process.exit(0);
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
