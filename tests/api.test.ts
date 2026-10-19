import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, type Db } from 'mongodb';
import { randomUUID } from 'node:crypto';
import { createApp } from '../server/app.js';
import { initialize, collections } from '../server/db.js';
import { AIError, type AIProvider } from '../server/ai/provider.js';
import { AIService } from '../server/ai/service.js';
import { indexOne } from '../server/retrieval/worker.js';
import { config } from '../server/config.js';
let mongo: MongoMemoryServer, client: MongoClient, db: Db, app: ReturnType<typeof createApp>['app'];
let resident: ReturnType<typeof request.agent>,
  staff: ReturnType<typeof request.agent>,
  other: ReturnType<typeof request.agent>;
const headers = { 'X-Civic-Request': '1' };
const report = {
  notes: 'There is a pothole at the library entrance.',
  location: {
    label: 'Maple Street library',
    area: 'central',
    precision: 'exact',
    lat: 12.9,
    lng: 77.5,
    assetId: '',
  },
  observedAt: null,
};
const content = { title: 'Pothole at the library', description: report.notes, category: 'roads' };
let complaintId: string;
beforeAll(async () => {
  mongo = await MongoMemoryServer.create({ binary: { version: '7.0.24' } });
  client = await new MongoClient(mongo.getUri(), { promoteBuffers: true }).connect();
  db = client.db('civic_test');
  await initialize(db);
  app = createApp(db, null).app;
  resident = request.agent(app);
  staff = request.agent(app);
  other = request.agent(app);
  for (const [agent, email] of [
    [resident, 'resident@test.example'],
    [staff, 'staff@test.example'],
    [other, 'other@test.example'],
  ] as const)
    await agent
      .post('/api/auth/register')
      .set(headers)
      .send({ email, password: 'testing-password-123', name: 'Test user' })
      .expect(201);
  await collections(db).users.updateOne(
    { email: 'staff@test.example' },
    { $set: { role: 'staff' } },
  );
}, 120000);
afterAll(async () => {
  await client?.close();
  await mongo?.stop();
});
describe('real MongoDB HTTP lifecycle', () => {
  it('rejects anonymous access, CSRF, self-assigned staff and unknown fields', async () => {
    await request(app).get('/api/complaints').expect(401);
    await request(app).post('/api/auth/register').send({}).expect(403);
    await request(app)
      .post('/api/auth/register')
      .set(headers)
      .set('Origin', 'https://attacker.invalid')
      .send({})
      .expect(403);
    await request(app)
      .post('/api/auth/register')
      .set(headers)
      .send({
        email: 'evil@test.example',
        password: 'testing-password-123',
        name: 'Evil',
        role: 'staff',
      })
      .expect(400);
  });
  it('persists once under concurrent retries and rejects reused keys with changed content', async () => {
    const key = randomUUID(),
      send = () =>
        resident
          .post('/api/complaints')
          .set(headers)
          .set('Idempotency-Key', key)
          .send({ original: report, content });
    const [a, b] = await Promise.all([send(), send()]);
    expect([200, 201]).toContain(a.status);
    expect([200, 201]).toContain(b.status);
    expect(a.body.id).toBe(b.body.id);
    complaintId = a.body.id;
    expect(await collections(db).complaints.countDocuments({ submissionKey: key })).toBe(1);
    await resident
      .post('/api/complaints')
      .set(headers)
      .set('Idempotency-Key', key)
      .send({ original: report, content: { ...content, title: 'Changed report title' } })
      .expect(409);
  });
  it('requires staff on every decision operation', async () => {
    await resident
      .post(`/api/complaints/${complaintId}/status`)
      .set(headers)
      .send({ status: 'under review', version: 1, note: 'Review started' })
      .expect(403);
    await resident.put(`/api/complaints/${complaintId}/review`).set(headers).send({}).expect(403);
    await resident
      .post(`/api/complaints/${complaintId}/duplicate`)
      .set(headers)
      .send({})
      .expect(403);
    await resident.get('/api/staff/metrics').expect(403);
  });
  it('filters private fields from other residents and persists following idempotently', async () => {
    const r = await other.get(`/api/complaints/${complaintId}`).expect(200);
    expect(r.body.original).toBeUndefined();
    expect(r.body.aiSuggestion).toBeUndefined();
    expect(r.body.ownerId).toBeUndefined();
    await other.put(`/api/complaints/${complaintId}/follow`).set(headers).expect(200);
    await other.put(`/api/complaints/${complaintId}/follow`).set(headers).expect(200);
    const list = await other.get('/api/complaints?scope=following').expect(200);
    expect(list.body.total).toBe(1);
  });
  it('enforces transition order and atomically records decisions', async () => {
    await staff
      .post(`/api/complaints/${complaintId}/status`)
      .set(headers)
      .send({ status: 'resolved', version: 1, note: 'Try skip review' })
      .expect(409);
    let r = await staff
      .post(`/api/complaints/${complaintId}/status`)
      .set(headers)
      .send({ status: 'under review', version: 1, note: 'Review started' })
      .expect(200);
    await staff
      .post(`/api/complaints/${complaintId}/status`)
      .set(headers)
      .send({ status: 'assigned', version: r.body.version, note: 'Assign to team' })
      .expect(409);
    r = await staff
      .put(`/api/complaints/${complaintId}/review`)
      .set(headers)
      .send({
        content,
        department: 'Streets & Mobility',
        note: 'Confirmed location and service',
        version: r.body.version,
      })
      .expect(200);
    for (const status of ['assigned', 'in progress', 'resolved', 'reopened'])
      r = await staff
        .post(`/api/complaints/${complaintId}/status`)
        .set(headers)
        .send({ status, version: r.body.version, note: `Synthetic update: ${status}` })
        .expect(200);
    expect(r.body.timeline.map((e: { status: string }) => e.status)).toEqual([
      'submitted',
      'under review',
      'under review',
      'assigned',
      'in progress',
      'resolved',
      'reopened',
    ]);
    await staff
      .post(`/api/complaints/${complaintId}/status`)
      .set(headers)
      .send({ status: 'under review', version: 1, note: 'Stale update' })
      .expect(409);
  });
  it('allows manual submission after AI failure and labels keyword retrieval', async () => {
    await resident.post('/api/drafts').set(headers).send(report).expect(503);
    const r = await resident
      .post('/api/duplicates')
      .set(headers)
      .send({ original: report, content })
      .expect(200);
    expect(r.body.mode).toBe('keyword');
    expect(r.body.notice).toContain('Word matching');
    await resident
      .post('/api/complaints')
      .set(headers)
      .set('Idempotency-Key', randomUUID())
      .send({ original: report, content })
      .expect(201);
  });
  it('rejects unsafe uploads and foreign photo references', async () => {
    await resident
      .post('/api/uploads')
      .set(headers)
      .attach('photo', Buffer.from('<svg/>'), { filename: 'bad.svg', contentType: 'image/svg+xml' })
      .expect(400);
    await resident
      .post('/api/uploads')
      .set(headers)
      .attach('photo', Buffer.from('not an image'), {
        filename: 'bad.png',
        contentType: 'image/png',
      })
      .expect(400);
    await resident
      .post('/api/complaints')
      .set(headers)
      .set('Idempotency-Key', randomUUID())
      .send({ original: report, content, photoId: randomUUID() })
      .expect(403);
  });
  it('excludes the reviewed complaint before selecting the five candidates', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 6; i++) {
      const created = await resident
        .post('/api/complaints')
        .set(headers)
        .set('Idempotency-Key', randomUUID())
        .send({ original: report, content })
        .expect(201);
      ids.push(created.body.id);
    }
    const result = await staff
      .post('/api/duplicates')
      .set(headers)
      .send({ original: report, content, strategy: 'keyword', excludeComplaintId: ids[5] })
      .expect(200);
    expect(result.body.candidates).toHaveLength(5);
    expect(
      result.body.candidates.map((c: { complaint: { id: string } }) => c.complaint.id),
    ).not.toContain(ids[5]);
  });
  it('records provider errors without logging report text and keeps manual fallback', async () => {
    const provider: AIProvider = {
      draft: async () => {
        throw new AIError('timeout');
      },
      embed: async () => {
        throw new AIError('provider_error');
      },
    };
    const isolated = createApp(db, provider).app,
      agent = request.agent(isolated);
    await agent
      .post('/api/auth/login')
      .set(headers)
      .send({ email: 'resident@test.example', password: 'testing-password-123' })
      .expect(200);
    const r = await agent.post('/api/drafts').set(headers).send(report).expect(503);
    expect(r.body.code).toBe('timeout');
    const run = await db.collection('aiRuns').findOne({ outcome: 'timeout' });
    expect(run).toBeTruthy();
    expect(JSON.stringify(run)).not.toContain(report.notes);
  });
  it('invalidates edited embeddings and prevents a stale worker from overwriting new content', async () => {
    const col = collections(db).complaints;
    await col.updateMany({}, { $set: { indexState: 'ready' } });
    await col.updateOne(
      { _id: complaintId },
      { $set: { indexState: 'pending', indexAttempts: 0 } },
    );
    let release!: (v: {
      value: number[];
      usage: { input: number; output: number };
      model: string;
    }) => void;
    const ai = new AIService(db, {
      draft: async () => {
        throw new Error();
      },
      embed: () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    });
    const pending = indexOne(db, ai);
    while (!release) await new Promise((r) => setTimeout(r, 5));
    const old = await staff.get(`/api/complaints/${complaintId}`);
    await staff
      .put(`/api/complaints/${complaintId}/review`)
      .set(headers)
      .send({
        content: { ...content, description: 'Pothole now reported at the south library entrance.' },
        department: 'Streets & Mobility',
        note: 'Corrected approved description',
        version: old.body.version,
      })
      .expect(200);
    release({
      value: Array(config.EMBEDDING_DIMENSIONS).fill(0.01),
      usage: { input: 10, output: 0 },
      model: config.EMBEDDING_MODEL,
    });
    await pending;
    const saved = await col.findOne({ _id: complaintId });
    expect(saved!.indexState).toBe('pending');
    expect(saved!.embedding).toBeUndefined();
  });
});

