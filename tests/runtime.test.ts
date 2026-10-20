import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  constructClient: vi.fn(),
  connect: vi.fn(),
  close: vi.fn(),
  initialize: vi.fn(),
  createApi: vi.fn(),
  assertRuntimeConfig: vi.fn(),
  db: {},
}));

vi.mock('mongodb', () => ({
  MongoClient: class {
    constructor(...args: unknown[]) {
      mocks.constructClient(...args);
    }
    connect = mocks.connect;
    close = mocks.close;
    db() { return mocks.db; }
  },
}));
vi.mock('../server/config.js', () => ({
  config: { MONGODB_URI: 'mongodb://synthetic.test/civic_runtime_test' },
  assertRuntimeConfig: mocks.assertRuntimeConfig,
}));
vi.mock('../server/db.js', () => ({ initialize: mocks.initialize }));
vi.mock('../server/app.js', () => ({ createApi: mocks.createApi }));

const cache = globalThis as typeof globalThis & { civicDeskConnection?: unknown };

beforeEach(() => {
  delete cache.civicDeskConnection;
  vi.resetModules();
  vi.resetAllMocks();
  mocks.connect.mockResolvedValue(undefined);
  mocks.close.mockResolvedValue(undefined);
  mocks.initialize.mockResolvedValue(undefined);
  mocks.createApi.mockImplementation(() => ({ handle: vi.fn(), ai: {} }));
});

afterEach(() => { delete cache.civicDeskConnection; });

describe('Next runtime connection lifecycle', () => {
  it('shares concurrent startup and rebuilds API handlers after a module reload', async () => {
    const firstModule = await import('../server/runtime.js');
    const firstPending = firstModule.getRuntime();
    expect(firstModule.getRuntime()).toBe(firstPending);
    const first = await firstPending;
    expect(mocks.constructClient).toHaveBeenCalledTimes(1);
    expect(mocks.connect).toHaveBeenCalledTimes(1);
    expect(mocks.initialize).toHaveBeenCalledTimes(1);
    expect(mocks.createApi).toHaveBeenCalledTimes(1);

    vi.resetModules();
    const reloadedModule = await import('../server/runtime.js');
    const reloaded = await reloadedModule.getRuntime();
    expect(reloaded.client).toBe(first.client);
    expect(reloaded.db).toBe(first.db);
    expect(reloaded.handle).not.toBe(first.handle);
    expect(mocks.createApi).toHaveBeenCalledTimes(2);
    expect(mocks.constructClient).toHaveBeenCalledTimes(1);
    expect(mocks.close).not.toHaveBeenCalled();
  });

  it('closes a failed connection and allows a later request to initialize a fresh pool', async () => {
    mocks.connect.mockRejectedValueOnce(new Error('Synthetic connection failure'));
    const { getRuntime } = await import('../server/runtime.js');
    const failed = getRuntime();
    expect(getRuntime()).toBe(failed);
    await expect(failed).rejects.toThrow('Synthetic connection failure');
    expect(mocks.close).toHaveBeenCalledTimes(1);
    expect(cache.civicDeskConnection).toBeUndefined();

    const recovered = await getRuntime();
    expect(recovered.db).toBe(mocks.db);
    expect(mocks.constructClient).toHaveBeenCalledTimes(2);
    expect(mocks.createApi).toHaveBeenCalledTimes(1);
  });

  it('closes the connected pool when index initialization fails and retries cleanly', async () => {
    mocks.initialize.mockRejectedValueOnce(new Error('Synthetic index failure'));
    const { getRuntime } = await import('../server/runtime.js');
    await expect(getRuntime()).rejects.toThrow('Synthetic index failure');
    expect(mocks.close).toHaveBeenCalledTimes(1);
    expect(mocks.createApi).not.toHaveBeenCalled();
    await getRuntime();
    expect(mocks.constructClient).toHaveBeenCalledTimes(2);
    expect(mocks.initialize).toHaveBeenCalledTimes(2);
  });

  it('retries API initialization without discarding a healthy shared connection', async () => {
    mocks.createApi.mockImplementationOnce(() => { throw new Error('Synthetic API failure'); });
    const { getRuntime } = await import('../server/runtime.js');
    await expect(getRuntime()).rejects.toThrow('Synthetic API failure');
    await getRuntime();
    expect(mocks.constructClient).toHaveBeenCalledTimes(1);
    expect(mocks.close).not.toHaveBeenCalled();
    expect(mocks.createApi).toHaveBeenCalledTimes(2);
  });
});
