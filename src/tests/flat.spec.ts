import { initializeParser } from '../parser';

describe('flat parsers', () => {
  const { createParser, types } = initializeParser();

  const seoParser = createParser({ title: types.string, description: types.string });

  it('merges the parsed fields into the parent output and drops the key', async () => {
    const pageParser = createParser({ name: types.string, seo: seoParser.flat });
    const data = await pageParser({ name: 'A', seo: { title: 'T', description: 'D', extra: 'dropped' } });
    expect(data).toEqual({ name: 'A', title: 'T', description: 'D' });
    expect('seo' in data).toBe(false);
  });

  it('casts values through the nested parser projection', async () => {
    const statsParser = createParser({ count: types.number });
    const parser = createParser({ stats: statsParser.flat });
    const data = await parser({ stats: { count: '5' } });
    expect(data.count).toEqual(5);
  });

  it('overrides same-named regular keys, like @combine', async () => {
    const parser = createParser({ title: 'constant', seo: seoParser.flat });
    const data = await parser({ seo: { title: 'From seo' } });
    expect(data.title).toEqual('From seo');
  });

  it('merges nothing when the data for the key is missing', async () => {
    const parser = createParser({ name: types.string, seo: seoParser.flat });
    const data = await parser({ name: 'A' });
    expect(data).toEqual({ name: 'A' });
  });

  it('throws when the flat result is an array', async () => {
    const parser = createParser({ items: seoParser.flat });
    await expect(parser({ items: [{ title: 'a' }, { title: 'b' }] })).rejects.toThrow('.flat at "items" merges object results only');
  });

  it('works on extended and context-bound parsers', async () => {
    const extended = seoParser.extend({ keywords: types.string });
    const withCtx = seoParser.withContext({ variables: { fallback: 'x' } });
    const parser = createParser({ a: extended.flat, b: withCtx.flat });
    const data = await parser({ a: { title: 'T', keywords: 'k' }, b: { description: 'D' } });
    expect(data).toEqual({ title: 'T', keywords: 'k', description: 'D' });
  });

  it('flattens recursively through nested flat parsers', async () => {
    const inner = createParser({ deep: types.string });
    const middle = createParser({ mid: types.string, innerData: inner.flat });
    const outer = createParser({ top: types.string, middleData: middle.flat });
    const data = await outer({ top: 't', middleData: { mid: 'm', innerData: { deep: 'd' } } });
    expect(data).toEqual({ top: 't', mid: 'm', deep: 'd' });
  });

  it('exposes a stable flat reference with parser metadata', () => {
    const flat = seoParser.flat;
    expect(seoParser.flat).toBe(flat);
    const asToken = flat as unknown as { _parser: boolean; _flat: boolean; projection: object };
    expect(asToken._parser).toBe(true);
    expect(asToken._flat).toBe(true);
    expect(asToken.projection).toBe(seoParser.projection);
  });
});