describe('private resources, feedback, and duplicate links', () => {
  it('restricts a valid photo to its owner and staff', async () => {
    const { default: sharp } = await import('sharp');
    const bytes = await sharp({
      create: { width: 8, height: 8, channels: 3, background: '#53785d' },
    })
      .png()
      .toBuffer();
    const uploaded = await resident
      .post('/api/uploads')
      .set(headers)
      .attach('photo', bytes, { filename: 'synthetic.png', contentType: 'image/png' })
      .expect(201);
    await resident
      .get(`/api/uploads/${uploaded.body.id}`)
      .expect(200)
      .expect('Content-Type', /image\/jpeg/);
    await staff.get(`/api/uploads/${uploaded.body.id}`).expect(200);
    await other.get(`/api/uploads/${uploaded.body.id}`).expect(403);
    await other
      .post('/api/complaints')
      .set(headers)
      .set('Idempotency-Key', randomUUID())
      .send({ original: report, content, photoId: uploaded.body.id })
      .expect(403);
  });
  it('saves useful rejection snapshots and rejects feedback on another residents report', async () => {
    await other
      .post('/api/feedback/duplicate')
      .set(headers)
      .send({ candidateId: complaintId, complaintId, reason: 'Different location' })
      .expect(403);
    await resident
      .post('/api/feedback/duplicate')
      .set(headers)
      .send({
        candidateId: complaintId,
        reason: 'Different nearby entrance',
        query: { content, location: report.location, observedAt: null },
      })
      .expect(201);
    const feedback = await db.collection('feedback').findOne({ candidateId: complaintId });
    expect(feedback?.query.content.title).toBe(content.title);
    expect(feedback?.candidateSnapshot.contentHash).toBeTruthy();
    expect(feedback?.rankVersion).toBe('incident-rules-v2');
  });
  it('records a duplicate link without merging and rejects the reverse link', async () => {
    const created = await resident
      .post('/api/complaints')
      .set(headers)
      .set('Idempotency-Key', randomUUID())
      .send({ original: report, content })
      .expect(201);
    const linked = await staff
      .post(`/api/complaints/${created.body.id}/duplicate`)
      .set(headers)
      .send({
        targetId: complaintId,
        version: created.body.version,
        note: 'Staff compared the location and reported facts.',
      })
      .expect(200);
    expect(linked.body.duplicateOf).toBe(complaintId);
    expect(
      await collections(db).complaints.countDocuments({
        _id: { $in: [created.body.id, complaintId] },
      }),
    ).toBe(2);
    const original = await staff.get(`/api/complaints/${complaintId}`).expect(200);
    await staff
      .post(`/api/complaints/${complaintId}/duplicate`)
      .set(headers)
      .send({
        targetId: created.body.id,
        version: original.body.version,
        note: 'Attempt a reverse link',
      })
      .expect(409);
  });
  it('rejects role forgery through complaint content and overlong multibyte passwords', async () => {
    await resident
      .post('/api/complaints')
      .set(headers)
      .set('Idempotency-Key', randomUUID())
      .send({ original: report, content, aiSuggestion: { role: 'staff' } })
      .expect(400);
    await request(app)
      .post('/api/auth/register')
      .set(headers)
      .send({ email: 'unicode@test.example', name: 'Unicode test', password: '🌳'.repeat(30) })
      .expect(400);
  });
});

