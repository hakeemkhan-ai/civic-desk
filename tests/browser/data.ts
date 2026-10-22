import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { MongoClient } from 'mongodb';
import sharp from 'sharp';
import { newComplaint } from '../../server/complaints.js';
import type { Complaint, User } from '../../server/db.js';
import { issueInvitation } from '../../server/invitations.js';

export function verificationDatabase(uri = process.env.VERIFY_MONGO_URI) {
  if (!uri) throw new Error('Missing isolated verification MongoDB URI.');
  const url = new URL(uri);
  if (
    url.protocol !== 'mongodb:' ||
    url.hostname !== '127.0.0.1' ||
    !/^\/civic_verify_[a-f0-9]{12}$/.test(url.pathname) ||
    url.username ||
    url.password ||
    url.search
  )
    throw new Error('Verification requires a unique civic_verify database on loopback MongoDB.');
  return new MongoClient(uri, { promoteBuffers: true, serverSelectionTimeoutMS: 5000 });
}

export async function resetFixture() {
  const client = await verificationDatabase().connect();
  try {
    const db = client.db();
    // Preserve runtime indexes. Never drop a user-selected/local/Atlas database.
    for (const name of [
      'users',
      'complaints',
      'sessions',
      'uploads',
      'drafts',
      'feedback',
      'aiRuns',
      'invitations',
      'rateLimits',
    ]) {
      await db.collection(name).deleteMany({});
    }
    const password = `synthetic-${randomUUID()}`;
    const passwordHash = await bcrypt.hash(password, 10);
    const users: User[] = (['resident', 'staff', 'other'] as const).map((key) => ({
      _id: randomUUID(),
      email: `${key}@browser.example`,
      name: `Synthetic ${key}`,
      passwordHash,
      role: key === 'staff' ? 'staff' : 'resident',
    }));
    await db.collection<User>('users').insertMany(users);
    const image = await sharp({
      create: { width: 40, height: 30, channels: 3, background: '#227766' },
    })
      .png()
      .toBuffer();
    const photoId = randomUUID();
    await db
      .collection<{
        _id: string;
        ownerId: string;
        data: Buffer;
        createdAt: Date;
      }>('uploads')
      .insertOne({
        _id: photoId,
        ownerId: users[0]._id,
        data: await sharp(image).jpeg().toBuffer(),
        createdAt: new Date(),
      });
    const original = {
      notes: 'Synthetic library pothole beside the demonstration entrance.',
      location: {
        label: 'Synthetic Hyderabad library',
        area: 'central' as const,
        precision: 'exact' as const,
        lat: 17.385,
        lng: 78.4867,
        assetId: 'SYNTHETIC-42',
      },
      observedAt: null,
    };
    const report = newComplaint(
      users[0]._id,
      randomUUID(),
      'synthetic',
      original,
      {
        title: 'Synthetic library pothole',
        description: original.notes,
        category: 'roads',
      },
      null,
      photoId,
    );
    report.synthetic = true;
    await db.collection<Complaint>('complaints').insertOne(report);
    const invitation = await issueInvitation(db, 'registered@browser.example');
    return { password, users, report, image, photoId, invitation };
  } finally {
    await client.close();
  }
}

export type FixtureData = Awaited<ReturnType<typeof resetFixture>>;
