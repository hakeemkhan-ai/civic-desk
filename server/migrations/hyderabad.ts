import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { Db, UpdateFilter } from 'mongodb';
import { collections, type Complaint } from '../db.js';
import { contentHash } from '../complaints.js';
import { fixtureFields } from '../demo-fixtures.js';
import { MUNICIPALITY, DIRECTORY_VERSION, type TimelineEvent } from '../../shared/domain.js';
export async function migrateHyderabad(db: Db, beforeWrite: (records: Complaint[]) => Promise<void>) {
  const c = collections(db).complaints;
  const records = await c.find({ municipality: 'brookfield-demo' }).sort({ _id: 1 }).toArray();
  if (!records.length) return { migrated: 0, relocated: 0 };
  // The caller must durably snapshot the original documents before any mutation.
  await beforeWrite(records);
  let relocated = 0;
  for (const old of records) {
    const content = { ...old.content }, location = { ...old.location };
    const match = old.synthetic && /^seed-v1-([0-8])$/.exec(old.submissionKey);
    if (match) {
      const index = Number(match[1]), before = fixtureFields(index, true), after = fixtureFields(index);
      for (const key of ['title', 'description', 'category'] as const)
        if (old.content[key] === before.content[key]) Object.assign(content, { [key]: after.content[key] });
      // Treat a position as a unit: never combine an edited coordinate with a fixture coordinate.
      if (isDeepStrictEqual(old.location, before.location)) Object.assign(location, after.location);
    }
    const changed = !isDeepStrictEqual(content, old.content) || !isDeepStrictEqual(location, old.location);
    if (changed) relocated++;
    const at = new Date().toISOString();
    const event: TimelineEvent = { id: randomUUID(), at, kind: 'migration', actorRole: 'system', status: old.status,
      note: changed ? 'Synthetic demo updated to Hyderabad landmarks. Original submission and prior history retained; positions are illustrative.' : 'Demo service renamed to Hyderabad. Existing report content and position retained.',
      ...(changed ? { previousContent: old.content } : {}),
    };
    const update: UpdateFilter<Complaint> = {
      $set: { municipality: MUNICIPALITY, directoryVersion: DIRECTORY_VERSION, updatedAt: at,
        ...(changed ? { content, location, contentHash: contentHash(content), indexState: 'pending', indexAttempts: 0 } : {}),
      },
      $inc: { version: 1 }, $push: { timeline: event },
      ...(changed ? { $unset: { embedding: '', indexToken: '', indexLeaseUntil: '' } } : {}),
    };
    const result = await c.updateOne({ _id: old._id, municipality: 'brookfield-demo', version: old.version }, update);
    if (result.modifiedCount !== 1) throw new Error(`Concurrent change to ${old._id}; stop the API and rerun migration. Existing backups are retained.`);
  }
  return { migrated: records.length, relocated };
}
