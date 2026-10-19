import express, { type Request, type Response, type NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { preparePhoto, MAX_PHOTO_BYTES } from './uploads.js';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { z, ZodError } from 'zod';
import type { Db } from 'mongodb';
import {
  categories,
  statuses,
  ContentSchema,
  ReportSchema,
  LocationSchema,
  departments,
  DIRECTORY_VERSION,
  MUNICIPALITY,
} from '../shared/domain.js';
import { config } from './config.js';
import { collections, type Complaint, type Feedback } from './db.js';
import { authenticate, staffOnly, createSession, hashToken, userView } from './auth.js';
import {
  newComplaint,
  view,
  digest,
  canTransition,
  contentHash,
  cleanContent,
} from './complaints.js';
import { redact } from './privacy.js';
import { makeProvider, type AIProvider, AIError } from './ai/provider.js';
import { AIService } from './ai/service.js';
import { PROMPT_VERSION, SCHEMA_VERSION } from './ai/prompts.js';
import { findDuplicates } from './retrieval/service.js';
import { RANK_VERSION } from './retrieval/rank.js';
const id = z.string().uuid();
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const accountSchema = z
  .object({
    email: z
      .string()
      .trim()
      .email()
      .max(254)
      .transform((s) => s.toLowerCase()),
    password: z
      .string()
      .min(12)
      .max(72)
      .refine(
        (value) => Buffer.byteLength(value, 'utf8') <= 72,
        'Password must fit within 72 UTF-8 bytes.',
      ),
  })
  .strict();
const createSchema = z
  .object({
    original: ReportSchema,
    content: ContentSchema,
    draftId: id.nullable().default(null),
    photoId: id.nullable().default(null),
  })
  .strict();
export function createApp(db: Db, provider: AIProvider | null = makeProvider()) {
  const app = express(),
    c = collections(db),
    ai = new AIService(db, provider);
  app.disable('x-powered-by');
  if (config.TRUST_PROXY_HOPS) app.set('trust proxy', config.TRUST_PROXY_HOPS);
  app.use(
    helmet({
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      contentSecurityPolicy: {
        directives: {
          'img-src': ["'self'", 'blob:', 'data:', 'https://tile.openstreetmap.org'],
          'upgrade-insecure-requests': config.NODE_ENV === 'production' ? [] : null,
        },
      },
      strictTransportSecurity: config.NODE_ENV === 'production' ? undefined : false,
    }),
  );
  app.use(express.json({ limit: '32kb' }), cookieParser());
  app.use(
    '/api',
    rateLimit({
      windowMs: 60000,
      limit: 150,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { error: 'Too many requests. Please try again in a minute.' },
    }),
  );
  app.use('/api', (req, res, next) => {
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      (req.get('X-Civic-Request') !== '1' ||
        (req.get('origin') && req.get('origin') !== config.APP_ORIGIN))
    )
      return res
        .status(403)
        .json({ error: 'This request could not be verified. Refresh and try again.' });
    next();
  });
  app.get('/api/health', async (_req, res) => {
    await db.command({ ping: 1 });
    res.json({ ok: true });
  });
  app.get('/api/config', (_req, res) =>
    res.json({
      municipality: 'Hyderabad',
      demonstration: true,
      categories,
      statuses,
      departments,
      directoryVersion: DIRECTORY_VERSION,
      draftingAvailable: !!provider,
    }),
  );
  const authLimit = rateLimit({
    windowMs: 15 * 60000,
    limit: 25,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many sign-in attempts. Try again in 15 minutes.' },
  });
  app.post('/api/auth/register', authLimit, async (req, res) => {
    const data = accountSchema
      .extend({ name: z.string().trim().min(2).max(60) })
      .strict()
      .parse(req.body);
    const user = {
      _id: randomUUID(),
      email: data.email,
      name: data.name,
      passwordHash: await bcrypt.hash(data.password, 12),
      role: 'resident' as const,
    };
    await c.users.insertOne(user);
    await createSession(db, res, user._id);
    res.status(201).json(userView(user));
  });
  app.post('/api/auth/login', authLimit, async (req, res) => {
    const data = accountSchema.parse(req.body),
      user = await c.users.findOne({ email: data.email });
    const valid = await bcrypt.compare(
      data.password,
      user?.passwordHash ?? '$2b$12$1wDSBTXN0mBnZtkdn.oqBOWGmIJejZOKcLPU8xVHQYjHr1zR9naQK',
    );
    if (!user || !valid) throw new HttpError(401, 'Email or password is incorrect.');
    await createSession(db, res, user._id);
    res.json(userView(user));
  });
  app.post('/api/auth/logout', async (req, res) => {
    if (typeof req.cookies?.session === 'string')
      await c.sessions.deleteOne({ _id: hashToken(req.cookies.session) });
    res.clearCookie('session', { path: '/' }).status(204).end();
  });
  app.use('/api', authenticate(db));
  app.get('/api/auth/me', (req, res) => res.json(userView(req.user!)));
  const aiLimit = rateLimit({
    windowMs: 60000,
    limit: 10,
    keyGenerator: (req) => req.user!._id,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Please wait a minute before requesting more suggestions.' },
  });
  app.post('/api/drafts', aiLimit, async (req, res) => {
    const original = ReportSchema.parse(req.body);
    const suggestion = await ai.draft(original);
    const draft = {
      _id: randomUUID(),
      ownerId: req.user!._id,
      original,
      suggestion,
      createdAt: new Date(),
      promptVersion: PROMPT_VERSION,
      schemaVersion: SCHEMA_VERSION,
      model: config.DRAFT_MODEL,
    };
    await c.drafts.insertOne(draft);
    res.status(201).json({ id: draft._id, suggestion });
  });
  app.post('/api/duplicates', aiLimit, async (req, res) => {
    const data = z
      .object({
        original: ReportSchema,
        content: ContentSchema,
        strategy: z.enum(['keyword', 'embedding', 'hybrid']).default('hybrid'),
        excludeComplaintId: z.string().uuid().optional(),
      })
      .strict()
      .parse(req.body);
    res.json(
      await findDuplicates(
        db,
        ai,
        data.original,
        data.content,
        req.user!,
        data.strategy,
        data.excludeComplaintId,
      ),
    );
  });
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_PHOTO_BYTES, files: 1, fields: 0 },
    fileFilter: (_req, file, cb) => {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype))
        return cb(new HttpError(400, 'Choose a JPEG, PNG, or WebP photo.'));
      cb(null, true);
    },
  });
  app.post(
    '/api/uploads',
    rateLimit({ windowMs: 3600000, limit: 20, keyGenerator: (req) => req.user!._id }),
    upload.single('photo'),
    async (req, res) => {
      if (!req.file) throw new HttpError(400, 'Choose a photo.');
      let data: Buffer;
      try {
        data = await preparePhoto(req.file.buffer);
      } catch {
        throw new HttpError(400, 'The photo could not be read. Choose a valid image under 5 MB.');
      }
      const photoId = randomUUID();
      await c.uploads.insertOne({
        _id: photoId,
        ownerId: req.user!._id,
        data,
        createdAt: new Date(),
      });
      res.status(201).json({ id: photoId });
    },
  );
  app.get('/api/uploads/:id', async (req, res) => {
    const photo = await c.uploads.findOne({ _id: id.parse(req.params.id) });
    if (!photo) throw new HttpError(404, 'Photo not found.');
    if (req.user!.role !== 'staff' && photo.ownerId !== req.user!._id)
      throw new HttpError(403, 'This photo is private.');
    res.set('Cache-Control', 'private, no-store').type('jpeg').send(photo.data);
  });
  app.post('/api/complaints', async (req, res) => {
    const key = id.parse(req.get('Idempotency-Key')),
      data = createSchema.parse(req.body),
      requestHash = digest(data),
      existing = await c.complaints.findOne({ ownerId: req.user!._id, submissionKey: key });
    if (existing) {
      if (existing.requestHash !== requestHash)
        throw new HttpError(409, 'This submission key was already used for different content.');
      return res.json(view(existing, req.user!));
    }
    if (data.original.observedAt && Date.parse(data.original.observedAt) > Date.now() + 86400000)
      throw new HttpError(400, 'Observation time cannot be in the future.');
    const draft = data.draftId
      ? await c.drafts.findOne({ _id: data.draftId, ownerId: req.user!._id })
      : null;
    if (data.draftId && !draft) throw new HttpError(404, 'Draft not found.');
    if (draft && digest(draft.original) !== digest(data.original))
      throw new HttpError(
        409,
        'The original notes changed. Generate a new draft or continue manually.',
      );
    if (data.photoId && !(await c.uploads.findOne({ _id: data.photoId, ownerId: req.user!._id })))
      throw new HttpError(403, 'Photo does not belong to this account.');
    const complaint = newComplaint(
      req.user!._id,
      key,
      requestHash,
      data.original,
      data.content,
      draft,
      data.photoId,
    );
    try {
      await c.complaints.insertOne(complaint);
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
      const saved = await c.complaints.findOne({ ownerId: req.user!._id, submissionKey: key });
      if (!saved || saved.requestHash !== requestHash)
        throw new HttpError(409, 'Conflicting submission.');
      return res.json(view(saved, req.user!));
    }
    res.status(201).json(view(complaint, req.user!));
  });
  app.get('/api/complaints', async (req, res) => {
    const q = z
      .object({
        category: z.enum(categories).optional(),
        status: z.enum(statuses).optional(),
        scope: z.enum(['all', 'mine', 'following']).default('all'),
        page: z.coerce.number().int().min(1).max(10000).default(1),
      })
      .strict()
      .parse(req.query);
    const filter = {
      municipality: MUNICIPALITY,
      ...(q.category ? { 'content.category': q.category } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.scope === 'mine'
        ? { ownerId: req.user!._id }
        : q.scope === 'following'
          ? { followers: req.user!._id }
          : {}),
    };
    const [items, total] = await Promise.all([
      c.complaints
        .find(filter)
        .sort({ createdAt: -1, _id: 1 })
        .skip((q.page - 1) * 20)
        .limit(20)
        .toArray(),
      c.complaints.countDocuments(filter),
    ]);
    res.json({ items: items.map((item) => view(item, req.user!)), total, page: q.page });
  });
  async function getComplaint(req: Request) {
    const complaint = await c.complaints.findOne({
      _id: id.parse(req.params.id),
      municipality: MUNICIPALITY,
    });
    if (!complaint) throw new HttpError(404, 'Report not found.');
    return complaint;
  }
  app.get('/api/complaints/:id', async (req, res) =>
    res.json(view(await getComplaint(req), req.user!)),
  );
  app.put('/api/complaints/:id/follow', async (req, res) => {
    const complaint = await getComplaint(req);
    await c.complaints.updateOne(
      { _id: complaint._id },
      { $addToSet: { followers: req.user!._id } },
    );
    res.json({ following: true });
  });
  app.delete('/api/complaints/:id/follow', async (req, res) => {
    const complaint = await getComplaint(req);
    await c.complaints.updateOne({ _id: complaint._id }, { $pull: { followers: req.user!._id } });
    res.json({ following: false });
  });
  app.post('/api/complaints/:id/status', staffOnly, async (req, res) => {
    const data = z
        .object({
          status: z.enum(statuses),
          note: z.string().trim().min(5).max(1000),
          version: z.number().int().positive(),
        })
        .strict()
        .parse(req.body),
      complaint = await getComplaint(req);
    if (!canTransition(complaint.status, data.status, complaint.reviewed))
      throw new HttpError(
        409,
        'That status change is not allowed. Confirm the review before assignment.',
      );
    const at = new Date().toISOString();
    const updated = await c.complaints.findOneAndUpdate(
      { _id: complaint._id, version: data.version, status: complaint.status },
      {
        $set: { status: data.status, updatedAt: at },
        $inc: { version: 1 },
        $push: {
          timeline: {
            id: randomUUID(),
            at,
            kind: 'status',
            actorRole: 'staff',
            actorId: req.user!._id,
            status: data.status,
            note: redact(data.note),
          },
        },
      },
      { returnDocument: 'after' },
    );
    if (!updated) throw new HttpError(409, 'This report changed. Refresh before updating it.');
    res.json(view(updated, req.user!));
  });
  app.put('/api/complaints/:id/review', staffOnly, async (req, res) => {
    const data = z
        .object({
          content: ContentSchema,
          department: z.enum(Object.values(departments) as [string, ...string[]]),
          note: z.string().trim().min(5).max(1000),
          version: z.number().int().positive(),
        })
        .strict()
        .parse(req.body),
      complaint = await getComplaint(req),
      at = new Date().toISOString(),
      content = cleanContent(data.content);
    const feedback: Feedback[] = [];
    if (complaint.content.category !== content.category)
      feedback.push({
        id: randomUUID(),
        at,
        kind: 'category_correction',
        before: complaint.content.category,
        after: content.category,
      });
    const changed = contentHash(content) !== complaint.contentHash;
    const updated = await c.complaints.findOneAndUpdate(
      { _id: complaint._id, version: data.version },
      {
        $set: {
          content,
          department: data.department,
          reviewed: true,
          updatedAt: at,
          contentHash: contentHash(content),
          ...(changed ? { indexState: 'pending' as const, indexAttempts: 0 } : {}),
        },
        ...(changed
          ? {
              $unset: {
                embedding: '' as const,
                indexToken: '' as const,
                indexLeaseUntil: '' as const,
              },
            }
          : {}),
        $inc: { version: 1 },
        $push: {
          timeline: {
            id: randomUUID(),
            at,
            kind: 'review',
            actorRole: 'staff',
            actorId: req.user!._id,
            status: complaint.status,
            note: redact(data.note),
            decision: { category: content.category, department: data.department },
            previousContent: complaint.content,
          },
          feedback: { $each: feedback },
        },
      },
      { returnDocument: 'after' },
    );
    if (!updated) throw new HttpError(409, 'This report changed. Refresh before reviewing it.');
    res.json(view(updated, req.user!));
  });
  app.post('/api/complaints/:id/duplicate', staffOnly, async (req, res) => {
    const data = z
        .object({
          targetId: id,
          version: z.number().int().positive(),
          note: z.string().trim().min(5).max(1000),
        })
        .strict()
        .parse(req.body),
      complaint = await getComplaint(req),
      target = await c.complaints.findOne({ _id: data.targetId, municipality: MUNICIPALITY });
    if (!target || target._id === complaint._id)
      throw new HttpError(400, 'Choose a different existing incident.');
    if (complaint.duplicateOf === target._id) return res.json(view(complaint, req.user!));
    // Monotonic ordering prevents cycles even if two staff members link concurrently.
    if (`${target.createdAt}:${target._id}` >= `${complaint.createdAt}:${complaint._id}`)
      throw new HttpError(409, 'Link a newer report to an earlier incident.');
    const at = new Date().toISOString(),
      updated = await c.complaints.findOneAndUpdate(
        { _id: complaint._id, version: data.version },
        {
          $set: { duplicateOf: target._id, updatedAt: at },
          $inc: { version: 1 },
          $push: {
            timeline: {
              id: randomUUID(),
              at,
              kind: 'duplicate',
              actorRole: 'staff',
              actorId: req.user!._id,
              status: complaint.status,
              note: `Linked to incident ${target._id.slice(0, 8)}. ${redact(data.note)}`,
            },
          },
        },
        { returnDocument: 'after' },
      );
    if (!updated) throw new HttpError(409, 'This report changed. Refresh and try again.');
    res.json(view(updated, req.user!));
  });
  app.post('/api/feedback/duplicate', async (req, res) => {
    const data = z
      .object({
        candidateId: id,
        reason: z.string().trim().min(3).max(500),
        complaintId: id.optional(),
        query: z
          .object({
            content: ContentSchema,
            location: LocationSchema,
            observedAt: z.string().datetime().nullable(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .parse(req.body);
    const candidate = await c.complaints.findOne({ _id: data.candidateId });
    if (!candidate) throw new HttpError(404, 'Candidate not found.');
    const entry: Feedback = {
      id: randomUUID(),
      at: new Date().toISOString(),
      kind: 'duplicate_rejected',
      candidateId: data.candidateId,
      reason: redact(data.reason),
      rankVersion: RANK_VERSION,
      candidateSnapshot: {
        content: candidate.content,
        location: candidate.location,
        status: candidate.status,
        contentHash: candidate.contentHash,
      },
      ...(data.query
        ? {
            query: {
              ...data.query,
              content: cleanContent(data.query.content),
              location: {
                ...data.query.location,
                label: redact(data.query.location.label),
                assetId: redact(data.query.location.assetId),
              },
            },
          }
        : {}),
    };
    if (data.complaintId) {
      const complaint = await c.complaints.findOne({ _id: data.complaintId });
      if (!complaint) throw new HttpError(404, 'Report not found.');
      if (req.user!.role !== 'staff' && complaint.ownerId !== req.user!._id)
        throw new HttpError(403, 'You cannot add feedback to this report.');
      entry.query = {
        content: complaint.content,
        location: complaint.location,
        observedAt: complaint.observedAt,
      };
      await c.complaints.updateOne({ _id: complaint._id }, { $push: { feedback: entry } });
    } else await db.collection('feedback').insertOne({ ...entry, ownerId: req.user!._id });
    res.status(201).json({ saved: true });
  });
  app.get('/api/staff/metrics', staffOnly, async (_req, res) => {
    const [statuses, operations, indexing] = await Promise.all([
      c.complaints.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]).toArray(),
      db
        .collection('aiRuns')
        .aggregate([
          {
            $group: {
              _id: { kind: '$kind', outcome: '$outcome' },
              count: { $sum: 1 },
              estimatedCostUsd: { $sum: '$estimatedCostUsd' },
              meanLatencyMs: { $avg: '$latencyMs' },
            },
          },
        ])
        .toArray(),
      c.complaints.aggregate([{ $group: { _id: '$indexState', count: { $sum: 1 } } }]).toArray(),
    ]);
    res.json({ statuses, operations, indexing });
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'API endpoint not found.' }));
  if (config.NODE_ENV === 'production') {
    app.use(express.static(resolve('dist/client')));
    app.get('/{*path}', (_req, res) => res.sendFile(resolve('dist/client/index.html')));
  }
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof ZodError)
      return res.status(400).json({
        error: 'Check the supplied fields.',
        fields: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
    if (error instanceof AIError)
      return res.status(503).json({
        error: 'Drafting is unavailable right now. You can write and submit your report manually.',
        code: error.outcome,
      });
    if (error instanceof multer.MulterError)
      return res.status(400).json({ error: 'Choose one photo under 5 MB.' });
    if ((error as { code?: number }).code === 11000)
      return res.status(409).json({ error: 'That account or request already exists.' });
    if ((error as { type?: string }).type === 'entity.too.large')
      return res.status(413).json({ error: 'The request is too large.' });
    if (error instanceof SyntaxError)
      return res.status(400).json({ error: 'The request could not be read.' });
    console.error('Request failed', error instanceof Error ? error.name : 'unknown');
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  });
  return { app, ai };
}
