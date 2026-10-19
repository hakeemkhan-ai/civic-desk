import { randomUUID, createHash } from 'node:crypto';
import {
  departments,
  DIRECTORY_VERSION,
  MUNICIPALITY,
  transitions,
  type Content,
  type Report,
  type ComplaintView,
  type Status,
} from '../shared/domain.js';
import { redact } from './privacy.js';
import type { Complaint, User, DraftRecord } from './db.js';
export const digest = (data: unknown) =>
  createHash('sha256').update(JSON.stringify(data)).digest('hex');
export function embeddingText(content: Content) {
  return redact(`${content.title}\n${content.description}`).replace(/\s+/g, ' ').trim();
}
export const contentHash = (content: Content) => digest(embeddingText(content));
export function cleanContent(content: Content): Content {
  return { ...content, title: redact(content.title), description: redact(content.description) };
}
export function newComplaint(
  ownerId: string,
  key: string,
  requestHash: string,
  original: Report,
  content: Content,
  draft: DraftRecord | null,
  photoId: string | null,
): Complaint {
  const at = new Date().toISOString();
  content = cleanContent(content);
  return {
    _id: randomUUID(),
    municipality: MUNICIPALITY,
    ownerId,
    submissionKey: key,
    requestHash,
    original,
    aiSuggestion: draft?.suggestion ?? null,
    draftId: draft?._id ?? null,
    content,
    location: {
      ...original.location,
      label: redact(original.location.label),
      assetId: redact(original.location.assetId),
    },
    observedAt: original.observedAt,
    status: 'submitted',
    createdAt: at,
    updatedAt: at,
    version: 1,
    synthetic: false,
    departmentSuggestion: departments[draft?.suggestion.categorySuggestion ?? content.category],
    directoryVersion: DIRECTORY_VERSION,
    department: null,
    reviewed: false,
    timeline: [
      {
        id: randomUUID(),
        at,
        kind: 'submitted',
        actorRole: 'resident',
        actorId: ownerId,
        status: 'submitted',
        note: 'Report submitted by a resident.',
      },
    ],
    feedback: draft
      ? [{ id: randomUUID(), at, kind: 'draft_edit', before: draft.suggestion, after: content }]
      : [],
    followers: [],
    duplicateOf: null,
    photoId,
    contentHash: contentHash(content),
    indexState: 'pending',
    indexAttempts: 0,
  };
}
export function canTransition(from: Status, to: Status, reviewed: boolean) {
  return transitions[from].includes(to) && (to !== 'assigned' || reviewed);
}
export function view(c: Complaint, user: User): ComplaintView {
  const privileged = user.role === 'staff' || user._id === c.ownerId;
  return {
    id: c._id,
    content: c.content,
    location: c.location,
    observedAt: c.observedAt,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    status: c.status,
    version: c.version,
    synthetic: c.synthetic,
    departmentSuggestion: c.departmentSuggestion,
    department: c.department,
    reviewed: c.reviewed,
    timeline: c.timeline.map(({ previousContent, actorId, ...event }) =>
      privileged
        ? { ...event, previousContent, ...(user.role === 'staff' ? { actorId } : {}) }
        : event,
    ),
    duplicateOf: c.duplicateOf,
    following: c.followers.includes(user._id),
    isOwner: c.ownerId === user._id,
    ...(privileged
      ? {
          photoId: c.photoId ?? undefined,
          original: c.original,
          aiSuggestion: c.aiSuggestion,
          feedback: c.feedback,
        }
      : {}),
  };
}
