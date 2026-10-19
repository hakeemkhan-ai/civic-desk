import type { Db } from 'mongodb';
import {
  MUNICIPALITY,
  type Report,
  type Content,
  type DuplicateResult,
} from '../../shared/domain.js';
import { collections, type Complaint, type User } from '../db.js';
import { embeddingText, view } from '../complaints.js';
import { config } from '../config.js';
import type { AIService } from '../ai/service.js';
import { cosine, keyword, rank, type Incident } from './rank.js';
export const EMBEDDING_VERSION = 'embedding-text-v1';
export function asIncident(c: Complaint): Incident {
  return {
    text: embeddingText(c.content),
    location: c.location,
    category: c.content.category,
    observedAt: c.observedAt,
    createdAt: c.createdAt,
    status: c.status,
    resolvedAt: [...c.timeline].reverse().find((t) => t.status === 'resolved')?.at,
  };
}
export function atlasPipeline(vector: number[]) {
  return [
    {
      $vectorSearch: {
        index: config.ATLAS_VECTOR_INDEX,
        path: 'embedding.vector',
        queryVector: vector,
        numCandidates: 400,
        limit: 40,
        filter: {
          municipality: MUNICIPALITY,
          'embedding.model': config.EMBEDDING_MODEL,
          'embedding.version': EMBEDDING_VERSION,
          'embedding.dimensions': config.EMBEDDING_DIMENSIONS,
          indexState: 'ready',
        },
      },
    },
    { $project: { _id: 1 } },
  ];
}
export async function findDuplicates(
  db: Db,
  ai: AIService,
  report: Report,
  content: Content,
  user: User,
  requested: 'keyword' | 'embedding' | 'hybrid' = 'hybrid',
  excludeComplaintId?: string,
): Promise<DuplicateResult> {
  const c = collections(db).complaints,
    total = await c.countDocuments({ municipality: MUNICIPALITY });
  const indexed = await c.countDocuments({
    municipality: MUNICIPALITY,
    indexState: 'ready',
    'embedding.model': config.EMBEDDING_MODEL,
    'embedding.version': EMBEDDING_VERSION,
    'embedding.dimensions': config.EMBEDDING_DIMENSIONS,
  });
  let mode: DuplicateResult['mode'] = 'keyword',
    notice = 'Word matching only. Semantic matching is unavailable.',
    vector: number[] | null = null,
    pool: Complaint[] = [];
  if (requested !== 'keyword' && indexed > 0) {
    try {
      vector = await ai.embed(embeddingText(content));
      mode = config.RETRIEVAL_MODE === 'atlas' ? 'semantic-atlas' : 'semantic-exact';
      notice = 'Compare the location and details before following an incident.';
    } catch {
      notice = 'Semantic matching is temporarily unavailable. These results use word matching.';
    }
  }
  if (vector && config.RETRIEVAL_MODE === 'atlas') {
    try {
      const ids = await c.aggregate<{ _id: string }>(atlasPipeline(vector)).toArray();
      pool = await c.find({ _id: { $in: ids.map((x) => x._id) }, indexState: 'ready' }).toArray();
    } catch {
      vector = null;
      mode = 'keyword';
      notice = 'Semantic search is unavailable. These results use word matching.';
    }
  }
  if (!vector || config.RETRIEVAL_MODE === 'exact')
    pool = await c
      .find({ municipality: MUNICIPALITY })
      .sort({ createdAt: -1 })
      .limit(2000)
      .toArray();
  const query: Incident = {
    text: embeddingText(content),
    location: report.location,
    category: content.category,
    observedAt: report.observedAt,
    createdAt: new Date().toISOString(),
    status: 'submitted',
  };
  const candidates = pool
    .filter((complaint) => complaint._id !== excludeComplaintId)
    .flatMap((complaint) => {
      if (
        vector &&
        (!complaint.embedding ||
          complaint.embedding.hash !== complaint.contentHash ||
          complaint.embedding.model !== config.EMBEDDING_MODEL ||
          complaint.embedding.version !== EMBEDDING_VERSION ||
          complaint.embedding.vector.length !== vector.length ||
          complaint.indexState !== 'ready')
      )
        return [];
      const similarity = vector
        ? cosine(vector, complaint.embedding!.vector)
        : keyword(query.text, embeddingText(complaint.content));
      const ranked = rank(query, asIncident(complaint), similarity);
      const score = requested === 'embedding' ? similarity : vector ? ranked.score : similarity;
      return [
        {
          complaint: view(complaint, user),
          similarity,
          score,
          signals: ranked.signals,
          reasons: ranked.reasons,
          suggested:
            ranked.eligible &&
            score >= (vector ? config.DUPLICATE_THRESHOLD : config.KEYWORD_THRESHOLD),
        },
      ];
    })
    .filter((x) => x.similarity > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  return {
    mode,
    notice,
    candidates,
    coverage: {
      indexed,
      total,
      limited: (!vector || config.RETRIEVAL_MODE === 'exact') && total > 2000,
    },
  };
}
