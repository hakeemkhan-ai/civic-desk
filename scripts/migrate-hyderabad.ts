import 'dotenv/config';
import { mkdir, open } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { BSON } from 'mongodb';
import { connect } from '../server/db.js';
import { migrateHyderabad } from '../server/migrations/hyderabad.js';
if (process.env.NODE_ENV === 'production' || process.env.DEMO_ACCOUNTS !== 'true')
  throw new Error('Migration requires non-production mode and DEMO_ACCOUNTS=true');
const { db, client } = await connect();
try {
  const result = await migrateHyderabad(db, async records => {
    const dir = resolve('.data/backups'); await mkdir(dir, { recursive: true });
    const path = resolve(dir, `hyderabad-${Date.now()}-${randomUUID()}.ejson`);
    const file = await open(path, 'wx', 0o600);
    try { await file.writeFile(BSON.EJSON.stringify(records, { relaxed: false })); await file.sync(); } finally { await file.close(); }
    console.log(`Pre-migration backup: ${path}`);
  });
  console.log(result);
} finally { await client.close(); }
