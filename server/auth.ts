import { randomBytes, createHash } from 'node:crypto';
import type { Db } from 'mongodb';
import { collections, type User } from './db.js';
import { config } from './config.js';
import { HttpError } from './http.js';

export const hashToken = (value: string) => createHash('sha256').update(value).digest('hex');

export function sessionToken(request: Request): string | undefined {
  const cookie = request.headers.get('cookie');
  if (!cookie) return undefined;
  for (const part of cookie.split(';')) {
    const separator = part.indexOf('=');
    if (separator <= 0 || part.slice(0, separator).trim() !== 'session') continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export async function authenticate(db: Db, request: Request): Promise<User> {
  const raw = sessionToken(request);
  if (raw === undefined) throw new HttpError(401, 'Please sign in to continue.');
  const session = await collections(db).sessions.findOne({
    _id: hashToken(raw),
    expiresAt: { $gt: new Date() },
  });
  if (!session) throw new HttpError(401, 'Your session has expired. Please sign in again.');
  const user = await collections(db).users.findOne({ _id: session.userId });
  if (!user) throw new HttpError(401, 'Please sign in again.');
  return user;
}

export const userView = (user: User) => ({ id: user._id, name: user.name, role: user.role });

function cookieAttributes() {
  return `Path=/; HttpOnly; SameSite=Strict${config.NODE_ENV === 'production' ? '; Secure' : ''}`;
}

export function clearSessionCookie() {
  return `session=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; ${cookieAttributes()}`;
}

export async function createSession(db: Db, userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex');
  await collections(db).sessions.insertOne({
    _id: hashToken(token),
    userId,
    expiresAt: new Date(Date.now() + 86400000),
  });
  return `session=${token}; Max-Age=86400; ${cookieAttributes()}`;
}
