import { StorageLike, CachingParserContext, initializeParser, ParserContext } from '../parser';

class TestStorage implements StorageLike {
  values: Record<string, any> = {};
  match = vi.fn(async (key: string) => (key in this.values ? this.values[key] : null));
  add = vi.fn(async (key: string, value: any, _context?: CachingParserContext) => {
    this.values[key] = value;
  });
  remove = vi.fn(async (key: string) => {
    delete this.values[key];
  });
  clear = vi.fn(async () => {
    this.values = {};
  });
}

const storage = new TestStorage();

const { createParser, resolve, store, types } = initializeParser({ storage, cache: { ttl: 3600 }, variables: { tenant: 'acme' } });

describe('store', () => {
  beforeEach(() => {
    storage.values = {};
    vi.clearAllMocks();
  });

  describe('store(key, fn)', () => {
    it('should get or compute standalone and memoize per value', async () => {
      const query = vi.fn(async () => ({ role: 'admin' }));

      const cached = store('profile-1', query);
      const [first, second] = await Promise.all([cached, cached]);
      const third = await store('profile-1', query);

      expect(query).toHaveBeenCalledTimes(1);
      expect(storage.values['profile-1']).toEqual({ role: 'admin' });
      expect(first).toEqual({ role: 'admin' });
      expect(second).toEqual({ role: 'admin' });
      expect(third).toEqual({ role: 'admin' });
    });

    it('should not run at definition time inside a projection and run per parse', async () => {
      const fetchProfile = vi.fn(async ({ data }: ParserContext) => `profile:${data['uid']}`);
      const parser = createParser({
        name: types.string,
        profile: store('profile-{{data.uid}}', fetchProfile),
      });

      expect(fetchProfile).not.toHaveBeenCalled();

      const first = await parser({ name: 'John Doe', uid: '1' });
      const second = await parser({ name: 'Jane Doe', uid: '2' });

      expect(fetchProfile).toHaveBeenCalledTimes(2);
      expect(first?.profile).toEqual('profile:1');
      expect(second?.profile).toEqual('profile:2');
    });

    it('should resolve inside resolve() inputs', async () => {
      const data = await resolve({ profile: store('resolved-profile', async () => 'value') });

      expect(data.profile).toEqual('value');
      expect(storage.values['resolved-profile']).toEqual('value');
    });
  });

  describe('store.add and store.match', () => {
    it('should add under an automatic content key and return it', async () => {
      const value = { title: 'Hello', tags: ['a', 'b'] };

      const key = await store.add({ value });
      const sameKey = await store.add({ value: { title: 'Hello', tags: ['a', 'b'] } });

      expect(key).toMatch(/^store:/);
      expect(sameKey).toEqual(key);
      expect(await store.match(key)).toEqual(value);
    });

    it('should give distinct automatic keys to distinct falsy values', async () => {
      const keys = await Promise.all([store.add({ value: 0 }), store.add({ value: false }), store.add({ value: '' })]);

      expect(new Set(keys).size).toEqual(3);
      expect(await store.match(keys[0])).toEqual(0);
      expect(await store.match(keys[1])).toEqual(false);
      expect(await store.match(keys[2])).toEqual('');
    });

    it('should add with an explicit key in object and positional form', async () => {
      const objectKey = await store.add({ key: 'profile-1', value: { role: 'admin' } });
      const positionalKey = await store.add('profile-2', { role: 'editor' });

      expect(objectKey).toEqual('profile-1');
      expect(positionalKey).toEqual('profile-2');
      expect(await store.match('profile-1')).toEqual({ role: 'admin' });
      expect(await store.match('profile-2')).toEqual({ role: 'editor' });
    });

    it('should await promise values before storing', async () => {
      await store.add('async-value', Promise.resolve('resolved'));

      expect(storage.values['async-value']).toEqual('resolved');
    });

    it('should interpolate variables in keys', async () => {
      const key = await store.add({ key: 'tenant-{{tenant}}', value: 'value' });

      expect(key).toEqual('tenant-acme');
      expect(await store.match('tenant-{{tenant}}')).toEqual('value');
    });

    it('should pass ttl to the backend and fall back to the global cache ttl', async () => {
      await store.add({ key: 'with-ttl', value: 'a', ttl: 60 });
      await store.add('positional-ttl', 'b', { ttl: 120 });
      await store.add('default-ttl', 'c');

      const ttlOf = (key: string) => storage.add.mock.calls.find(([callKey]) => callKey === key)?.[2]?.cache.ttl;
      expect(ttlOf('with-ttl')).toEqual(60);
      expect(ttlOf('positional-ttl')).toEqual(120);
      expect(ttlOf('default-ttl')).toEqual(3600);
    });

    it('should not pass key and value through as caching options', async () => {
      await store.add({ key: 'clean-options', value: 'a', ttl: 60 });

      const options = storage.add.mock.calls[0]?.[2]?.cache;
      expect(options).not.toHaveProperty('key');
      expect(options).not.toHaveProperty('value');
    });

    it('should throw a hint when the single argument is not the object form', async () => {
      // @ts-expect-error a single argument must be { key?, value, ...options }
      await expect(store.add('profile-1')).rejects.toThrow('store.add(input) takes { key?, value, ...options }');
      // @ts-expect-error a single argument must be { key?, value, ...options }
      await expect(store.add({ title: 'Hello' })).rejects.toThrow('store.add(input) takes { key?, value, ...options }');
    });

    it('should reject null and undefined values', async () => {
      await expect(store.add({ value: null })).rejects.toThrow('store.add needs a value');
      await expect(store.add('empty', undefined)).rejects.toThrow('store.add needs a value');
      expect(storage.add).not.toHaveBeenCalled();
    });

    it('should return undefined on a miss, null included', async () => {
      storage.values['nullish'] = null;

      expect(await store.match('missing')).toBeUndefined();
      expect(await store.match('nullish')).toBeUndefined();
    });

    it('should be safe to destructure', async () => {
      const { match, add } = store;

      const key = await add({ value: 'destructured' });

      expect(await match(key)).toEqual('destructured');
    });
  });

  describe('store.remove and store.clear', () => {
    it('should delegate to the backend', async () => {
      await store.add('one', 1);
      await store.add('two', 2);

      await store.remove('one');
      expect(await store.match('one')).toBeUndefined();
      expect(await store.match('two')).toEqual(2);

      await store.clear();
      expect(await store.match('two')).toBeUndefined();
      expect(storage.clear).toHaveBeenCalledTimes(1);
    });

    it('should be no-ops when the backend lacks them', async () => {
      const values: Record<string, unknown> = {};
      const { store: minimalStore } = initializeParser({
        storage: { match: (key) => values[key], add: (key, value) => void (values[key] = value) },
      });

      await minimalStore.add('kept', 'value');
      await minimalStore.remove('kept');
      await minimalStore.clear();

      expect(values['kept']).toEqual('value');
    });
  });

  describe('without storage', () => {
    it('should run functions, miss on match and still return keys from add', async () => {
      const { store: storeWithoutStorage } = initializeParser();
      const spy = vi.fn(async () => 'fresh');

      await storeWithoutStorage('no-storage', spy);
      await storeWithoutStorage('no-storage', spy);
      const key = await storeWithoutStorage.add({ key: 'no-storage', value: 'value' });
      await storeWithoutStorage.remove('no-storage');
      await storeWithoutStorage.clear();

      expect(spy).toHaveBeenCalledTimes(2);
      expect(key).toEqual('no-storage');
      expect(await storeWithoutStorage.match('no-storage')).toBeUndefined();
      expect(storage.match).not.toHaveBeenCalled();
      expect(storage.add).not.toHaveBeenCalled();
    });
  });

  describe('context.store', () => {
    it('should share storage with the standalone store', async () => {
      await store.add('shared', 'from-standalone');
      const parser = createParser({
        read: ({ store }: ParserContext) => store.match('shared'),
        write: async ({ store, data }: ParserContext) => store.add({ key: 'written-{{data.id}}', value: data['id'] }),
      });

      const data = await parser({ id: 5 });

      expect(data?.read).toEqual('from-standalone');
      expect(data?.write).toEqual('written-5');
      expect(await store.match('written-5')).toEqual(5);
    });

    it('should keep engines isolated', async () => {
      const storageA = new TestStorage();
      const storageB = new TestStorage();
      const a = initializeParser({ storage: storageA });
      const b = initializeParser({ storage: storageB });

      await a.store.add('shared-key', 'from-a');
      await b.store.add('shared-key', 'from-b');

      expect(await a.store.match('shared-key')).toEqual('from-a');
      expect(await b.store.match('shared-key')).toEqual('from-b');
    });
  });
});
