import type { Draft } from '../shared/domain.js';
import type { Example } from './dataset.js';
export function retrievalMetrics(
  rows: { relevant: string[]; candidates: string[]; suggestions: string[] }[],
) {
  let tp = 0,
    fp = 0,
    fn = 0,
    recallSum = 0,
    positive = 0;
  for (const row of rows) {
    const wanted = new Set(row.relevant);
    if (wanted.size) {
      positive++;
      recallSum += row.candidates.filter((x) => wanted.has(x)).length / wanted.size;
    }
    tp += row.suggestions.filter((x) => wanted.has(x)).length;
    fp += row.suggestions.filter((x) => !wanted.has(x)).length;
    fn += row.relevant.filter((x) => !row.suggestions.includes(x)).length;
  }
  return {
    candidateRecallAt5: positive ? recallSum / positive : null,
    precision: tp + fp ? tp / (tp + fp) : null,
    recall: tp + fn ? tp / (tp + fn) : null,
    tp,
    fp,
    fn,
    positiveQueries: positive,
    queries: rows.length,
  };
}
export function draftChecks(d: Draft, e: Example) {
  const output = `${d.title} ${d.description}`.toLowerCase(),
    input = `${e.report.notes} ${e.report.location.label}`.toLowerCase();
  const facts = e.facts.filter((f) => output.includes(f.toLowerCase())).length;
  const unsupportedNumbers = (output.match(/\b\d+(?:\.\d+)?\b/g) ?? []).filter(
    (n) => !input.includes(n),
  );
  const unsupportedEvidence = d.extractedFacts.filter(
    (f) => !input.includes(f.evidence.toLowerCase()),
  ).length;
  const fields = d.missingInformation.map((q) => q.field);
  return {
    factChecks: e.facts.length,
    factsPreserved: facts,
    unsupportedNumbers: unsupportedNumbers.length,
    unsupportedEvidence,
    missingExpected: e.missing.length,
    missingDetected: e.missing.filter((f) => fields.includes(f)).length,
    extraQuestions: fields.filter((f) => !e.missing.includes(f)).length,
    categoryCorrect: d.categorySuggestion === e.expectedCategory,
  };
}
export function percentile(values: number[], p: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? null;
}
