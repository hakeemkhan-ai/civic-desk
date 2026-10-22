import { randomBytes } from 'node:crypto';
import type { Db } from 'mongodb';
import { hashToken } from './auth.js';

export type Invitation = { _id: string; email: string; expiresAt: Date };

export async function issueInvitation(db: Db, email: string): Promise<string> {
  const token = randomBytes(32).toString('hex');
  await db.collection<Invitation>('invitations').insertOne({
    _id: hashToken(token),
    email: email.trim().toLowerCase(),
    expiresAt: new Date(Date.now() + 86400000),
  });
  return token;
}
