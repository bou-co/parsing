import { get } from '../parser-util';
import { getFromObject } from '../internal';
import { ParserContext } from '../parser-types';

describe('get util', () => {
  it('should resolve a nested path', async () => {
    const result = await get('slug.current', { slug: { current: 'ok' } });
    expect(result).toEqual('ok');
  });

  it('should return undefined for a missing intermediate key', async () => {
    const result = await get('slug.current', { _id: 'x' });
    expect(result).toBeUndefined();
  });

  it('should return undefined when an intermediate value is null instead of throwing', async () => {
    await expect(get('slug.current', { slug: null })).resolves.toBeUndefined();
  });

  it('should return undefined when a value deeper in the path is null', async () => {
    const result = await get('a.b.c', { a: { b: null } });
    expect(result).toBeUndefined();
  });

  it('should return null when the final value is null', async () => {
    const result = await get('slug', { slug: null });
    expect(result).toBeNull();
  });

  it('should return undefined for null data in curried form', async () => {
    const getter = get('slug.current');
    const result = await getter({ data: { slug: null } } as unknown as ParserContext);
    expect(result).toBeUndefined();
  });

  describe('error handling', () => {
    it('should catch a throwing get() method and return undefined', async () => {
      const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
      const store = {
        get: () => {
          throw new Error('boom');
        },
      };
      await expect(getFromObject({ store }, 'store.key', {})).rejects.toThrow();
      expect(debug).toHaveBeenCalledTimes(1);
      debug.mockRestore();
    });

    it('should catch a throwing intermediate function and return undefined', async () => {
      const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
      const from = {
        fn: () => {
          throw new Error('boom');
        },
      };
      await expect(getFromObject(from, 'fn.key', {})).rejects.toThrow();
      expect(debug).toHaveBeenCalledTimes(1);
      debug.mockRestore();
    });

    it('should return undefined when an intermediate function resolves to null without hitting the catch', async () => {
      const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
      const from = { fn: () => null };
      await expect(getFromObject(from, 'fn.key', {})).resolves.toBeUndefined();
      expect(debug).not.toHaveBeenCalled();
      debug.mockRestore();
    });

    it('should traverse into the object returned by an intermediate function', async () => {
      const from = { fn: () => ({ key: 'v' }) };
      const result = await getFromObject(from, 'fn.key', {});
      expect(result).toEqual('v');
    });
  });
});
