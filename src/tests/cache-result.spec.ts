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

// Whole-parse caching is disabled globally on purpose: store must work independently of cache.enabled
const { createParser, resolve, store, types } = initializeParser({ storage, cache: { enabled: false }, variables: { tenant: 'acme' } });

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('store(key, fn)', () => {
  beforeEach(() => {
    storage.values = {};
    vi.clearAllMocks();
  });

  it('should cache a projection value under a static key', async () => {
    const fetchProfile = vi.fn(async () => ({ role: 'admin' }));
    const parser = createParser({
      name: types.string,
      profile: store('profile-static', fetchProfile),
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
      profile: store('profile-{{data.uid}}', fetchProfile),
      viaCtx: store('ctx-profile-{{ctx.data.uid}}', fetchProfile),
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
        profile: store('user-{{data.uid}}-{{ctx.currentLocale}}', fetchProfile),
      },
    });

    const data = await parser({ user: { uid: 'u1' } }, { currentLocale: 'fi' });

    expect(data?.user?.profile).toEqual('profile:u1');
    expect(storage.add).toHaveBeenCalledWith('user-u1-fi', 'profile:u1', expect.anything());
  });

  it('should work standalone with global variables feeding key interpolation', async () => {
    const query = vi.fn(async (context: ParserContext) => ({ fetched: context.variables['tenant'] }));

    const first = await store('raw-data-{{tenant}}', query);
    const second = await store('raw-data-{{tenant}}', query);

    expect(query).toHaveBeenCalledTimes(1);
    expect(storage.values['raw-data-acme']).toEqual({ fetched: 'acme' });
    expect(first).toEqual({ fetched: 'acme' });
    expect(second).toEqual({ fetched: 'acme' });
  });

  it('should work standalone with a plain key and compute once per wrapper', async () => {
    const uid = '1234';
    const query = vi.fn(async () => 'raw');

    const wrapper = store(`raw-data-${uid}`, query);
    const [first, second] = await Promise.all([wrapper, wrapper]);
    const third = await wrapper;

    expect(query).toHaveBeenCalledTimes(1);
    expect(storage.values['raw-data-1234']).toEqual('raw');
    expect(first).toEqual('raw');
    expect(second).toEqual('raw');
    expect(third).toEqual('raw');
  });

  it('should interpolate keys from the current data and instance variables together', async () => {
    const fn = vi.fn(async ({ data }: ParserContext) => `value:${data['uid']}`);
    const parser = createParser({
      value: store('merged-{{data.uid}}-{{region}}', fn),
    });

    const data = await parser({ uid: '1234' }, { variables: { region: 'eu' } });

    expect(data?.value).toEqual('value:1234');
    expect(storage.add).toHaveBeenCalledWith('merged-1234-eu', 'value:1234', expect.anything());
  });

  it('should resolve inside resolve() inputs', async () => {
    const fetchProfile = vi.fn(async ({ data }: ParserContext) => ({ profileOf: data['uid'] }));

    const data = await resolve({
      name: 'John Doe',
      uid: '1234',
      profile: store('resolved-{{data.uid}}', fetchProfile),
    });

    expect(fetchProfile).toHaveBeenCalledTimes(1);
    expect(storage.values['resolved-1234']).toEqual({ profileOf: '1234' });
    expect(data.profile).toEqual({ profileOf: '1234' });
  });

  it('should just run the function when no storage is configured', async () => {
    const { createParser: createWithoutStorage, store: storeWithoutStorage } = initializeParser();
    const spy = vi.fn(async () => 'fresh');

    const parser = createWithoutStorage({ value: storeWithoutStorage('no-storage', spy) });
    await parser({ id: 1 });
    await parser({ id: 2 });
    await storeWithoutStorage('no-storage', spy);

    expect(spy).toHaveBeenCalledTimes(3);
    expect(storage.match).not.toHaveBeenCalled();
    expect(storage.add).not.toHaveBeenCalled();
  });

  it('should share in-flight dedup between the standalone store and context.store on the same key', async () => {
    const slowFn = vi.fn(async () => {
      await sleep(10);
      return 'shared-value';
    });
    const parser = createParser({
      viaStandalone: store('shared-key', slowFn),
      viaStore: ({ store }: ParserContext) => store('shared-key', slowFn),
    });

    const data = await parser({ id: 1 });

    expect(slowFn).toHaveBeenCalledTimes(1);
    expect(data?.viaStandalone).toEqual('shared-value');
    expect(data?.viaStore).toEqual('shared-value');
  });

  it('should not cache errors and reject the standalone awaiter', async () => {
    const failing = vi.fn(async () => {
      throw new Error('fetch failed');
    });

    const parser = createParser({ value: store('err', failing) });
    await expect(parser({ id: 1 })).rejects.toThrow('fetch failed');
    await expect(store('err', failing)).rejects.toThrow('fetch failed');

    expect(storage.add).not.toHaveBeenCalled();
    expect('err' in storage.values).toBe(false);

    const recovered = await store('err', async () => 'recovered');
    expect(recovered).toEqual('recovered');
    expect(storage.values['err']).toEqual('recovered');
  });

  it('should pass caching options through to the storage backend', async () => {
    await store('opt-key', async () => 'value', { ttl: 3600 });

    const expectedContext = expect.objectContaining({ cache: expect.objectContaining({ ttl: 3600, enabled: false }) });
    expect(storage.match).toHaveBeenCalledWith('opt-key', expectedContext);
    expect(storage.add).toHaveBeenCalledWith('opt-key', 'value', expectedContext);
  });

  it('should stringify content-derived so projection hashes stay distinct and stable', async () => {
    const fnA = async () => 'a';
    const fnB = async () => 'b';

    expect(String(store('key-a', fnA))).toEqual(String(store('key-a', fnA)));
    expect(String(store('key-a', fnA))).not.toEqual(String(store('key-b', fnA)));
    expect(String(store('key-a', fnA))).not.toEqual(String(store('key-a', fnB)));
    expect(String(store('key-a', fnA))).not.toEqual(String(store('key-a', fnA, { ttl: 60 })));
    expect(String(store('key-a', fnA))).toMatch(/^__store:key-a:/);
  });
});
