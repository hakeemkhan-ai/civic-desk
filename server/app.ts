import { preparePhoto } from './uploads.js';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
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
import { collections, type Feedback } from './db.js';
import {
  authenticate,
  sessionToken,
  clearSessionCookie,
  createSession,
  hashToken,
  userView,
} from './auth.js';
import {
  HttpError,
  json,
  readJson,
  readPhoto,
  responseHeaders,
  type ApiContext,
  type Route,
  RateLimiter,
  clientKey,
} from './http.js';
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
export function createApi(db: Db, provider: AIProvider | null = makeProvider()) {
  const c = collections(db);
  const ai = new AIService(db, provider);
  const routes: Route[] = [];
  function route(method: string, path: string, handle: Route['handle'], staff = false) {
    routes.push({ method, path, handle, staff });
  }
  const generalLimit = new RateLimiter(
    60000,
    150,
    'Too many requests. Please try again in a minute.',
  );
  const authLimit = new RateLimiter(
    15 * 60000,
    25,
    'Too many sign-in attempts. Try again in 15 minutes.',
  );
  const aiLimit = new RateLimiter(
    60000,
    10,
    'Please wait a minute before requesting more suggestions.',
  );
  const uploadLimit = new RateLimiter(
    3600000,
    20,
    'Too many uploads. Please try again in an hour.',
  );
  route('GET', '/api/health', async (_req) => {
    await db.command({ ping: 1 });
    return json({ ok: true });
  });
  route('GET', '/api/config', (_req) =>
    json({
      municipality: 'Hyderabad',
      demonstration: true,
      categories,
      statuses,
      departments,
      directoryVersion: DIRECTORY_VERSION,
      draftingAvailable: !!provider,
    }),
  );
  route('POST', '/api/auth/register', async (req) => {
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
    const cookie = await createSession(db, user._id);
    return json(userView(user), 201, { 'Set-Cookie': cookie });
  });
  route('POST', '/api/auth/login', async (req) => {
    const data = accountSchema.parse(req.body),
      user = await c.users.findOne({ email: data.email });
    const valid = await bcrypt.compare(
      data.password,
      user?.passwordHash ?? '$2b$12$1wDSBTXN0mBnZtkdn.oqBOWGmIJejZOKcLPU8xVHQYjHr1zR9naQK',
    );
    if (!user || !valid) throw new HttpError(401, 'Email or password is incorrect.');
    const cookie = await createSession(db, user._id);
    return json(userView(user), 200, { 'Set-Cookie': cookie });
  });
  route('POST', '/api/auth/logout', async (req) => {
    const token = sessionToken(req.request);
    if (token) await c.sessions.deleteOne({ _id: hashToken(token) });
    return new Response(null, { status: 204, headers: { 'Set-Cookie': clearSessionCookie() } });
  });
  route('GET', '/api/auth/me', (req) => json(userView(req.user!)));
  route('POST', '/api/drafts', async (req) => {
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
    return json({ id: draft._id, suggestion }, 201);
  });
  route('POST', '/api/duplicates', async (req) => {
    const data = z
      .object({
        original: ReportSchema,
        content: ContentSchema,
        strategy: z.enum(['keyword', 'embedding', 'hybrid']).default('hybrid'),
        excludeComplaintId: z.string().uuid().optional(),
      })
      .strict()
      .parse(req.body);
    return json(
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
  route('POST', '/api/uploads', async (req) => {
    uploadLimit.check(req.user!._id);
    const bytes = await readPhoto(req.request);
    let data: Buffer;
    try {
      data = await preparePhoto(bytes);
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
    return json({ id: photoId }, 201);
  });
  route('GET', '/api/uploads/:id', async (req) => {
    const photo = await c.uploads.findOne({ _id: id.parse(req.params.id) });
    if (!photo) throw new HttpError(404, 'Photo not found.');
    if (req.user!.role !== 'staff' && photo.ownerId !== req.user!._id)
      throw new HttpError(403, 'This photo is private.');
    return new Response(new Uint8Array(photo.data), {
      headers: { 'Cache-Control': 'private, no-store', 'Content-Type': 'image/jpeg' },
    });
  });
  route('POST', '/api/complaints', async (req) => {
    const key = id.parse(req.request.headers.get('Idempotency-Key')),
      data = createSchema.parse(req.body),
      requestHash = digest(data),
      existing = await c.complaints.findOne({ ownerId: req.user!._id, submissionKey: key });
    if (existing) {
      if (existing.requestHash !== requestHash)
        throw new HttpError(409, 'This submission key was already used for different content.');
      return json(view(existing, req.user!));
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
      return json(view(saved, req.user!));
    }
    return json(view(complaint, req.user!), 201);
  });
  route('GET', '/api/complaints', async (req) => {
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
    return json({ items: items.map((item) => view(item, req.user!)), total, page: q.page });
  });
  async function getComplaint(req: ApiContext) {
    const complaint = await c.complaints.findOne({
      _id: id.parse(req.params.id),
      municipality: MUNICIPALITY,
    });
    if (!complaint) throw new HttpError(404, 'Report not found.');
    return complaint;
  }
  route('GET', '/api/complaints/:id', async (req) =>
    json(view(await getComplaint(req), req.user!)),
  );
  route('PUT', '/api/complaints/:id/follow', async (req) => {
    const complaint = await getComplaint(req);
    await c.complaints.updateOne(
      { _id: complaint._id },
      { $addToSet: { followers: req.user!._id } },
    );
    return json({ following: true });
  });
  route('DELETE', '/api/complaints/:id/follow', async (req) => {
    const complaint = await getComplaint(req);
    await c.complaints.updateOne({ _id: complaint._id }, { $pull: { followers: req.user!._id } });
    return json({ following: false });
  });
  route('POST', '/api/complaints/:id/status', async (req) => {
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
    return json(view(updated, req.user!));
  }, true);
  route('PUT', '/api/complaints/:id/review', async (req) => {
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
    return json(view(updated, req.user!));
  }, true);
  route('POST', '/api/complaints/:id/duplicate', async (req) => {
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
    if (complaint.duplicateOf === target._id) return json(view(complaint, req.user!));
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
    return json(view(updated, req.user!));
  }, true);
  route('POST', '/api/feedback/duplicate', async (req) => {
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
    return json({ saved: true }, 201);
  });
  route('GET', '/api/staff/metrics', async (_req) => {
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
    return json({ statuses, operations, indexing });
  }, true);
  async function handle(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const pathname = url.pathname.replace(/\/$/, '');
      const key = clientKey(request);
      if (
        !['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
        (request.headers.get('X-Civic-Request') !== '1' ||
          (request.headers.has('origin') && request.headers.get('origin') !== config.APP_ORIGIN))
      )
        throw new HttpError(403, 'This request could not be verified. Refresh and try again.');
      const publicRoute =
        (['GET', 'HEAD'].includes(request.method) &&
          ['/api/health', '/api/config'].includes(pathname)) ||
        (request.method === 'POST' &&
          ['/api/auth/register', '/api/auth/login', '/api/auth/logout'].includes(pathname));
      // Native requests expose no socket address. Verified users get their own
      // bucket; unverified traffic uses only explicitly trusted proxy identity.
      let user;
      if (!publicRoute) {
        // Stop repeated rejected credentials before another MongoDB lookup.
        generalLimit.assertAllowed(key);
        try {
          user = await authenticate(db, request);
        } catch (error) {
          generalLimit.check(key);
          throw error;
        }
      }
      generalLimit.check(user ? `user:${user._id}` : key);
      const parts = pathname.split('/');
      const matched = routes.find((candidate) => {
        if (candidate.method !== (request.method === 'HEAD' ? 'GET' : request.method)) return false;
        const names = candidate.path.split('/');
        return (
          names.length === parts.length &&
          names.every((part, i) => part.startsWith(':') || part === parts[i])
        );
      });
      if (!matched) throw new HttpError(404, 'API endpoint not found.');
      if (matched.staff && user?.role !== 'staff')
        throw new HttpError(403, 'Staff access is required.');
      if (['/api/auth/register', '/api/auth/login'].includes(matched.path)) authLimit.check(key);
      if (['/api/drafts', '/api/duplicates'].includes(matched.path)) aiLimit.check(user!._id);
      const params: Record<string, string> = {};
      matched.path.split('/').forEach((part, i) => {
        if (part.startsWith(':')) params[part.slice(1)] = decodeURIComponent(parts[i]);
      });
      const query: Record<string, string | string[]> = Object.create(null);
      for (const [name, value] of url.searchParams) {
        const previous = query[name];
        query[name] = previous === undefined
          ? value
          : [...(Array.isArray(previous) ? previous : [previous]), value];
      }
      const body = matched.path === '/api/uploads' ? undefined : await readJson(request);
      const result = await matched.handle({ request, user, params, query, body });
      return new Response(request.method === 'HEAD' ? null : result.body, {
        status: result.status,
        headers: responseHeaders(result.headers),
      });
    } catch (error) {
      let result: Response;
      if (error instanceof ZodError) {
        result = json({
          error: 'Check the supplied fields.',
          fields: error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        }, 400);
      } else if (error instanceof HttpError) {
        result = json({ error: error.message }, error.status, error.headers);
      } else if (error instanceof AIError) {
        result = json({
          error: 'Drafting is unavailable right now. You can write and submit your report manually.',
          code: error.outcome,
        }, 503);
      } else if ((error as { code?: number })?.code === 11000) {
        result = json({ error: 'That account or request already exists.' }, 409);
      } else if (error instanceof SyntaxError || error instanceof URIError) {
        result = json({ error: 'The request could not be read.' }, 400);
      } else {
        console.error('Request failed', error instanceof Error ? error.name : 'unknown');
        result = json({ error: 'Something went wrong. Please try again.' }, 500);
      }
      return new Response(request.method === 'HEAD' ? null : result.body, {
        status: result.status,
        headers: responseHeaders(result.headers),
      });
    }
  }
  return { handle, ai };
}
