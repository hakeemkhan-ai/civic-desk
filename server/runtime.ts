import { MongoClient } from 'mongodb';
import { config, assertRuntimeConfig } from './config.js';
import { initialize } from './db.js';
import { createApi } from './app.js';

async function connectDatabase() {
  const client = new MongoClient(config.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
    promoteBuffers: true,
  });
  try {
    await client.connect();
    const db = client.db();
    await initialize(db);
    return { client, db };
  } catch (error) {
    await client.close().catch(() => undefined);
    throw error;
  }
}

type Connection = Awaited<ReturnType<typeof connectDatabase>>;
export type Runtime = Connection & ReturnType<typeof createApi>;
const cache = globalThis as typeof globalThis & { civicDeskConnection?: Promise<Connection> };
let runtime: Promise<Runtime> | undefined;

function getConnection(): Promise<Connection> {
  if (!cache.civicDeskConnection) {
    const pending = connectDatabase();
    cache.civicDeskConnection = pending;
    void pending.catch(() => {
      if (cache.civicDeskConnection === pending) delete cache.civicDeskConnection;
    });
  }
  return cache.civicDeskConnection;
}

async function initializeRuntime(): Promise<Runtime> {
  assertRuntimeConfig();
  const connection = await getConnection();
  return { ...connection, ...createApi(connection.db) };
}

// Only the MongoDB connection survives Next development reloads. API closures
// belong to this module so changes to routes and services take effect after HMR.
// Concurrent requests still share both connection and API initialization.
export function getRuntime(): Promise<Runtime> {
  if (!runtime) {
    const pending = initializeRuntime();
    runtime = pending;
    void pending.catch(() => {
      if (runtime === pending) runtime = undefined;
    });
  }
  return runtime;
}
