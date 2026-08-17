import { initializeParser, StorageLike } from '../parser';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('pattern caching', () => {
  it("should memoize 'run' patterns across strings within one parse but not across parses", async () => {
    const resolve = jest.fn(async ({ path }: { path: string }) => `value-${path}`);
    const { createParser, types } = initializeParser({
      patterns: { db: { match: /\$([a-z]+)/g, expressions: false, cache: 'run', resolve: resolve as any } },
    });

    const parser = createParser({ first: types.string, second: types.string });
    const data = await parser({ first: 'a: $val', second: 'b: $val' });

    expect(data.first).toEqual('a: value-val');
    expect(data.second).toEqual('b: value-val');
    expect(resolve).toHaveBeenCalledTimes(1);

    await parser({ first: 'a: $val', second: 'b: $val' });
    expect(resolve).toHaveBeenCalledTimes(2);
  });

  it("should only dedupe per string with cache 'none'", async () => {
    const resolve = jest.fn(async () => 'X');
    const { createParser, types } = initializeParser({
      patterns: { db: { match: /\$([a-z]+)/g, expressions: false, cache: 'none', resolve } },
    });

    const parser = createParser({ first: types.string, second: types.string });
    await parser({ first: '$val and $val', second: '$val' });

    expect(resolve).toHaveBeenCalledTimes(2);
  });

  it("should persist 'storage' patterns through the configured storage with in-flight dedupe", async () => {
    class TestStorage implements StorageLike {
      values: Record<string, any> = {};
      match = jest.fn(async (key: string) => (key in this.values ? this.values[key] : null));
      add = jest.fn(async (key: string, value: any) => {
        this.values[key] = value;
      });
    }
    const storage = new TestStorage();
    const resolve = jest.fn(async () => {
      await sleep(10);
      return 'stored';
    });
    const { createParser, types } = initializeParser({
      storage,
      cache: { enabled: false },
      patterns: { db: { match: /\$([a-z]+)/g, expressions: false, cache: 'storage', resolve } },
    });

    const parser = createParser({ first: types.string, second: types.string });
    const data = await parser({ first: 'a: $slow', second: 'b: $slow' });

    expect(data.first).toEqual('a: stored');
    expect(data.second).toEqual('b: stored');
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(storage.add).toHaveBeenCalledWith('pattern:db:slow', 'stored', expect.anything());

    // A later parse is served from storage without resolving again
    const again = await parser({ first: 'again: $slow', second: 'x' });
    expect(again.first).toEqual('again: stored');
    expect(resolve).toHaveBeenCalledTimes(1);
  });
});