describe('Hyderabad locations and migration', () => {
  it('round-trips a map pin and accepts clearing both coordinates', async () => {
    const pinned = { ...report, location: { ...report.location, label: 'Charminar approach', lat: 17.3616, lng: 78.4747, precision: 'approximate' } };
    const created = await resident.post('/api/complaints').set(headers).set('Idempotency-Key', randomUUID()).send({ original: pinned, content }).expect(201);
    const read = await resident.get(`/api/complaints/${created.body.id}`).expect(200);
    expect(read.body.location).toEqual(pinned.location);
    expect(read.body.original.location).toEqual(pinned.location);
    const cleared = { ...pinned, location: { ...pinned.location, lat: null, lng: null } };
    const empty = await resident.post('/api/complaints').set(headers).set('Idempotency-Key', randomUUID()).send({ original: cleared, content }).expect(201);
    expect(empty.body.location.lat).toBeNull();
    expect(empty.body.location.lng).toBeNull();
    await resident.post('/api/complaints').set(headers).set('Idempotency-Key', randomUUID()).send({ original: { ...pinned, location: { ...pinned.location, lng: null } }, content }).expect(400);
  });
  it('backs up first, preserves edits and relationships, invalidates embeddings, and is repeatable', async () => {
    const { migrateHyderabad } = await import('../server/migrations/hyderabad.js');
    const { fixtureFields } = await import('../server/demo-fixtures.js');
    const { newComplaint, contentHash } = await import('../server/complaints.js');
    const { MUNICIPALITY } = await import('../shared/domain.js');
    const rows = [0, 1, 2].map(i => {
      const f = fixtureFields(i, true);
      const c = newComplaint('migration-test-owner', i === 2 ? randomUUID() : `seed-v1-${i}`, 'unchanged-request-hash', { notes: f.content.description, location: f.location, observedAt: null }, f.content, null, null);
      c.municipality = 'brookfield-demo'; c.synthetic = i !== 2;
      c.followers = ['test-follower'];
      c.indexState = 'ready'; c.embedding = { vector: [1], model: 'old', version: 'old', dimensions: 1, hash: c.contentHash };
      return c;
    });
    rows[0].duplicateOf = rows[2]._id;
    rows[1].content.title = 'User edited title'; rows[1].location.lat = 17.4;
    rows[2].photoId = 'preserved-photo';
    await collections(db).complaints.insertMany(rows);
    await expect(migrateHyderabad(db, async () => { throw new Error('Backup failed'); })).rejects.toThrow('Backup failed');
    expect(await collections(db).complaints.countDocuments({ municipality: 'brookfield-demo' })).toBe(3);
    let backedUp = 0;
    const result = await migrateHyderabad(db, async records => {
      backedUp = records.length;
      expect(await collections(db).complaints.countDocuments({ municipality: 'brookfield-demo' })).toBe(3);
    });
    expect(backedUp).toBe(3); expect(result.migrated).toBe(3);
    for (const old of rows) {
      const saved = (await collections(db).complaints.findOne({ _id: old._id }))!;
      expect(saved.municipality).toBe(MUNICIPALITY);
      expect(saved.original).toEqual(old.original);
      expect(saved.followers).toEqual(old.followers);
      expect(saved.duplicateOf).toBe(old.duplicateOf);
      expect(saved.timeline.slice(0, -1)).toEqual(old.timeline);
      expect(saved.version).toBe(old.version + 1);
      expect(saved.requestHash).toBe(old.requestHash);
      if (old.synthetic) { expect(saved.embedding).toBeUndefined(); expect(saved.indexState).toBe('pending'); expect(saved.contentHash).toBe(contentHash(saved.content)); }
      else { expect(saved.content).toEqual(old.content); expect(saved.location).toEqual(old.location); expect(saved.photoId).toBe(old.photoId); }
    }
    const relocated = (await collections(db).complaints.findOne({ _id: rows[0]._id }))!;
    expect(relocated.location).toEqual(fixtureFields(0).location);
    const edited = (await collections(db).complaints.findOne({ _id: rows[1]._id }))!;
    expect(edited.content.title).toBe('User edited title'); expect(edited.location).toEqual(rows[1].location);
    expect(await migrateHyderabad(db, async () => { throw new Error('Must not back up an empty migration'); })).toEqual({ migrated: 0, relocated: 0 });
  });
});
