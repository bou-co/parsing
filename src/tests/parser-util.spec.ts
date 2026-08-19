import { asyncMapObject } from '../parser-util';

describe('asyncMapObject', () => {
  it('should map object entries and preserve keys', async () => {
    const result = await asyncMapObject({ a: 1, b: 2 }, async (value) => value * 2);
    expect(result).toEqual({ a: 2, b: 4 });
  });

  it('should map arrays back to arrays', async () => {
    const result = await asyncMapObject([1, 2, 3], async (value) => value * 2);
    expect(result).toEqual([2, 4, 6]);
  });

  it('should pass non-objects and empty objects through untouched', async () => {
    expect(await asyncMapObject(undefined, async (value) => value)).toBeUndefined();
    expect(await asyncMapObject('text', async (value) => value)).toEqual('text');
    const empty = {};
    expect(await asyncMapObject(empty, async (value) => value)).toBe(empty);
  });

  it('should resolve entries in parallel, not sequentially in key order', async () => {
    const started: number[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const pending = asyncMapObject({ first: 1, second: 2, third: 3 }, async (value) => {
      started.push(value);
      await gate;
      return value;
    });
    // The v2 sequential reduce would have started only the first entry at this point
    expect(started).toEqual([1, 2, 3]);
    release();
    await expect(pending).resolves.toEqual({ first: 1, second: 2, third: 3 });
  });
});
