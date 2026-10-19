import { MongoMemoryServer } from 'mongodb-memory-server';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assertLocalPortAvailable } from './local-port.js';
// Despite the package name, this launches an actual mongod using persistent WiredTiger storage.
if (process.env.NODE_ENV === 'production')
  throw new Error('Development MongoDB helper is disabled in production');
const dbPath = resolve('.data/mongo');
try {
  await assertLocalPortAvailable(27017);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Database port check failed.');
  process.exit(1);
}
await mkdir(dbPath, { recursive: true });
const mongo = await MongoMemoryServer.create({
  instance: {
    port: 27017,
    portGeneration: false,
    ip: '127.0.0.1',
    dbPath,
    storageEngine: 'wiredTiger',
  },
  binary: { version: '7.0.24', downloadDir: resolve('.cache/mongodb') },
});
console.log('Persistent development MongoDB: mongodb://127.0.0.1:27017/civic_desk');
console.log(`Data directory: ${dbPath}`);
async function stop() {
  await mongo.stop({ doCleanup: false, force: false });
  process.exit(0);
}
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
