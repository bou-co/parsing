import { StorageLike, CachingParserContext, initializeParser, ParserContext } from '../parser';

declare module '../expandable-types' {
  export interface ParserCachingOptions {
    ttl?: number;
  }
}

class TestStorage implements StorageLike {
  values: Record<string, any> = {};
  match = jest.fn(async (key: string) => (key in this.values ? this.values[key] : null));
  add = jest.fn(async (key: string, value: any) => {
    this.values[key] = value;
  });
  clear = async () => {
    this.values = {};
  };
}

const storage = new TestStorage();

// Whole-parse caching is disabled globally on purpose: store() must work independently of cache.enabled
const { createParser } = initializeParser({ storage, cache: { enabled: false } });

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('context.store', () => {
  beforeEach(() => {
    storage.values = {};
    jest.clearAllMocks();
  });

  it('should compute once and serve subsequent calls from storage', async () => {
    const fetchAuthor = jest.fn(async () => ({ name: 'John Doe' }));
    const parser = createParser({
      author: ({ store }: ParserContext) => store('author:1', fetchAuthor),
    });

    const first = await parser({ id: 1 });
    const second = await parser({ id: 2 });

    expect(fetchAuthor).toHaveBeenCalledTimes(1);
    expect(storage.add).toHaveBeenCalledTimes(1);
    expect(first?.author).toEqual({ name: 'John Doe' });
    expect(second?.author).toEqual({ name: 'John Doe' });
  });

  it('should dedupe concurrent calls with the same key across array items', async () => {
    const slowFn = jest.fn(async () => {
      await sleep(10);
      return 'shared-value';
    });
    const parser = createParser({
      value: ({ store }: ParserContext) => store('shared', slowFn),
    });

    const results = await parser.asArray([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }]);

    expect(slowFn).toHaveBeenCalledTimes(1);
    expect(storage.match).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(5);
    for (const item of results) expect(item.value).toEqual('shared-value');
  });

  it('should dedupe concurrent calls across separate parses', async () => {
    const slowFn = jest.fn(async () => {
      await sleep(10);
      return 'shared-value';
    });
    const parser = createParser({
      value: ({ store }: ParserContext) => store('shared-parses', slowFn),
    });

    const results = await Promise.all([parser({ id: 1 }), parser({ id: 2 }), parser({ id: 3 })]);

    expect(slowFn).toHaveBeenCalledTimes(1);
    for (const item of results) expect(item?.value).toEqual('shared-value');
  });

  it('should merge per-call options into the cache options passed to the backend', async () => {
    const parser = createParser({
      value: ({ store }: ParserContext) => store('opt', async () => 'value', { ttl: 3600 }),
    });

    await parser({ id: 1 });

    const expectedContext = expect.objectContaining({ cache: expect.objectContaining({ ttl: 3600, enabled: false }) });
    expect(storage.match).toHaveBeenCalledWith('opt', expectedContext);
    expect(storage.add).toHaveBeenCalledWith('opt', 'value', expectedContext);
  });

  it('should not cache errors and allow retries', async () => {
    const failing = jest.fn(async () => {
      throw new Error('fetch failed');
    });
    const failingParser = createParser({
      value: ({ store }: ParserContext) => store('err', failing),
    });

    await expect(failingParser({ id: 1 })).rejects.toThrow('fetch failed');
    expect(storage.add).not.toHaveBeenCalled();
    expect('err' in storage.values).toBe(false);

    const succeeding = jest.fn(async () => 'recovered');
    const succeedingParser = createParser({
      value: ({ store }: ParserContext) => store('err', succeeding),
    });

    const data = await succeedingParser({ id: 1 });
    expect(succeeding).toHaveBeenCalledTimes(1);
    expect(data?.value).toEqual('recovered');
    expect(storage.values['err']).toEqual('recovered');
  });

  it('should reject all deduped waiters when the computation fails', async () => {
    const failing = jest.fn(async () => {
      await sleep(10);
      throw new Error('fetch failed');
    });
    const parser = createParser({
      value: ({ store }: ParserContext) => store('err-parallel', failing),
    });

    const results = await Promise.allSettled([parser({ id: 1 }), parser({ id: 2 }), parser({ id: 3 })]);

    expect(failing).toHaveBeenCalledTimes(1);
    for (const result of results) expect(result.status).toEqual('rejected');
    expect('err-parallel' in storage.values).toBe(false);
  });

  it('should return cached falsy values without recomputing and treat null as a miss', async () => {
    storage.values = { zero: 0, empty: '', no: false, nullish: null };
    const spy = jest.fn(async () => 'recomputed');
    const parser = createParser({
      zero: ({ store }: ParserContext) => store('zero', spy),
      empty: ({ store }: ParserContext) => store('empty', spy),
      no: ({ store }: ParserContext) => store('no', spy),
      nullish: ({ store }: ParserContext) => store('nullish', spy),
    });

    const data = await parser({ id: 1 });

    expect(data?.zero).toEqual(0);
    expect(data?.empty).toEqual('');
    expect(data?.no).toEqual(false);
    expect(data?.nullish).toEqual('recomputed');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(storage.values['nullish']).toEqual('recomputed');
  });

  it('should expose the storage directly on the context for manual access', async () => {
    const parser = createParser({
      value: async (context: ParserContext) => {
        const existing = await context.storage?.match('manual', context as CachingParserContext);
        if (existing != null) return existing;
        await context.storage?.add('manual', 'computed', context as CachingParserContext);
        return 'computed';
      },
    });

    const first = await parser({ id: 1 });
    const second = await parser({ id: 2 });

    expect(first?.value).toEqual('computed');
    expect(second?.value).toEqual('computed');
    expect(storage.add).toHaveBeenCalledTimes(1);
  });

  it('should be available in hooks, conditions, combine functions and nested projections', async () => {
    const seen: { before?: string; nested?: string; when?: string; combine?: string } = {};
    const parser = createParser({
      nested: {
        inner: (context: ParserContext) => {
          seen.nested = typeof context.store;
          return 'x';
        },
      },
      '@if': [
        {
          when: (context: ParserContext) => {
            seen.when = typeof context.store;
            return false;
          },
          then: { extra: 'string' },
        },
      ],
      '@combine': (context: ParserContext) => {
        seen.combine = typeof context.store;
        return { combined: true };
      },
    });

    await parser(
      { nested: { inner: 'y' } },
      {
        before: (context) => {
          seen.before = typeof context.store;
          return context;
        },
      },
    );

    expect(seen).toEqual({ before: 'function', nested: 'function', when: 'function', combine: 'function' });
  });

  it('should just run the function when no storage is configured', async () => {
    try {
      const { createParser: createWithoutStorage } = initializeParser();
      const spy = jest.fn(async () => 'fresh');
      const parser = createWithoutStorage({
        value: ({ store }: ParserContext) => store('no-storage', spy),
      });

      const first = await parser({ id: 1 });
      const second = await parser({ id: 2 });

      expect(spy).toHaveBeenCalledTimes(2);
      expect(first?.value).toEqual('fresh');
      expect(second?.value).toEqual('fresh');
      expect(storage.match).not.toHaveBeenCalled();
      expect(storage.add).not.toHaveBeenCalled();
    } finally {
      initializeParser({ storage, cache: { enabled: false } });
    }
  });
});
