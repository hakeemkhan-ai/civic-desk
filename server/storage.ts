import type { Db } from 'mongodb';
import { collections } from './db.js';
import { HttpError } from './http.js';

export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
export const MAX_UPLOAD_COUNT = 100;
export const MAX_FEEDBACK_COUNT = 500;
export const MAX_COMPLAINT_FEEDBACK = 100;

// Lifetime quotas are conservative: expired/failed uploads do not refund capacity.
// Initializing once includes legacy data without deleting or rewriting attachments.
export async function reserveUpload(db: Db, ownerId: string, bytes: number) {
  const c = collections(db);
  const user = await c.users.findOne({ _id: ownerId });
  if (user?.uploadBytes === undefined) {
    const [usage] = await c.uploads.aggregate<{ bytes: number; count: number }>([
      { $match: { ownerId } },
      { $group: { _id: null, bytes: { $sum: { $binarySize: '$data' } }, count: { $sum: 1 } } },
    ]).toArray();
    await c.users.updateOne({ _id: ownerId, uploadBytes: { $exists: false } }, {
      $set: { uploadBytes: usage?.bytes ?? 0, uploadCount: usage?.count ?? 0 },
    });
  }
  const reserved = await c.users.updateOne({
    _id: ownerId,
    uploadBytes: { $lte: MAX_UPLOAD_BYTES - bytes },
    uploadCount: { $lt: MAX_UPLOAD_COUNT },
  }, { $inc: { uploadBytes: bytes, uploadCount: 1 } });
  if (!reserved.modifiedCount)
    throw new HttpError(429, 'This account has reached its photo storage allowance. Contact the maintainer.');
}

export async function reserveFeedback(db: Db, ownerId: string) {
  const c = collections(db);
  const user = await c.users.findOne({ _id: ownerId });
  if (user?.feedbackCount === undefined) {
    const count = await db.collection('feedback').countDocuments({ ownerId });
    await c.users.updateOne({ _id: ownerId, feedbackCount: { $exists: false } }, {
      $set: { feedbackCount: count },
    });
  }
  const reserved = await c.users.updateOne({
    _id: ownerId, feedbackCount: { $lt: MAX_FEEDBACK_COUNT },
  }, { $inc: { feedbackCount: 1 } });
  if (!reserved.modifiedCount) throw new HttpError(429, 'This account has reached its feedback allowance.');
}
