import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { DraftSchema, type Draft, type Report } from '../../shared/domain.js';
import { config } from '../config.js';
import { DRAFT_PROMPT } from './prompts.js';
export type Usage = { input: number; output: number };
export type ProviderResult<T> = { value: T; usage: Usage; model: string };
export interface AIProvider {
  draft(report: Report): Promise<ProviderResult<Draft>>;
  embed(text: string): Promise<ProviderResult<number[]>>;
}
export class AIError extends Error {
  constructor(
    public outcome:
      | 'unavailable'
      | 'refusal'
      | 'incomplete'
      | 'invalid'
      | 'timeout'
      | 'provider_error'
      | 'budget',
  ) {
    super(outcome);
  }
}
export function parseDraftResponse(response: {
  status?: string;
  output_parsed?: unknown;
  output?: unknown[];
}): Draft {
  if (response.status !== 'completed') throw new AIError('incomplete');
  if (
    response.output?.some((item) => {
      const x = item as { content?: { type: string }[] };
      return x.content?.some((c) => c.type === 'refusal');
    })
  )
    throw new AIError('refusal');
  const parsed = DraftSchema.safeParse(response.output_parsed);
  if (!parsed.success) throw new AIError('invalid');
  if (
    parsed.data.title.length > 140 ||
    parsed.data.description.length > 4000 ||
    parsed.data.extractedFacts.length > 30 ||
    parsed.data.missingInformation.length > 10
  )
    throw new AIError('invalid');
  return parsed.data;
}
export function validateEvidence(draft: Draft, report: Report) {
  const source = `${report.notes}\n${report.location.label}`.toLowerCase();
  if (
    draft.extractedFacts.some(
      (f) => !f.evidence.trim() || !source.includes(f.evidence.toLowerCase()),
    )
  )
    throw new AIError('invalid');
  return draft;
}
export function makeProvider(): AIProvider | null {
  if (!config.OPENAI_API_KEY) return null;
  const client = new OpenAI({
    apiKey: config.OPENAI_API_KEY,
    timeout: config.AI_TIMEOUT_MS,
    maxRetries: 1,
  });
  return {
    async draft(report) {
      const r = await client.responses.parse({
        model: config.DRAFT_MODEL,
        store: false,
        input: [
          { role: 'system', content: DRAFT_PROMPT },
          { role: 'user', content: JSON.stringify(report) },
        ],
        text: { format: zodTextFormat(DraftSchema, 'civic_complaint_v1') },
        max_output_tokens: 1800,
      });
      return {
        value: validateEvidence(parseDraftResponse(r), report),
        usage: { input: r.usage?.input_tokens ?? 0, output: r.usage?.output_tokens ?? 0 },
        model: r.model,
      };
    },
    async embed(text) {
      const r = await client.embeddings.create({
        model: config.EMBEDDING_MODEL,
        input: text,
        dimensions: config.EMBEDDING_DIMENSIONS,
        encoding_format: 'float',
      });
      const v = r.data[0]?.embedding;
      if (!v || v.length !== config.EMBEDDING_DIMENSIONS || v.some((n) => !Number.isFinite(n)))
        throw new AIError('invalid');
      return { value: v, usage: { input: r.usage.prompt_tokens, output: 0 }, model: r.model };
    },
  };
}
