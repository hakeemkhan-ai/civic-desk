import type { Db } from 'mongodb';
import { afterEach, expect, it, vi } from 'vitest';
import { startWorker } from '../server/retrieval/worker.js';
import type { AIService } from '../server/ai/service.js';

afterEach(() => vi.useRealTimers());

it('does not overlap indexing ticks and drains the active operation before stopping', async () => {
  vi.useFakeTimers();
  let release!: () => void;
  const working = new Promise<void>((resolve) => { release = resolve; });
  const updateMany = vi.fn(() => working);
  const findOneAndUpdate = vi.fn(async () => null);
  const db = { collection: () => ({ updateMany, findOneAndUpdate }) } as unknown as Db;
  const ai = { provider: {} } as AIService;
  const stop = startWorker(db, ai);
  await vi.advanceTimersByTimeAsync(15000);
  expect(updateMany).toHaveBeenCalledTimes(1);
  let stopped = false;
  const stopping = stop().then(() => { stopped = true; });
  await Promise.resolve();
  expect(stopped).toBe(false);
  release();
  await stopping;
  expect(stopped).toBe(true);
  expect(findOneAndUpdate).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(15000);
  expect(updateMany).toHaveBeenCalledTimes(1);
});
