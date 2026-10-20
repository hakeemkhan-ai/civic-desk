import { randomUUID } from 'node:crypto';
import type { Db } from 'mongodb';
import { collections } from '../db.js';
import { embeddingText } from '../complaints.js';
import { config } from '../config.js';
import type { AIService } from '../ai/service.js';
import { EMBEDDING_VERSION } from './service.js';
export async function indexOne(db: Db, ai: AIService) {
  if (!ai.provider) return false;
  const c = collections(db).complaints,
    token = randomUUID();
  await c.updateMany(
    { indexState: 'processing', indexAttempts: { $gte: 3 }, indexLeaseUntil: { $lt: new Date() } },
    { $set: { indexState: 'failed' }, $unset: { indexToken: '', indexLeaseUntil: '' } },
  );
  const job = await c.findOneAndUpdate(
    {
      indexAttempts: { $lt: 3 },
      $or: [
        { indexState: 'pending' },
        { indexState: 'processing', indexLeaseUntil: { $lt: new Date() } },
      ],
    },
    {
      $set: {
        indexState: 'processing',
        indexToken: token,
        indexLeaseUntil: new Date(Date.now() + Math.max(config.AI_TIMEOUT_MS * 4, 120000)),
      },
      $inc: { indexAttempts: 1 },
    },
    { returnDocument: 'after' },
  );
  if (!job) return false;
  try {
    const vector = await ai.embed(embeddingText(job.content));
    await c.updateOne(
      { _id: job._id, contentHash: job.contentHash, indexToken: token },
      {
        $set: {
          embedding: {
            vector,
            hash: job.contentHash,
            model: config.EMBEDDING_MODEL,
            version: EMBEDDING_VERSION,
            dimensions: config.EMBEDDING_DIMENSIONS,
          },
          indexState: 'ready',
        },
        $unset: { indexLeaseUntil: '', indexToken: '' },
      },
    );
  } catch {
    await c.updateOne(
      { _id: job._id, contentHash: job.contentHash, indexToken: token },
      {
        $set: { indexState: job.indexAttempts >= 3 ? 'failed' : 'pending' },
        $unset: { indexLeaseUntil: '', indexToken: '' },
      },
    );
  }
  return true;
}
export function startWorker(db: Db, ai: AIService) {
  let active: Promise<void> | null = null;
  const timer = setInterval(() => {
    if (active) return;
    active = (async () => {
      try {
        await indexOne(db, ai);
      } catch {
        console.error('Embedding worker operation failed; retry on next interval.');
      } finally {
        active = null;
      }
    })();
  }, 5000);
  return async () => {
    clearInterval(timer);
    await active;
  };
}
