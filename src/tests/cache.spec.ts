import { StorageLike, CachingParserContext, initializeParser, ParserContext } from '../parser';
import { defineType } from '../parser-casting';
import { toHash } from '../to-hash';

declare module '../expandable-types' {
  export interface ParserCachingOptions {
    name?: string;
    globalPrefix?: string;
  }
}

class TestCache implements StorageLike {
  generateKey = ({ data, projection, cache: cachingOptions }: CachingParserContext) => {
    if (!cachingOptions.globalPrefix) throw new Error('Caching options must have a global prefix defined');
    if (!cachingOptions.name) throw new Error('Caching options must have a name defined');
    const projectionHash = toHash(projection);
    const dataHash = toHash(data);
    return `${cachingOptions.name}-${projectionHash}-${dataHash}`;
  };
  values: Record<string, any> = {};
  match = async (key: string) => this.values[key];
  add = async (key: string, value: any) => {
    this.values[key] = value;
  };
  clear = async () => {
    this.values = {};
  };
}

const { createParser, types } = initializeParser({
  storage: new TestCache(),
  cache: {
    enabled: true,
    globalPrefix: 'global-prefix',
  },
});

describe('parsing', () => {
  it('should be able basic variable resolution', async () => {
    const parser = createParser(
      {
        title: async () => {
          await new Promise((resolve) => setTimeout(resolve, 100));
          return 'Hello World';
        },
        description: types.string,
      },
      {
        cache: { name: 'test-cache' },
      },
    );
    const timeStart = Date.now();
    const data = await parser({ description: 'Lorem ipsum' });
    const timeEnd = Date.now();
    console.log('Time taken:', `${timeEnd - timeStart}ms (expected: ~100ms)`);
    // A 100ms timer can fire a millisecond early on timer rounding — the point is that the call was not served from cache
    expect(timeEnd - timeStart).toBeGreaterThanOrEqual(95);
    expect(timeEnd - timeStart).toBeLessThan(200);
    expect(data).toBeTruthy();
    expect(data.title).toEqual('Hello World');
    expect(data.description).toEqual('Lorem ipsum');

    const secondTimeStart = Date.now();
    const secondData = await parser({ description: 'Lorem ipsum' });
    const secondTimeEnd = Date.now();
    console.log('Time taken for second call:', `${secondTimeEnd - secondTimeStart}ms (expected: <10ms)`);
    expect(secondTimeEnd - secondTimeStart).toBeLessThan(20);
    expect(secondData).toBeTruthy();
    expect(secondData.title).toEqual('Hello World');
    expect(secondData.description).toEqual('Lorem ipsum');
  });

  it('should fail if caching options are not defined', async () => {
    const parser = createParser({
      description: types.string,
    });

    await expect(parser({ description: 'Lorem ipsum' })).rejects.toThrow('Caching options must have a name defined');
  });

  it('should be able to disable/enable caching for specific parsers or instances', async () => {
    const parser = createParser(
      {
        title: async () => {
          await new Promise((resolve) => setTimeout(resolve, 100));
          return 'Hello World';
        },
        description: types.string,
      },
      {
        cache: { enabled: false, name: 'test-cache' },
      },
    );
    const timeStart = Date.now();
    const data = await parser({ description: 'Lorem ipsum' });
    const timeEnd = Date.now();
    console.log('Time taken:', `${timeEnd - timeStart}ms (expected: ~100ms)`);
    // A 100ms timer can fire a millisecond early on timer rounding — the point is that the call was not served from cache
    expect(timeEnd - timeStart).toBeGreaterThanOrEqual(95);
    expect(timeEnd - timeStart).toBeLessThan(200);
    expect(data).toBeTruthy();
    expect(data.title).toEqual('Hello World');
    expect(data.description).toEqual('Lorem ipsum');

    const secondTimeStart = Date.now();
    const secondData = await parser({ description: 'Lorem ipsum' });
    const secondTimeEnd = Date.now();
    console.log('Time taken for second call:', `${secondTimeEnd - secondTimeStart}ms (expected: ~100ms)`);
    expect(secondTimeEnd - secondTimeStart).toBeGreaterThanOrEqual(100);
    expect(secondTimeEnd - secondTimeStart).toBeLessThan(200);
    expect(secondData).toBeTruthy();
    expect(secondData.title).toEqual('Hello World');
    expect(secondData.description).toEqual('Lorem ipsum');

    const thirdTimeStart = Date.now();
    const thirdData = await parser({ description: 'Lorem ipsum' }, { cache: { enabled: true } });
    const thirdTimeEnd = Date.now();
    console.log('Time taken for third call:', `${thirdTimeEnd - thirdTimeStart}ms (expected: <10ms)`);
    expect(thirdTimeEnd - thirdTimeStart).toBeLessThan(20);
    expect(thirdData).toBeTruthy();
    expect(thirdData.title).toEqual('Hello World');
    expect(thirdData.description).toEqual('Lorem ipsum');
  });

  it('generates different hashes for different type tokens', () => {
    expect(toHash({ value: types.string })).not.toEqual(toHash({ value: types.number }));
    expect(toHash({ value: types.array.of(types.string) })).not.toEqual(toHash({ value: types.array.of(types.number) }));
  });

  it('generates different hashes for custom and modified types', () => {
    const emailA = defineType((value) => String(value).toLowerCase());
    const emailB = defineType((value) => String(value).toUpperCase());
    expect(toHash({ value: emailA })).not.toEqual(toHash({ value: emailB }));

    // Identical source is stable across re-creation (and process restarts)
    const remadeA = defineType((value) => String(value).toLowerCase());
    expect(toHash({ value: emailA })).toEqual(toHash({ value: remadeA }));

    // Parameterized arrays include the item implementation identity
    expect(toHash({ value: types.array.of(emailA) })).not.toEqual(toHash({ value: types.array.of(emailB) }));
    expect(toHash({ value: types.array })).not.toEqual(toHash({ value: types.array.of(emailA) }));

    // Strict is part of the identity
    const fn = (value: unknown) => Number(value);
    expect(toHash({ value: defineType({ fn }) })).not.toEqual(toHash({ value: defineType({ fn, strict: true }) }));

    // Factory-made types share their source — a name disambiguates the closures
    const factory = (multiplier: number, name?: string) => defineType({ fn: (value) => Number(value) * multiplier, name });
    expect(toHash({ value: factory(2) })).toEqual(toHash({ value: factory(3) }));
    expect(toHash({ value: factory(2, 'double') })).not.toEqual(toHash({ value: factory(3, 'triple') }));
  });

  it('generates different hashes for projections embedding different parsers', () => {
    const one = createParser({ value: types.string });
    const two = createParser({ value: types.number });
    expect(toHash({ nested: one })).not.toEqual(toHash({ nested: two }));

    const remadeOne = createParser({ value: types.string });
    expect(toHash({ nested: one })).toEqual(toHash({ nested: remadeOne }));
  });

  it('generates different hashes for defaulted types and flat parsers', () => {
    // A default is part of the token identity
    expect(toHash({ value: types.string })).not.toEqual(toHash({ value: types.string.default('x') }));
    expect(toHash({ value: types.string.default('x') })).not.toEqual(toHash({ value: types.string.default('y') }));
    expect(toHash({ value: types.string.default('x') })).toEqual(toHash({ value: types.string.default('x') }));
    expect(toHash({ value: types.array.of(types.string) })).not.toEqual(toHash({ value: types.array.of(types.string).default([]) }));

    // Using a parser flat hashes differently from nesting it
    const nested = createParser({ value: types.string });
    expect(toHash({ nested })).not.toEqual(toHash({ nested: nested.flat }));
    const remade = createParser({ value: types.string });
    expect(toHash({ nested: nested.flat })).toEqual(toHash({ nested: remade.flat }));
  });
});

