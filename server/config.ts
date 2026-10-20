import 'dotenv/config';
import { z } from 'zod';
const positive = (fallback: number) => z.coerce.number().positive().default(fallback);
const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: positive(3001),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(3).default(0),
  APP_ORIGIN: z.string().url().default('http://localhost:5173'),
  MONGODB_URI: z.string().default('mongodb://127.0.0.1:27017/civic_desk'),
  DEMO_ACCOUNTS: z.string().default('false'),
  OPENAI_API_KEY: z.string().default(''),
  DRAFT_MODEL: z.string().default('gpt-4.1-mini-2025-04-14'),
  EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  EMBEDDING_DIMENSIONS: positive(1536),
  RETRIEVAL_MODE: z.enum(['exact', 'atlas']).default('exact'),
  ATLAS_VECTOR_INDEX: z.string().default('complaints_vector_v1'),
  AI_TIMEOUT_MS: positive(15000),
  AI_DAILY_BUDGET_USD: positive(2),
  DRAFT_INPUT_USD_PER_MILLION: positive(0.4),
  DRAFT_OUTPUT_USD_PER_MILLION: positive(1.6),
  EMBEDDING_USD_PER_MILLION: positive(0.02),
  DUPLICATE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.76),
  KEYWORD_THRESHOLD: z.coerce.number().min(0).max(1).default(0.35),
});
export const config = Env.parse(process.env);

// Next.js imports route modules while building. Validate deployment-only
// requirements when a web runtime or worker starts, rather than during bundling.
export function assertRuntimeConfig() {
  if (
    config.NODE_ENV === 'production' &&
    (!process.env.APP_ORIGIN || !config.APP_ORIGIN.startsWith('https://'))
  )
    throw new Error('Production requires an explicit HTTPS APP_ORIGIN');
}
