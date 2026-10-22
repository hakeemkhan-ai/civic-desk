import type { Db } from 'mongodb';
import { createHash } from 'node:crypto';
import { HttpError } from './http.js';

export const identityHash = (...parts: string[]) =>
  createHash('sha256').update(JSON.stringify(parts)).digest('hex');

// Atomic, expiring counters shared by every web process. No credentials are stored.
export class DatabaseLimiter {
  constructor(
    private db: Db,
    private scope: string,
    private windowMs: number,
    private limit: number,
    private message: string,
  ) {}

  async check(identity: string): Promise<void> {
    const now = new Date();
    const _id = `${this.scope}:${identityHash(identity)}`;
    const counters = this.db.collection<{
      _id: string;
      count: number;
      expiresAt: Date;
    }>('rateLimits');
    const expired = { $lte: [{ $ifNull: ['$expiresAt', new Date(0)] }, now] };
    const update = [{
      $set: {
        count: { $cond: [expired, 1, { $add: ['$count', 1] }] },
        expiresAt: { $cond: [expired, new Date(now.getTime() + this.windowMs), '$expiresAt'] },
      },
    }];
    let bucket;
    try {
      bucket = await counters.findOneAndUpdate({ _id }, update, {
        upsert: true, returnDocument: 'after',
      });
    } catch (error) {
      // Concurrent first requests can race to insert the same counter.
      if ((error as { code?: number }).code !== 11000) throw error;
      bucket = await counters.findOneAndUpdate({ _id }, update, { returnDocument: 'after' });
    }
    if (!bucket) throw new Error('Rate limit counter unavailable');
    if (bucket.count > this.limit) {
      throw new HttpError(429, this.message, {
        'Retry-After': String(Math.max(1, Math.ceil((bucket.expiresAt.getTime() - now.getTime()) / 1000))),
      });
    }
  }
}
