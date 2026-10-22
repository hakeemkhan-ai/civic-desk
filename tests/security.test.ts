import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, type Db } from 'mongodb';
import { randomBytes, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import sharp from 'sharp';
import { createApi } from '../server/app.js';
import { collections, initialize, type User } from '../server/db.js';
import { createSession, hashToken, withPasswordCapacity } from '../server/auth.js';
import { issueInvitation, type Invitation } from '../server/invitations.js';
import { DatabaseLimiter } from '../server/limits.js';
import { config } from '../server/config.js';
import {
  MAX_UPLOAD_BYTES, MAX_UPLOAD_COUNT, MAX_FEEDBACK_COUNT, MAX_COMPLAINT_FEEDBACK,
  reserveUpload,
} from '../server/storage.js';
import { newComplaint } from '../server/complaints.js';
import { departments } from '../shared/domain.js';

let mongo: MongoMemoryServer, client: MongoClient, db: Db;
let user: User, cookie: string;
let handle: ReturnType<typeof createApi>['handle'];
const password = 'synthetic-security-password';
const previousHops = config.TRUST_PROXY_HOPS;
const original = {
  notes: 'Synthetic pothole beside the library.',
  location: {
    label: 'Synthetic library', area: 'central' as const, precision: 'exact' as const,
    lat: 17.385, lng: 78.4867, assetId: '',
  },
  observedAt: null,
};
const content = { title: 'Synthetic pothole', description: original.notes, category: 'roads' as const };
const req = (path: string, body?: unknown, session?: string, extra = {}) => new Request(
  `http://localhost/api${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json', 'X-Civic-Request': '1' }),
      ...(session ? { Cookie: session } : {}),
      ...extra,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  },
);
const account = (email: string, invitation: string) => ({
  email, name: 'Synthetic resident', password, invitation,
});

beforeAll(async () => {
  mongo = await MongoMemoryServer.create({ binary: { version: '7.0.24' } });
  client = await new MongoClient(mongo.getUri(), { promoteBuffers: true }).connect();
}, 120000);
beforeEach(async () => {
  config.TRUST_PROXY_HOPS = 0;
  db = client.db(`security_${randomBytes(6).toString('hex')}`);
  await initialize(db);
  user = {
    _id: randomUUID(), email: 'resident@security.example', name: 'Synthetic resident',
    passwordHash: await bcrypt.hash(password, 4), role: 'resident',
  };
  await collections(db).users.insertOne(user);
  cookie = (await createSession(db, user._id)).split(';')[0];
  handle = createApi(db, null).handle;
});
afterAll(async () => {
  config.TRUST_PROXY_HOPS = previousHops;
  await client?.close();
  await mongo?.stop();
});

describe('security finding regressions', () => {
  it('keeps valid login, sessions, health and logout available after anonymous traffic', async () => {
    for (let i = 0; i < 25; i++)
      expect((await handle(req('/auth/register', {}))).status).toBe(400);
    for (let i = 0; i < 151; i++)
      expect((await handle(req('/config'))).status).toBe(200);
    expect((await handle(req('/auth/login', { email: user.email, password }))).status).toBe(200);
    expect((await handle(req('/auth/me', undefined, cookie))).status).toBe(200);
    expect((await handle(req('/health'))).status).toBe(200);
    expect((await handle(req('/auth/logout', {}, cookie))).status).toBe(204);
    expect((await handle(req('/auth/me', undefined, cookie))).status).toBe(401);
  });

  it('bounds repeated invalid-session lookups without rejecting another session or logout', async () => {
    const invalid = `session=${'0'.repeat(64)}`;
    for (let i = 0; i < 150; i++)
      expect((await handle(req('/auth/me', undefined, invalid))).status).toBe(401);
    const restarted = createApi(db, null).handle;
    const blocked = await restarted(req('/auth/me', undefined, invalid));
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
    expect((await restarted(req('/auth/me', undefined, cookie))).status).toBe(200);
    // A user's own exhausted API budget must still allow revoking that session.
    for (let i = 1; i < 150; i++) await restarted(req('/auth/me', undefined, cookie));
    expect((await restarted(req('/auth/me', undefined, cookie))).status).toBe(429);
    expect((await restarted(req('/auth/logout', {}, cookie))).status).toBe(204);
    expect(await collections(db).sessions.countDocuments({ _id: hashToken(cookie.slice(8)) })).toBe(0);
  });

  it('uses atomic shared counters, independent identities and logical expiry', async () => {
    const first = new DatabaseLimiter(db, 'race', 60000, 5, 'Slow down');
    const second = new DatabaseLimiter(db, 'race', 60000, 5, 'Slow down');
    const attempts = await Promise.allSettled(Array.from({ length: 20 }, (_, i) =>
      (i % 2 ? first : second).check('one'),
    ));
    expect(attempts.filter((result) => result.status === 'fulfilled')).toHaveLength(5);
    expect(attempts.filter((result) => result.status === 'rejected')).toHaveLength(15);
    await expect(second.check('two')).resolves.toBeUndefined();
    await db.collection('rateLimits').updateMany({}, { $set: { expiresAt: new Date(0) } });
    await expect(first.check('one')).resolves.toBeUndefined();
    const indexes = await db.collection('rateLimits').indexes();
    expect(indexes.some((index) => index.key.expiresAt === 1 && index.expireAfterSeconds === 0)).toBe(true);
  });

  it('isolates trusted-source login quotas and ignores forged source headers by default', async () => {
    const limiter = new DatabaseLimiter(db, 'login-source', 900000, 25, 'Slow down');
    for (let i = 0; i < 25; i++) await limiter.check('ipv4:198.51.100.1');
    config.TRUST_PROXY_HOPS = 1;
    expect((await handle(req('/auth/login', { email: user.email, password }, undefined,
      { 'X-Forwarded-For': 'forged, 198.51.100.1' }))).status).toBe(429);
    expect((await handle(req('/auth/login', { email: user.email, password }, undefined,
      { 'X-Forwarded-For': '198.51.100.2' }))).status).toBe(200);
    config.TRUST_PROXY_HOPS = 0;
    expect((await handle(req('/auth/login', { email: user.email, password }, undefined,
      { 'X-Forwarded-For': '198.51.100.1' }))).status).toBe(200);
  });

  it('throttles failed account attempts without locking out the correct password', async () => {
    // Pre-fill the failure budget; password verification must precede its rejection.
    const { identityHash } = await import('../server/limits.js');
    const limiter = new DatabaseLimiter(db, 'login-failure', 900000, 25, 'Slow down');
    for (let i = 0; i < 25; i++) await limiter.check(identityHash('anonymous', user.email));
    expect((await handle(req('/auth/login', { email: user.email, password: 'wrong-password-123' }))).status).toBe(429);
    expect((await handle(req('/auth/login', { email: user.email, password }))).status).toBe(200);
  });

  it('caps concurrent password work and restores capacity after failure', async () => {
    const releases: Array<() => void> = [];
    const pending = Array.from({ length: 4 }, () => withPasswordCapacity(() =>
      new Promise<void>((resolve) => releases.push(resolve)),
    ));
    await expect(withPasswordCapacity(async () => undefined)).rejects.toMatchObject({ status: 503 });
    releases.forEach((release) => release());
    await Promise.all(pending);
    await expect(withPasswordCapacity(async () => { throw new Error('synthetic'); })).rejects.toThrow('synthetic');
    await expect(withPasswordCapacity(async () => true)).resolves.toBe(true);
  });

  it('returns indistinguishable signup responses and requires a bound, unexpired invitation', async () => {
    const invalid = 'a'.repeat(64);
    const existing = await handle(req('/auth/register', account(user.email, invalid)));
    const unknown = await handle(req('/auth/register', account('unknown@security.example', invalid)));
    expect(existing.status).toBe(202);
    expect(unknown.status).toBe(202);
    expect(await existing.text()).toBe(await unknown.text());
    expect(existing.headers.getSetCookie()).toEqual([]);
    expect(unknown.headers.getSetCookie()).toEqual([]);
    expect(await collections(db).users.countDocuments({})).toBe(1);

    const email = 'invited@security.example';
    const invitation = await issueInvitation(db, email);
    expect(await db.collection<Invitation>('invitations').findOne({ _id: invitation })).toBeNull();
    expect((await handle(req('/auth/register', account('wrong@security.example', invitation)))).status).toBe(202);
    const responses = await Promise.all([
      handle(req('/auth/register', account(email, invitation))),
      handle(req('/auth/register', account(email, invitation))),
    ]);
    expect(responses.map((response) => response.status)).toEqual([202, 202]);
    expect(responses.every((response) => response.headers.getSetCookie().length === 0)).toBe(true);
    expect(await collections(db).users.countDocuments({ email })).toBe(1);
    const created = await collections(db).users.findOne({ email });
    expect(created?.role).toBe('resident');
    expect((await handle(req('/auth/login', { email, password }))).status).toBe(200);
    const expired = await issueInvitation(db, 'expired@security.example');
    await db.collection('invitations').updateMany({}, { $set: { expiresAt: new Date(0) } });
    expect((await handle(req('/auth/register', account('expired@security.example', expired)))).status).toBe(202);
    expect(await collections(db).users.findOne({ email: 'expired@security.example' })).toBeNull();
  });

  it('never replaces an existing account through invitations or invitation replay', async () => {
    const invitation = await issueInvitation(db, user.email);
    const attempt = { ...account(user.email, invitation), password: 'different-password-123' };
    for (let i = 0; i < 2; i++)
      expect((await handle(req('/auth/register', attempt))).status).toBe(202);
    expect((await handle(req('/auth/login', { email: user.email, password }))).status).toBe(200);
    expect((await collections(db).users.findOne({ _id: user._id }))?.passwordHash).toBe(user.passwordHash);
  });
});

describe('bounded storage with legacy record preservation', () => {
  it('initializes from legacy uploads and atomically reserves the remaining byte/count quota', async () => {
    await collections(db).uploads.insertOne({
      _id: randomUUID(), ownerId: user._id, data: Buffer.from('legacy'), createdAt: new Date(),
    });
    await reserveUpload(db, user._id, 10);
    expect(await collections(db).users.findOne({ _id: user._id })).toMatchObject({ uploadBytes: 16, uploadCount: 2 });
    await collections(db).users.updateOne({ _id: user._id }, {
      $set: { uploadBytes: MAX_UPLOAD_BYTES - 10, uploadCount: MAX_UPLOAD_COUNT - 1 },
    });
    const attempts = await Promise.allSettled([reserveUpload(db, user._id, 10), reserveUpload(db, user._id, 10)]);
    expect(attempts.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(await collections(db).uploads.countDocuments({ ownerId: user._id })).toBe(1);
  });

  it('expires new orphan photos, pins submitted photos and rejects quota/expired attachments', async () => {
    const image = await sharp({ create: { width: 4, height: 4, channels: 3, background: 'green' } }).png().toBuffer();
    const upload = async () => {
      const form = new FormData();
      form.set('photo', new File([new Uint8Array(image)], 'synthetic.png', { type: 'image/png' }));
      return handle(new Request('http://localhost/api/uploads', {
        method: 'POST', headers: { Cookie: cookie, 'X-Civic-Request': '1' }, body: form,
      }));
    };
    const uploaded = await upload();
    expect(uploaded.status).toBe(201);
    const { id } = await uploaded.json();
    expect((await collections(db).uploads.findOne({ _id: id }))?.expiresAt).toBeInstanceOf(Date);
    expect((await handle(req('/complaints', { original, content, photoId: id }, cookie,
      { 'Idempotency-Key': randomUUID() }))).status).toBe(201);
    expect((await collections(db).uploads.findOne({ _id: id }))?.expiresAt).toBeUndefined();
    expect((await handle(req(`/uploads/${id}`, undefined, cookie))).status).toBe(200);
    const expiredId = randomUUID();
    await collections(db).uploads.insertOne({
      _id: expiredId, ownerId: user._id, data: image, createdAt: new Date(), expiresAt: new Date(0),
    });
    expect((await handle(req(`/uploads/${expiredId}`, undefined, cookie))).status).toBe(404);
    expect((await handle(req('/complaints', { original, content, photoId: expiredId }, cookie,
      { 'Idempotency-Key': randomUUID() }))).status).toBe(403);
    await collections(db).users.updateOne({ _id: user._id }, { $set: { uploadBytes: MAX_UPLOAD_BYTES } });
    expect((await upload()).status).toBe(429);
    expect((await handle(req(`/uploads/${id}`, undefined, cookie))).status).toBe(200);
  });

  it('rejects expired drafts before TTL cleanup and leaves legacy draft records untouched', async () => {
    const draftId = randomUUID();
    await db.collection<{ _id: string; ownerId: string; expiresAt?: Date }>('drafts').insertOne({
      _id: draftId, ownerId: user._id, expiresAt: new Date(0),
    });
    expect((await handle(req('/complaints', { original, content, draftId }, cookie,
      { 'Idempotency-Key': randomUUID() }))).status).toBe(404);
    const legacyId = randomUUID();
    await db.collection<{ _id: string; ownerId: string }>('drafts').insertOne({
      _id: legacyId, ownerId: user._id,
    });
    await initialize(db);
    expect(await db.collection<{ _id: string }>('drafts').findOne({ _id: legacyId })).toBeTruthy();
  });

  it('deduplicates concurrent feedback and caps complaint/account growth without removing history', async () => {
    const candidate = newComplaint(user._id, randomUUID(), 'synthetic', original, content, null, null);
    const complaint = newComplaint(user._id, randomUUID(), 'synthetic', original, content, null, null);
    await collections(db).complaints.insertMany([candidate, complaint]);
    const entry = { candidateId: candidate._id, reason: 'Different synthetic incident', complaintId: complaint._id };
    const send = () => handle(req('/feedback/duplicate', entry, cookie));
    expect((await Promise.all([send(), send()])).map((response) => response.status)).toEqual([201, 201]);
    expect((await collections(db).complaints.findOne({ _id: complaint._id }))?.feedback).toHaveLength(1);
    await collections(db).complaints.updateOne({ _id: complaint._id }, {
      $set: { feedback: Array.from({ length: MAX_COMPLAINT_FEEDBACK }, () => ({
        id: randomUUID(), at: new Date().toISOString(), kind: 'draft_edit' as const,
      })) },
    });
    expect((await send()).status).toBe(429);
    expect((await collections(db).complaints.findOne({ _id: complaint._id }))?.feedback).toHaveLength(MAX_COMPLAINT_FEEDBACK);
    await collections(db).users.updateOne({ _id: user._id }, { $set: { role: 'staff' } });
    const review = await handle(new Request(`http://localhost/api/complaints/${complaint._id}/review`, {
      method: 'PUT',
      headers: { Cookie: cookie, 'X-Civic-Request': '1', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: { ...content, category: 'waste' }, department: departments.waste,
        note: 'Synthetic category correction', version: complaint.version,
      }),
    }));
    expect(review.status).toBe(200);
    const reviewed = await collections(db).complaints.findOne({ _id: complaint._id });
    expect(reviewed?.feedback).toHaveLength(MAX_COMPLAINT_FEEDBACK);
    expect(reviewed?.timeline.at(-1)?.kind).toBe('review');
    const unlinked = { candidateId: candidate._id, reason: entry.reason };
    expect((await handle(req('/feedback/duplicate', unlinked, cookie))).status).toBe(201);
    expect((await handle(req('/feedback/duplicate', unlinked, cookie))).status).toBe(201);
    expect(await db.collection('feedback').countDocuments({ ownerId: user._id })).toBe(1);
    await collections(db).users.updateOne({ _id: user._id }, { $set: { feedbackCount: MAX_FEEDBACK_COUNT } });
    expect((await handle(req('/feedback/duplicate', {
      ...unlinked, query: { content, location: original.location, observedAt: null },
    }, cookie))).status).toBe(429);
  });
});
