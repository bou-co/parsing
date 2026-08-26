import { get } from '../parser-util';
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
});
