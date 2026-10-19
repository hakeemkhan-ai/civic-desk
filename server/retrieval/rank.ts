import type { Category, Location, Status } from '../../shared/domain.js';
export const RANK_VERSION = 'incident-rules-v2';
export type Incident = {
  text: string;
  location: Location;
  category: Category | null;
  observedAt: string | null;
  createdAt: string;
  status: Status;
  resolvedAt?: string | null;
};
export function cosine(a: number[], b: number[]) {
  if (a.length !== b.length || !a.length) throw new Error('Incompatible embeddings');
  let dot = 0,
    aa = 0,
    bb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    aa += a[i] ** 2;
    bb += b[i] ** 2;
  }
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
}
const stop = new Set([
  'the',
  'a',
  'an',
  'is',
  'on',
  'at',
  'in',
  'of',
  'and',
  'to',
  'it',
  'there',
  'has',
  'been',
  'for',
  'near',
  'please',
  'this',
  'with',
  'from',
  'are',
]);
export function tokens(s: string) {
  return new Set(
    s
      .toLowerCase()
      .match(/[a-z0-9]+/g)
      ?.filter((t) => !stop.has(t)) ?? [],
  );
}
export function keyword(a: string, b: string) {
  const x = tokens(a),
    y = tokens(b);
  const intersection = [...x].filter((t) => y.has(t)).length;
  return intersection / (x.size + y.size - intersection || 1);
}
export function distance(a: Location, b: Location) {
  if (a.lat === null || a.lng === null || b.lat === null || b.lng === null) return null;
  const rad = Math.PI / 180,
    dLat = (b.lat - a.lat) * rad,
    dLng = (b.lng - a.lng) * rad;
  const v =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(v), Math.sqrt(Math.max(0, 1 - v)));
}
const norm = (s: string) =>
  s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]/gu, '');
export function rank(query: Incident, candidate: Incident, similarity: number) {
  const d = distance(query.location, candidate.location),
    exact = query.location.precision === 'exact' && candidate.location.precision === 'exact';
  const queryAsset = norm(query.location.assetId),
    candidateAsset = norm(candidate.location.assetId);
  const sameAsset = !!queryAsset && !!candidateAsset && queryAsset === candidateAsset;
  const differentAsset = !!query.location.assetId && !!candidate.location.assetId && !sameAsset;
  const sameLabel =
    norm(query.location.label).length >= 5 &&
    norm(query.location.label) === norm(candidate.location.label);
  const placeKnown = exact && (sameAsset || sameLabel || (d !== null && d <= 40));
  const far = d !== null && d > (exact ? 120 : 500);
  const categoryCompatible =
    !query.category ||
    !candidate.category ||
    query.category === candidate.category ||
    [query.category, candidate.category].every((c) => c === 'water' || c === 'drainage');
  const qTime = Date.parse(query.observedAt ?? query.createdAt),
    cTime = Date.parse(candidate.observedAt ?? candidate.createdAt),
    days = Math.abs(qTime - cTime) / 86400000;
  const recurring =
    candidate.status === 'resolved' &&
    (!query.observedAt || !candidate.resolvedAt || qTime > Date.parse(candidate.resolvedAt));
  const reasons: string[] = [];
  if (!placeKnown) reasons.push('The location needs confirmation.');
  if (far) reasons.push('The reported locations are too far apart.');
  if (differentAsset) reasons.push('Different asset identifiers were reported.');
  if (recurring) reasons.push('This may be a new occurrence after resolution.');
  if (!categoryCompatible) reasons.push('The categories describe different services.');
  const loc = sameAsset ? 1 : placeKnown ? 0.9 : d !== null && d <= 120 ? 0.55 : 0.15;
  const time = Math.exp(-days / 30),
    active = candidate.status === 'resolved' ? 0.15 : 1;
  const score = Math.max(
    0,
    Math.min(
      1,
      0.6 * similarity +
        0.22 * loc +
        0.08 * time +
        0.05 * (categoryCompatible ? 1 : 0) +
        0.05 * active,
    ),
  );
  return {
    score,
    eligible:
      placeKnown && !far && !differentAsset && !recurring && categoryCompatible && days <= 90,
    signals: {
      location:
        d === null
          ? sameLabel
            ? 'Same reported landmark'
            : 'Distance unknown'
          : `${Math.round(d)} m apart (${exact ? 'precise' : 'approximate'} reports)`,
      time: `${Math.round(days)} days between reports${query.observedAt && candidate.observedAt ? '' : ' (submission time used where unknown)'}`,
      category: categoryCompatible
        ? 'Compatible service categories'
        : 'Different service categories',
      status: candidate.status === 'resolved' ? 'Previously resolved' : 'Open incident',
    },
    reasons,
  };
}
