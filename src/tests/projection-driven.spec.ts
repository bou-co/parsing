import { initializeParser, ParserContext, ParserFunction } from '../parser';

const { createParser, types } = initializeParser();

describe('projection-driven resolution', () => {
  describe('nested objects without matching data', () => {
    it('resolves constants and value functions when the data lacks the key', async () => {
      const parser = createParser({
        name: types.string,
        meta: { version: 3, label: 'static', computed: () => 'from fn' },
      });
      const result = await parser({ name: 'A' });
      expect(result.name).toEqual('A');
      expect(result.meta).toEqual({ version: 3, label: 'static', computed: 'from fn' });
    });

    it('applies type-token defaults inside nested objects without data', async () => {
      const parser = createParser({
        settings: { theme: types.string.default('light'), depth: types.number.default(2) },
      });
      const result = await parser({});
      expect(result.settings).toEqual({ theme: 'light', depth: 2 });
    });

    it.each([0, '', false, 5, true])('resolves the projection when the incoming value is the scalar %p', async (scalar) => {
      const parser = createParser({ block: { label: 'static' } });
      const result = await parser({ block: scalar });
      expect(result.block).toEqual({ label: 'static' });
    });
  });

  describe('nested parsers without matching data', () => {
    it('resolves nested parser functions', async () => {
      const metaParser = createParser({ version: 3, title: types.string });
      const parser = createParser({ meta: metaParser });
      const result = await parser({});
      expect(result.meta).toEqual({ version: 3 });
    });

    it('merges .flat constants into the parent', async () => {
      const brandParser = createParser({ brand: 'bou', locale: types.string });
      const parser = createParser({ name: types.string, branding: brandParser.flat });
      const result = await parser({ name: 'A' });
      expect(result).toEqual({ name: 'A', brand: 'bou' });
    });

    it('resolves parsers returned from value functions', async () => {
      const metaParser = createParser({ version: 3 });
      const parser = createParser({ meta: () => metaParser });
      const result = await parser({});
      expect(result.meta).toEqual({ version: 3 });
    });

    it('value functions can keep data-driven behavior by checking the data first', async () => {
      const metaParser = createParser({ version: 3 });
      const parser = createParser({ meta: ({ data }) => (data['meta'] ? metaParser : undefined) });
      expect((await parser({})).meta).toBeUndefined();
      expect((await parser({ meta: {} })).meta).toEqual({ version: 3 });
    });
  });

  describe('empty results are omitted', () => {
    it('omits nested projections that resolve to nothing', async () => {
      const tokenOnly = createParser({ title: types.string });
      const parser = createParser({
        obj: { title: types.string },
        viaParser: tokenOnly,
        viaFlat: tokenOnly.flat,
      });
      const result = await parser({});
      expect(result).toEqual({});
    });

    it('cascades the omission through deep nesting', async () => {
      const allTokens = createParser({ a: { b: { c: types.string } } });
      expect(await allTokens({})).toEqual({});

      const withLeaf = createParser({ a: { b: { c: types.string, d: 'kept' } } });
      expect(await withLeaf({})).toEqual({ a: { b: { d: 'kept' } } });
    });
  });

  describe('incoming scalars', () => {
    it('resolves nested async values to real output when the incoming values are scalars', async () => {
      const createAsyncValue = () => async () => true;
      const parser = createParser({
        3: { 31: createAsyncValue(), 32: createAsyncValue(), 33: createAsyncValue() },
        5: { 51: { 511: createAsyncValue() }, 52: { 521: createAsyncValue() }, 53: { 531: createAsyncValue() } },
      });
      const result = await parser({ 3: 3, 5: 5 });
      expect(result[3]).toEqual({ 31: true, 32: true, 33: true });
      expect(result[5]).toEqual({ 51: { 511: true }, 52: { 521: true }, 53: { 531: true } });

      const emptyResult = await parser({});
      expect(emptyResult[3]).toEqual({ 31: true, 32: true, 33: true });
      expect(emptyResult[5]).toEqual({ 51: { 511: true }, 52: { 521: true }, 53: { 531: true } });
    });

    it('keeps the incoming scalar reachable through the parent context', async () => {
      let seenData: unknown;
      const parser = createParser({
        price: {
          currency: 'EUR',
          amount: (context) => {
            seenData = { ...context.data };
            return context.parent?.data?.['price'];
          },
        },
      });
      const result = await parser({ price: 5 });
      expect(seenData).toEqual({});
      expect(result.price).toEqual({ currency: 'EUR', amount: 5 });
    });
  });

  describe('arrays are not conjured without data', () => {
    it('omits @array, array-literal and asArray projections when the data is missing', async () => {
      const itemParser = createParser({ label: 'item' });
      const parser = createParser({
        directive: { '@array': true, label: 'item' },
        literal: [{ label: 'item' }],
        viaAsArray: itemParser.asArray,
      } as const);
      const result = await parser({});
      expect(result).toEqual({});
    });

    it('still parses them when array data is present', async () => {
      const itemParser = createParser({ label: 'item' });
      const parser = createParser({
        directive: { '@array': true, label: 'item' },
        literal: [{ label: 'item' }],
        viaAsArray: itemParser.asArray,
      } as const);
      const result = await parser({ directive: [{}, {}], literal: [{}], viaAsArray: [{}] });
      expect(result.directive).toEqual([{ label: 'item' }, { label: 'item' }]);
      expect(result.literal).toEqual([{ label: 'item' }]);
      expect(result.viaAsArray).toEqual([{ label: 'item' }]);
    });
  });

  describe('string values under object projections', () => {
    const { createParser: createWithVariables } = initializeParser({
      variables: { blockData: { title: 'from variable' }, scalarVar: 42 },
    });
    const parser = createWithVariables({ block: { title: types.string, always: 'yes' } });

    it('still parses stringified objects data-driven', async () => {
      const result = await parser({ block: '{"title":"hello"}' });
      expect(result.block).toEqual({ title: 'hello', always: 'yes' });
    });

    it('still parses variables resolving to objects data-driven', async () => {
      const result = await parser({ block: '{{blockData}}' });
      expect(result.block).toEqual({ title: 'from variable', always: 'yes' });
    });

    it('resolves the projection when a variable yields a scalar', async () => {
      const result = await parser({ block: '{{scalarVar}}' });
      expect(result.block).toEqual({ always: 'yes' });
    });

    it('resolves the projection for plain strings', async () => {
      const result = await parser({ block: 'just text' });
      expect(result.block).toEqual({ always: 'yes' });
    });
  });

  describe('cycle guard', () => {
    it('terminates literal projection cycles', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const projection: any = { name: 'node' };
      projection.child = projection;
      const parser = createParser(projection);
      const result = await parser({});
      expect(result).toEqual({ name: 'node', child: { name: 'node' } });
    });

    it('terminates mutually recursive parsers', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parserA: ParserFunction<any> = createParser({ tag: 'A', b: () => parserB });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parserB: ParserFunction<any> = createParser({ tag: 'B', a: () => parserA });
      const result = await parserA({});
      expect(result).toEqual({ tag: 'A', b: { tag: 'B', a: { tag: 'A' } } });
    });
  });

  describe('directives inside data-less projections', () => {
    it('runs @if and @combine with an empty data object', async () => {
      const parser = createParser({
        section: {
          base: 'value',
          '@if': [
            { when: () => true, then: { always: 'yes' } },
            { when: ({ data }: ParserContext) => Boolean(data['flag']), then: { flagged: 'yes' } },
          ],
          '@combine': () => ({ combined: true }),
        },
      });
      const result = await parser({});
      expect(result.section).toEqual({ base: 'value', always: 'yes', combined: true });
    });
  });

  describe('hooks', () => {
    it('passes an empty object to before hooks during data-less resolution', async () => {
      const seenData: unknown[] = [];
      const { createParser: createWithBefore } = initializeParser({
        before: (context) => {
          seenData.push({ ...context.data });
          return context;
        },
      });
      const parser = createWithBefore({ nested: { label: 'x' } });
      await parser({ other: 1 });
      expect(seenData).toContainEqual({ other: 1 });
      expect(seenData).toContainEqual({});
    });

    it('after hooks that inject keys keep data-less results non-empty', async () => {
      const { createParser: createWithAfter } = initializeParser({
        after: (context) => ({ ...context, data: { ...context.data, injected: true } }),
      });
      const parser = createWithAfter({ nested: { title: types.string } });
      const result = await parser({});
      expect(result).toEqual({ nested: { injected: true }, injected: true });
    });
  });

  describe('re-parsing', () => {
    it('already parsed nested data is not re-resolved', async () => {
      const inner = createParser({ label: types.string, always: 'yes' });
      const outer = createParser({ nested: inner });
      const first = await outer({ nested: { label: 'a' } });
      const second = await outer({ nested: first.nested });
      expect(second.nested).toEqual({ label: 'a', always: 'yes' });
    });
  });
});
