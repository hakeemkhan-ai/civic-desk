import { describe, it, expect } from 'vitest';
import { AIService } from '../server/ai/service.js';
import { AIError, type AIProvider } from '../server/ai/provider.js';
import { redact } from '../server/privacy.js';
import type { Db } from 'mongodb';
import { templateDraft } from '../evaluation/dataset.js';
import type { Report } from '../shared/domain.js';
const report: Report = {
  notes: 'Pothole noticed 2026-08-01. Contact person@example.com',
  location: {
    label: 'Maple Street',
    area: 'north',
    precision: 'exact',
    lat: null,
    lng: null,
    assetId: '',
  },
  observedAt: null,
};
// Explicit offline metadata-sink mock. These are not database or live-provider tests.
function sink(allow = true) {
  const records: Record<string, unknown>[] = [];
  const db = {
    collection: (name: string) =>
      name === 'aiBudgets'
        ? {
            updateOne: async (_filter: unknown, update: Record<string, unknown>) => ({
              modifiedCount: !update.$inc || allow ? 1 : 0,
            }),
          }
        : {
            insertOne: async (record: Record<string, unknown>) => {
              records.push(record);
            },
          },
  } as unknown as Db;
  return { db, records };
}
describe('offline AI failure contracts (mock provider and metadata sink)', () => {
  it.each(['timeout', 'refusal', 'incomplete', 'invalid', 'provider_error'] as const)(
    'records %s without leaking report contents',
    async (outcome) => {
      const { db, records } = sink(),
        provider: AIProvider = {
          draft: async () => {
            throw new AIError(outcome);
          },
          embed: async () => {
            throw new AIError(outcome);
          },
        },
        ai = new AIService(db, provider);
      await expect(ai.draft(report)).rejects.toMatchObject({ outcome });
      expect(records[0]).toMatchObject({ outcome, kind: 'draft' });
      expect(JSON.stringify(records)).not.toContain(report.notes);
      expect(JSON.stringify(records)).not.toContain('person@example.com');
    },
  );
  it('does not invoke a provider when the budget is exhausted', async () => {
    const { db, records } = sink(false);
    let calls = 0;
    const ai = new AIService(db, {
      draft: async () => {
        calls++;
        return {
          value: templateDraft(report),
          usage: { input: 10, output: 20 },
          model: 'test-model',
        };
      },
      embed: async () => {
        throw new Error();
      },
    });
    await expect(ai.draft(report)).rejects.toMatchObject({ outcome: 'budget' });
    expect(calls).toBe(0);
    expect(records[0].outcome).toBe('budget');
  });
  it('records usage, cost, prompt, latency, and sanitized provider input', async () => {
    const { db, records } = sink();
    let input: Report | undefined;
    const ai = new AIService(db, {
      draft: async (r) => {
        input = r;
        return {
          value: templateDraft(r),
          usage: { input: 100, output: 50 },
          model: 'fixture-model',
        };
      },
      embed: async () => {
        throw new Error();
      },
    });
    await ai.draft(report);
    expect(input!.notes).not.toContain('person@example.com');
    expect(input!.notes).toContain('2026-08-01');
    expect(records[0]).toMatchObject({
      outcome: 'success',
      model: 'fixture-model',
      promptVersion: 'complaint-draft-v2',
      usage: { input: 100, output: 50 },
    });
    expect(records[0].estimatedCostUsd).toBeGreaterThan(0);
  });
  it('makes unconfigured AI explicit without synthesizing a draft', async () => {
    const { db, records } = sink();
    await expect(new AIService(db, null).draft(report)).rejects.toMatchObject({
      outcome: 'unavailable',
    });
    expect(records[0].outcome).toBe('unavailable');
  });
});
describe('contact redaction', () => {
  it('preserves reported ISO dates and removes common phone and email formats', () => {
    expect(redact('Observed 2026-08-01 10:30; call +1 (202) 555-0182 or a@b.example')).toBe(
      'Observed 2026-08-01 10:30; call [contact removed] or [contact removed]',
    );
  });
});
