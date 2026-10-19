import { randomUUID } from 'node:crypto';
import type { Db } from 'mongodb';
import type { Report } from '../../shared/domain.js';
import { config } from '../config.js';
import { redact } from '../privacy.js';
import { AIError, type AIProvider, type ProviderResult, type Usage } from './provider.js';
import { PROMPT_VERSION, SCHEMA_VERSION } from './prompts.js';
export function estimatedCost(kind: 'draft' | 'embedding', u: Usage) {
  return (
    (u.input *
      (kind === 'draft' ? config.DRAFT_INPUT_USD_PER_MILLION : config.EMBEDDING_USD_PER_MILLION) +
      u.output * (kind === 'draft' ? config.DRAFT_OUTPUT_USD_PER_MILLION : 0)) /
    1e6
  );
}
export class AIService {
  constructor(
    private db: Db,
    public provider: AIProvider | null,
  ) {}
  private async run<T>(
    kind: 'draft' | 'embedding',
    invoke: () => Promise<ProviderResult<T>>,
  ): Promise<T> {
    const start = performance.now(),
      id = randomUUID(),
      day = new Date().toISOString().slice(0, 10);
    // Conservative reservation for one bounded input/output and one SDK retry. Failed reservations stay charged.
    const reserve =
      kind === 'draft'
        ? estimatedCost(kind, { input: 6000, output: 1800 }) * 2
        : estimatedCost(kind, { input: 6000, output: 0 }) * 2;
    let result: ProviderResult<T> | undefined,
      outcome = 'unavailable',
      reserved = false;
    try {
      if (!this.provider) throw new AIError('unavailable');
      const budgets = this.db.collection<{ _id: string; reserved: number }>('aiBudgets');
      await budgets.updateOne({ _id: day }, { $setOnInsert: { reserved: 0 } }, { upsert: true });
      const accepted = await budgets.updateOne(
        { _id: day, reserved: { $lte: config.AI_DAILY_BUDGET_USD - reserve } },
        { $inc: { reserved: reserve } },
      );
      if (!accepted.modifiedCount) throw new AIError('budget');
      reserved = true;
      result = await invoke();
      outcome = 'success';
      return result.value;
    } catch (error) {
      const timeout = error instanceof Error && error.name.includes('Timeout');
      outcome = error instanceof AIError ? error.outcome : timeout ? 'timeout' : 'provider_error';
      throw new AIError(outcome as AIError['outcome']);
    } finally {
      await this.db.collection('aiRuns').insertOne({
        operationId: id,
        createdAt: new Date(),
        kind,
        model: result?.model ?? (kind === 'draft' ? config.DRAFT_MODEL : config.EMBEDDING_MODEL),
        promptVersion: kind === 'draft' ? PROMPT_VERSION : 'embedding-text-v1',
        schemaVersion: SCHEMA_VERSION,
        latencyMs: Math.round(performance.now() - start),
        usage: result?.usage ?? null,
        outcome,
        estimatedCostUsd: result ? estimatedCost(kind, result.usage) : null,
        reservedUsd: reserved ? reserve : 0,
        pricingVersion: 'env-per-million-v1',
      });
    }
  }
  draft(report: Report) {
    const safe = {
      ...report,
      notes: redact(report.notes),
      location: {
        ...report.location,
        label: redact(report.location.label),
        assetId: redact(report.location.assetId),
      },
    };
    return this.run('draft', () => this.provider!.draft(safe));
  }
  embed(text: string) {
    return this.run('embedding', () => this.provider!.embed(redact(text)));
  }
}