describe('derived token identity', () => {
  const { types } = initializeParser();

  it('includes accessor names, parameters and implementations in the hash', () => {
    expect(toHash({ value: types.number.round(2) })).not.toEqual(toHash({ value: types.number.round(3) }));
    expect(toHash({ value: types.number.round(2) })).toEqual(toHash({ value: types.number.round(2) }));
    expect(toHash({ value: types.string.upperCase })).not.toEqual(toHash({ value: types.string.lowerCase }));
    expect(toHash({ value: types.string.upperCase })).not.toEqual(toHash({ value: types.string }));
    expect(toHash({ value: types.string.strict })).not.toEqual(toHash({ value: types.string.loose }));
    expect(toHash({ value: types.string.upperCase.default('x') })).not.toEqual(toHash({ value: types.string.upperCase }));
    expect(toHash({ value: types.string({ default: 'x' }) })).toEqual(toHash({ value: types.string.default('x') }));
    expect(toHash({ value: types.string.required })).not.toEqual(toHash({ value: types.string }));
  });

  it('hashes to(fn) and extend(fn) by their source, stable across re-creation', () => {
    const a = types.string.to((value) => value.length);
    const b = types.string.to((value) => value.length);
    const c = types.string.to((value) => value.length + 1);
    expect(toHash({ a })).toEqual(toHash({ a: b }));
    expect(toHash({ a })).not.toEqual(toHash({ a: c }));
    expect(toHash({ a: types.string.extend((value) => value.trim()) })).not.toEqual(toHash({ a: types.string.to((value) => value.trim()) }));
    expect(toHash({ a: types.string.to(types.array.of(types.number)) })).not.toEqual(toHash({ a: types.string.to(types.array.of(types.string)) }));
  });

  it('distinguishes user accessor implementations', () => {
    const one = defineType({ extends: types.string, accessors: { part: (value) => value.split('@')[0] } });
    const two = defineType({ extends: types.string, accessors: { part: (value) => value.split('@')[1] } });
    expect(toHash({ value: one.part })).not.toEqual(toHash({ value: two.part }));
    const remade = defineType({ extends: types.string, accessors: { part: (value) => value.split('@')[0] } });
    expect(toHash({ value: one.part })).toEqual(toHash({ value: remade.part }));
  });
});
