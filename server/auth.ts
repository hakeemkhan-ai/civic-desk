import { randomBytes, createHash } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import type { Db } from 'mongodb';
import { collections, type User } from './db.js';
import { config } from './config.js';
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}
export const hashToken = (s: string) => createHash('sha256').update(s).digest('hex');
export function authenticate(db: Db) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const raw = req.cookies?.session;
    if (typeof raw !== 'string')
      return res.status(401).json({ error: 'Please sign in to continue.' });
    const session = await collections(db).sessions.findOne({
      _id: hashToken(raw),
      expiresAt: { $gt: new Date() },
    });
    if (!session)
      return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
    const user = await collections(db).users.findOne({ _id: session.userId });
    if (!user) return res.status(401).json({ error: 'Please sign in again.' });
    req.user = user;
    next();
  };
}
export function staffOnly(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== 'staff')
    return res.status(403).json({ error: 'Staff access is required.' });
  next();
}
export const userView = (u: User) => ({ id: u._id, name: u.name, role: u.role });
export async function createSession(db: Db, res: Response, userId: string) {
  const token = randomBytes(32).toString('hex');
  await collections(db).sessions.insertOne({
    _id: hashToken(token),
    userId,
    expiresAt: new Date(Date.now() + 86400000),
  });
  res.cookie('session', token, {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 86400000,
  });
}
