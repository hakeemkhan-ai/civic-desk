import { connect, collections } from '../server/db.js';
import { config } from '../server/config.js';
import { EMBEDDING_VERSION } from '../server/retrieval/service.js';
const { db, client } = await connect();
try {
  const r = await collections(db).complaints.updateMany(
    {
      $or: [
        { indexState: 'failed' },
        { 'embedding.model': { $ne: config.EMBEDDING_MODEL } },
        { 'embedding.version': { $ne: EMBEDDING_VERSION } },
        { 'embedding.dimensions': { $ne: config.EMBEDDING_DIMENSIONS } },
      ],
    },
    {
      $set: { indexState: 'pending', indexAttempts: 0 },
      $unset: { embedding: '', indexLeaseUntil: '', indexToken: '' },
    },
  );
  console.log(
    `Queued ${r.modifiedCount} reports. The API worker will process them when AI is configured.`,
  );
} finally {
  await client.close();
}
