import type { Category, Content, Report, Draft } from '../shared/domain.js';
import type { Incident } from '../server/retrieval/rank.js';
export const DATASET_VERSION = 'synthetic-incidents-v1';
export type Example = {
  id: string;
  group: string;
  split: 'development' | 'test';
  scenario: string;
  query: Incident;
  relevant: string[];
  report: Report;
  expectedCategory: Category;
  facts: string[];
  missing: ('location' | 'time' | 'asset' | 'details')[];
};
export type CorpusEntry = {
  id: string;
  group: string;
  split: 'development' | 'test';
  incident: Incident;
};
// Split the base incident groups BEFORE expanding them into reports. No real municipal data.
const groups = Array.from({ length: 30 }, (_, i) => ({
  id: `incident-${i}`,
  split: (i % 3 === 0 ? 'test' : 'development') as 'test' | 'development',
  category: (['roads', 'waste', 'water', 'streetlights', 'drainage'] as const)[i % 5],
  street: [
    'Maple Street',
    'Cedar Lane',
    'Oak Avenue',
    'Market Road',
    'Garden Walk',
    'Willow Street',
  ][i % 6],
  n: i,
}));
const phrases: Record<Category, [string, string, string]> = {
  roads: ['pothole beside the entrance', 'hole in the road outside the entrance', 'pothole'],
  waste: [
    'overflowing rubbish bins beside the entrance',
    'garbage containers are full outside the entrance',
    'bins',
  ],
  water: [
    'water leaking from a pipe beside the entrance',
    'water escapes from a damaged pipe outside the entrance',
    'water',
  ],
  streetlights: [
    'streetlight not working beside the entrance',
    'lamp stays dark outside the entrance',
    'light',
  ],
  drainage: [
    'blocked drain beside the entrance',
    'rainwater cannot flow through the drain outside the entrance',
    'drain',
  ],
};
export const corpus: CorpusEntry[] = groups.flatMap((g) => {
  const incident: Incident = {
    text: `${phrases[g.category][0]} on ${g.street}`,
    category: g.category,
    location: {
      label: `${g.street} entrance ${g.n}`,
      area: g.n % 2 ? 'north' : 'central',
      precision: 'exact',
      lat: 12.9 + g.n * 0.002,
      lng: 77.5,
      assetId: `BF-${g.n}`,
    },
    observedAt: '2026-08-01T10:00:00.000Z',
    createdAt: '2026-08-01T10:00:00.000Z',
    status: 'in progress',
  };
  return [
    { id: g.id, group: g.id, split: g.split, incident },
    {
      id: `${g.id}-other-street`,
      group: g.id,
      split: g.split,
      incident: {
        ...incident,
        text: `${phrases[g.category][0]} on Birch Street`,
        location: {
          ...incident.location,
          label: 'Birch Street entrance',
          lat: incident.location.lat! + 0.01,
          assetId: `OTHER-${g.n}`,
        },
      },
    },
    {
      id: `${g.id}-nearby-distinct`,
      group: g.id,
      split: g.split,
      incident: {
        ...incident,
        location: {
          ...incident.location,
          label: `${g.street} second entrance`,
          lat: incident.location.lat! + 0.0001,
          assetId: `NEAR-${g.n}`,
        },
      },
    },
    {
      id: `${g.id}-resolved`,
      group: g.id,
      split: g.split,
      incident: {
        ...incident,
        status: 'resolved',
        observedAt: '2026-05-01T10:00:00.000Z',
        createdAt: '2026-05-01T10:00:00.000Z',
        resolvedAt: '2026-05-03T10:00:00.000Z',
      },
    },
  ];
});
export const examples: Example[] = groups.flatMap((g) => {
  const base = corpus.find((c) => c.id === g.id)!.incident;
  return [
    'paraphrase',
    'vague',
    'missing-location',
    'different-street',
    'nearby-distinct',
    'recurring',
    'boundary',
    'missing-time',
  ].map((scenario, j) => {
    let query: Incident = {
      ...base,
      text: `${phrases[g.category][1]} on ${g.street}`,
      location: { ...base.location },
      observedAt: '2026-08-02T10:00:00.000Z',
      createdAt: '2026-08-02T10:00:00.000Z',
      status: 'submitted',
    };
    let relevant = [g.id],
      missing: Example['missing'] = [],
      facts = ['entrance'];
    if (scenario === 'vague') {
      query = {
        ...query,
        text: 'Something is wrong over there',
        location: {
          ...query.location,
          label: 'near the park',
          precision: 'approximate',
          assetId: '',
        },
      };
      missing = ['location', 'details'];
      facts = [];
    }
    if (scenario === 'missing-location') {
      query.location = {
        label: '',
        precision: 'unknown',
        area: 'unknown',
        lat: null,
        lng: null,
        assetId: '',
      };
      query.text = phrases[g.category][1];
      missing = ['location'];
    }
    if (scenario === 'different-street') {
      query.location = {
        ...query.location,
        label: 'Juniper Road entrance',
        lat: 13.8,
        assetId: `NEW-${g.n}`,
      };
      query.text = `${phrases[g.category][1]} on Juniper Road`;
      relevant = [];
    }
    if (scenario === 'nearby-distinct') {
      query.location = {
        ...query.location,
        label: `${g.street} third entrance`,
        lat: base.location.lat! + 0.0002,
        assetId: `THIRD-${g.n}`,
      };
      relevant = [];
    }
    if (scenario === 'recurring') {
      query.observedAt = '2026-12-01T10:00:00.000Z';
      query.createdAt = query.observedAt;
      relevant = [];
    }
    if (scenario === 'boundary') {
      query.location.area = base.location.area === 'north' ? 'central' : 'north';
      query.location.lat = base.location.lat! + 0.00005;
    }
    if (scenario === 'missing-time') {
      query.observedAt = null;
      missing = ['time'];
    }
    const report: Report = {
      notes: query.text,
      location: query.location,
      observedAt: query.observedAt,
    };
    return {
      id: `${g.id}-q${j}`,
      group: g.id,
      split: g.split,
      scenario,
      query,
      relevant,
      report,
      expectedCategory: g.category,
      facts,
      missing,
    };
  });
});
export function templateDraft(report: Report): Draft {
  return {
    title: report.notes.slice(0, 100),
    description: report.notes,
    categorySuggestion: keywordCategory(report.notes),
    extractedFacts: [{ fact: report.notes, evidence: report.notes }],
    missingInformation: [
      ...(!report.location.label || report.location.precision !== 'exact'
        ? [{ field: 'location' as const, question: 'What is the exact location?' }]
        : []),
      ...(!report.observedAt
        ? [{ field: 'time' as const, question: 'When did you notice this?' }]
        : []),
    ],
  };
}
export function keywordCategory(text: string): Category | null {
  const t = text.toLowerCase();
  const patterns: Record<Category, RegExp> = {
    roads: /pothole|road|paving/,
    waste: /rubbish|garbage|waste|bins/,
    water: /leak|pipe/,
    streetlights: /streetlight|lamp|light pole/,
    drainage: /drain|rainwater/,
  };
  return (Object.entries(patterns).find(([, re]) => re.test(t))?.[0] as Category) ?? null;
}
export const contentFor = (e: Example): Content => ({
  title: e.query.text.slice(0, 100),
  description: e.query.text,
  category: e.expectedCategory,
});
