import { z } from 'zod';
export const MUNICIPALITY = 'hyderabad-demo';
export const categories = ['roads', 'waste', 'water', 'streetlights', 'drainage'] as const;
export const statuses = [
  'submitted',
  'under review',
  'assigned',
  'in progress',
  'resolved',
  'reopened',
] as const;
export type Category = (typeof categories)[number];
export type Status = (typeof statuses)[number];
export const transitions: Record<Status, readonly Status[]> = {
  submitted: ['under review'],
  'under review': ['assigned'],
  assigned: ['in progress', 'under review'],
  'in progress': ['resolved', 'under review'],
  resolved: ['reopened'],
  reopened: ['under review', 'assigned'],
};
export const DIRECTORY_VERSION = 'hyderabad-demo-departments-v1';
export const departments: Record<Category, string> = {
  roads: 'Streets & Mobility',
  waste: 'Solid Waste Services',
  water: 'Water Services',
  streetlights: 'Public Lighting',
  drainage: 'Stormwater Services',
};
export const LocationSchema = z
  .object({
    label: z.string().trim().max(200),
    area: z.enum(['north', 'central', 'south', 'unknown']),
    precision: z.enum(['exact', 'approximate', 'unknown']),
    lat: z.number().min(-90).max(90).nullable(),
    lng: z.number().min(-180).max(180).nullable(),
    assetId: z.string().trim().max(80).default(''),
  })
  .strict()
  .refine((v) => (v.lat === null) === (v.lng === null), 'Provide both coordinates or neither');
export const ContentSchema = z
  .object({
    title: z.string().trim().min(5).max(140),
    description: z.string().trim().min(10).max(4000),
    category: z.enum(categories),
  })
  .strict();
export const ReportSchema = z
  .object({
    notes: z.string().trim().min(5).max(4000),
    location: LocationSchema,
    observedAt: z.string().datetime().nullable(),
  })
  .strict();
export const DraftSchema = z
  .object({
    title: z.string(),
    description: z.string(),
    categorySuggestion: z.enum(categories).nullable(),
    extractedFacts: z.array(z.object({ fact: z.string(), evidence: z.string() })),
    missingInformation: z.array(
      z.object({ field: z.enum(['location', 'time', 'asset', 'details']), question: z.string() }),
    ),
  })
  .strict();
export type Location = z.infer<typeof LocationSchema>;
export type Content = z.infer<typeof ContentSchema>;
export type Report = z.infer<typeof ReportSchema>;
export type Draft = z.infer<typeof DraftSchema>;
export type UserView = { id: string; name: string; role: 'resident' | 'staff' };
export type TimelineEvent = {
  id: string;
  at: string;
  kind: 'submitted' | 'status' | 'review' | 'duplicate' | 'migration';
  actorRole: 'resident' | 'staff' | 'system';
  actorId?: string;
  status: Status;
  note: string;
  decision?: { category: Category; department: string };
  previousContent?: Content;
};
export type ComplaintView = {
  id: string;
  content: Content;
  location: Location;
  observedAt: string | null;
  createdAt: string;
  updatedAt: string;
  status: Status;
  version: number;
  synthetic: boolean;
  departmentSuggestion: string;
  department: string | null;
  reviewed: boolean;
  timeline: TimelineEvent[];
  duplicateOf: string | null;
  following: boolean;
  isOwner: boolean;
  photoId?: string;
  original?: Report;
  aiSuggestion?: Draft | null;
  feedback?: unknown[];
};
export type Candidate = {
  complaint: ComplaintView;
  score: number;
  similarity: number;
  signals: { location: string; time: string; category: string; status: string };
  suggested: boolean;
  reasons: string[];
};
export type DuplicateResult = {
  mode: 'keyword' | 'semantic-exact' | 'semantic-atlas';
  notice: string;
  candidates: Candidate[];
  coverage: { indexed: number; total: number; limited: boolean };
};
