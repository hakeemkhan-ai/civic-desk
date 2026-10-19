import { MongoClient, type Db } from 'mongodb';
import type { Content, Draft, Report, Status, TimelineEvent } from '../shared/domain.js';
import { config } from './config.js';
export type User = {
  _id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: 'resident' | 'staff';
};
export type Feedback = {
  id: string;
  at: string;
  kind: 'draft_edit' | 'category_correction' | 'duplicate_rejected';
  before?: unknown;
  after?: unknown;
  candidateId?: string;
  reason?: string;
  query?: { content: Content; location: Report['location']; observedAt: string | null };
  candidateSnapshot?: {
    content: Content;
    location: Report['location'];
    status: Status;
    contentHash: string;
  };
  rankVersion?: string;
};
export type Complaint = {
  _id: string;
  municipality: string;
  ownerId: string;
  submissionKey: string;
  requestHash: string;
  original: Report;
  aiSuggestion: Draft | null;
  draftId: string | null;
  content: Content;
  location: Report['location'];
  observedAt: string | null;
  status: Status;
  createdAt: string;
  updatedAt: string;
  version: number;
  synthetic: boolean;
  departmentSuggestion: string;
  directoryVersion: string;
  department: string | null;
  reviewed: boolean;
  timeline: TimelineEvent[];
  feedback: Feedback[];
  followers: string[];
  duplicateOf: string | null;
  photoId: string | null;
  contentHash: string;
  embedding?: {
    vector: number[];
    model: string;
    version: string;
    dimensions: number;
    hash: string;
  };
  indexState: 'pending' | 'processing' | 'ready' | 'failed';
  indexAttempts: number;
  indexLeaseUntil?: Date;
  indexToken?: string;
};
export type DraftRecord = {
  _id: string;
  ownerId: string;
  original: Report;
  suggestion: Draft;
  createdAt: Date;
  promptVersion: string;
  schemaVersion: string;
  model: string;
};
export function collections(db: Db) {
  return {
    users: db.collection<User>('users'),
    complaints: db.collection<Complaint>('complaints'),
    drafts: db.collection<DraftRecord>('drafts'),
    sessions: db.collection<{ _id: string; userId: string; expiresAt: Date }>('sessions'),
    uploads: db.collection<{ _id: string; ownerId: string; data: Buffer; createdAt: Date }>(
      'uploads',
    ),
  };
}
export async function initialize(db: Db) {
  const c = collections(db);
  await Promise.all([
    c.users.createIndex({ email: 1 }, { unique: true }),
    c.sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    c.complaints.createIndex({ ownerId: 1, submissionKey: 1 }, { unique: true }),
    c.complaints.createIndex({ municipality: 1, status: 1, createdAt: -1 }),
    c.complaints.createIndex({ indexState: 1, indexLeaseUntil: 1 }),
    c.complaints.createIndex({ 'content.title': 'text', 'content.description': 'text' }),
    db
      .collection('aiRuns')
      .createIndex({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 }),
  ]);
}
export async function connect() {
  const client = new MongoClient(config.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
    promoteBuffers: true,
  });
  await client.connect();
  const db = client.db();
  await initialize(db);
  return { client, db };
}
