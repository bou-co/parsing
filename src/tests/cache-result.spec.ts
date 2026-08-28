import { StorageLike, initializeParser, ParserContext } from '../parser';

declare module '../expandable-types' {
  export interface ParserCachingOptions {
    ttl?: number;
  }
  export interface InstanceContext {
    currentLocale?: string;
  }
}

class TestStorage implements StorageLike {
  values: Record<string, any> = {};
  match = vi.fn(async (key: string) => (key in this.values ? this.values[key] : null));
  add = vi.fn(async (key: string, value: any) => {
    this.values[key] = value;
  });
  clear = async () => {
    this.values = {};
  };
}

const storage = new TestStorage();

// Whole-parse caching is disabled globally on purpose: cacheResult must work independently of cache.enabled
const { createParser, resolve, cacheResult, types } = initializeParser({ storage, cache: { enabled: false } });

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('cacheResult', () => {
  beforeEach(() => {
    storage.values = {};
    vi.clearAllMocks();
  });

  it('should cache a projection value under a static key', async () => {
    const fetchProfile = vi.fn(async () => ({ role: 'admin' }));
    const parser = createParser({
      name: types.string,
      profile: cacheResult('profile-static', fetchProfile),
    });

    const first = await parser({ name: 'John Doe' });
    const second = await parser({ name: 'Jane Doe' });

    expect(fetchProfile).toHaveBeenCalledTimes(1);
    expect(storage.add).toHaveBeenCalledWith('profile-static', { role: 'admin' }, expect.anything());
    expect(first?.profile).toEqual({ role: 'admin' });
    expect(second?.profile).toEqual({ role: 'admin' });
  });

  it('should interpolate {{data.*}} and {{ctx.data.*}} in keys per input', async () => {
    const fetchProfile = vi.fn(async ({ data }: ParserContext) => ({ profileOf: data['uid'] }));
    const parser = createParser({
      name: types.string,
      profile: cacheResult('profile-{{data.uid}}', fetchProfile),
      viaCtx: cacheResult('ctx-profile-{{ctx.data.uid}}', fetchProfile),
    });

    const first = await parser({ name: 'John Doe', uid: '1234' });
    const second = await parser({ name: 'Jane Doe', uid: '5678' });
    const repeat = await parser({ name: 'John Doe', uid: '1234' });

    expect(Object.keys(storage.values).sort()).toEqual(['ctx-profile-1234', 'ctx-profile-5678', 'profile-1234', 'profile-5678']);
    expect(fetchProfile).toHaveBeenCalledTimes(4);
    expect(first?.profile).toEqual({ profileOf: '1234' });
    expect(second?.profile).toEqual({ profileOf: '5678' });
    expect(repeat?.profile).toEqual({ profileOf: '1234' });
    expect(repeat?.viaCtx).toEqual({ profileOf: '1234' });
  });

  it('should interpolate keys from the nested level data and context fields', async () => {
    const fetchProfile = vi.fn(async ({ data }: ParserContext) => `profile:${data['uid']}`);
    const parser = createParser({
      user: {
        profile: cacheResult('user-{{data.uid}}-{{ctx.currentLocale}}', fetchProfile),
      },
    });

    const data = await parser({ user: { uid: 'u1' } }, { currentLocale: 'fi' });

    expect(data?.user?.profile).toEqual('profile:u1');
    expect(storage.add).toHaveBeenCalledWith('user-u1-fi', 'profile:u1', expect.anything());
  });

  it('should work standalone with extraData feeding key interpolation', async () => {
    const query = vi.fn(async (context: ParserContext) => ({ fetched: context.data?.['uid'] }));

    const first = await cacheResult('raw-data-{{data.uid}}', query, { uid: '1234' });
    const second = await cacheResult('raw-data-{{data.uid}}', query, { uid: '1234' });

    expect(query).toHaveBeenCalledTimes(1);
    expect(storage.values['raw-data-1234']).toEqual({ fetched: '1234' });
    expect(first).toEqual({ fetched: '1234' });
    expect(second).toEqual({ fetched: '1234' });
  });

  it('should work standalone with a plain key and compute once per wrapper', async () => {
    const uid = '1234';
    const query = vi.fn(async () => 'raw');

    const wrapper = cacheResult(`raw-data-${uid}`, query);
    const [first, second] = await Promise.all([wrapper, wrapper]);
    const third = await wrapper;

    expect(query).toHaveBeenCalledTimes(1);
    expect(storage.values['raw-data-1234']).toEqual('raw');
    expect(first).toEqual('raw');
    expect(second).toEqual('raw');
    expect(third).toEqual('raw');
  });

  it('should merge extraData over the current data for key interpolation only', async () => {
    const fn = vi.fn(async ({ data }: ParserContext) => `value:${data['uid']}`);
    const parser = createParser({
      value: cacheResult('merged-{{data.uid}}-{{data.region}}', fn, { region: 'eu' }),
    });

    const data = await parser({ uid: '1234' });

    expect(data?.value).toEqual('value:1234');
    expect(storage.add).toHaveBeenCalledWith('merged-1234-eu', 'value:1234', expect.anything());
  });

  it('should resolve inside resolve() inputs', async () => {
    const fetchProfile = vi.fn(async ({ data }: ParserContext) => ({ profileOf: data['uid'] }));

    const data = await resolve({
      name: 'John Doe',
      uid: '1234',
      profile: cacheResult('resolved-{{data.uid}}', fetchProfile),
    });

    expect(fetchProfile).toHaveBeenCalledTimes(1);
    expect(storage.values['resolved-1234']).toEqual({ profileOf: '1234' });
    expect(data.profile).toEqual({ profileOf: '1234' });
  });

  it('should just run the function when no storage is configured', async () => {
    const { createParser: createWithoutStorage, cacheResult: cacheWithoutStorage } = initializeParser();
    const spy = vi.fn(async () => 'fresh');

    const parser = createWithoutStorage({ value: cacheWithoutStorage('no-storage', spy) });
    await parser({ id: 1 });
    await parser({ id: 2 });
    await cacheWithoutStorage('no-storage', spy);

    expect(spy).toHaveBeenCalledTimes(3);
    expect(storage.match).not.toHaveBeenCalled();
    expect(storage.add).not.toHaveBeenCalled();
  });

  it('should share in-flight dedup with context.store on the same key', async () => {
    const slowFn = vi.fn(async () => {
      await sleep(10);
      return 'shared-value';
    });
    const parser = createParser({
      viaCacheResult: cacheResult('shared-key', slowFn),
      viaStore: ({ store }: ParserContext) => store('shared-key', slowFn),
    });

    const data = await parser({ id: 1 });

    expect(slowFn).toHaveBeenCalledTimes(1);
    expect(data?.viaCacheResult).toEqual('shared-value');
    expect(data?.viaStore).toEqual('shared-value');
  });

  it('should not cache errors and reject the standalone awaiter', async () => {
    const failing = vi.fn(async () => {
      throw new Error('fetch failed');
    });

    const parser = createParser({ value: cacheResult('err', failing) });
    await expect(parser({ id: 1 })).rejects.toThrow('fetch failed');
    await expect(cacheResult('err', failing)).rejects.toThrow('fetch failed');

    expect(storage.add).not.toHaveBeenCalled();
    expect('err' in storage.values).toBe(false);

    const recovered = await cacheResult('err', async () => 'recovered');
    expect(recovered).toEqual('recovered');
    expect(storage.values['err']).toEqual('recovered');
  });

  it('should pass caching options through to the storage backend', async () => {
    await cacheResult('opt-key', async () => 'value', undefined, { ttl: 3600 });

    const expectedContext = expect.objectContaining({ cache: expect.objectContaining({ ttl: 3600, enabled: false }) });
    expect(storage.match).toHaveBeenCalledWith('opt-key', expectedContext);
    expect(storage.add).toHaveBeenCalledWith('opt-key', 'value', expectedContext);
  });

  it('should stringify content-derived so projection hashes stay distinct and stable', async () => {
    const fnA = async () => 'a';
    const fnB = async () => 'b';

    expect(String(cacheResult('key-a', fnA))).toEqual(String(cacheResult('key-a', fnA)));
    expect(String(cacheResult('key-a', fnA))).not.toEqual(String(cacheResult('key-b', fnA)));
    expect(String(cacheResult('key-a', fnA))).not.toEqual(String(cacheResult('key-a', fnB)));
    expect(String(cacheResult('key-a', fnA))).not.toEqual(String(cacheResult('key-a', fnA, { uid: '1' })));
  });
});
