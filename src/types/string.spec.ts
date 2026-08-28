import { initializeParser } from '../parser';
import { ArrayType, string, StringType, TypeToken } from './index';

const { createParser, types } = initializeParser();

describe('string type', () => {
  it('casts like before', async () => {
    const parser = createParser({ a: types.string, b: types.string, c: types.string, d: types.string });
    const when = new Date('2024-05-15T00:00:00.000Z');
    expect(await parser({ a: 'x', b: 12.5, c: true, d: when })).toEqual({ a: 'x', b: '12.5', c: 'true', d: when.toISOString() });
    await expect(parser({ a: { nope: true } })).rejects.toThrow('Invalid string');
    await expect(parser({ a: NaN })).rejects.toThrow('Invalid string');
  });

  it('transforms keep the family and chain', async () => {
    const parser = createParser({
      upper: types.string.upperCase,
      lower: types.string.lowerCase,
      cap: types.string.capitalize,
      title: types.string.titleCase,
      camel: types.string.camel,
      pascal: types.string.pascal,
      kebab: types.string.kebab,
      snake: types.string.snake,
      trim: types.string.trim,
      trunc: types.string.truncate(5),
      truncPlain: types.string.truncate(5, false),
      short: types.string.truncate(10),
      replaced: types.string.replace(/a/g, 'o'),
      chained: types.string.trim.upperCase.truncate(4),
    });
    const data = await parser({
      upper: 'hey',
      lower: 'HEY',
      cap: 'hello world',
      title: 'hello wide world',
      camel: 'Hello big-World_now',
      pascal: 'hello big-world',
      kebab: 'helloBigWorld HTMLParser',
      snake: 'Hello Big World',
      trim: '  x  ',
      trunc: 'abcdefgh',
      truncPlain: 'abcdefgh',
      short: 'abc',
      replaced: 'banana',
      chained: '  hello  ',
    });
    expect(data).toEqual({
      upper: 'HEY',
      lower: 'hey',
      cap: 'Hello world',
      title: 'Hello Wide World',
      camel: 'helloBigWorldNow',
      pascal: 'HelloBigWorld',
      kebab: 'hello-big-world-html-parser',
      snake: 'hello_big_world',
      trim: 'x',
      trunc: 'abcd…',
      truncPlain: 'abcde',
      short: 'abc',
      replaced: 'bonono',
      chained: 'HEL…',
    });
    expect(types.string.upperCase).toBeInstanceOf(StringType);
    expect(types.string.upperCase).toBe(types.string.upperCase);
    expect(types.string.truncate(5)).toBe(types.string.truncate(5));
  });

  it('derivations return the new type', async () => {
    const parser = createParser({ len: types.string.length, parts: types.string.split(','), firstPart: types.string.split(',').first });
    expect(await parser({ len: 'four', parts: 'a,b', firstPart: 'x,y' })).toEqual({ len: 4, parts: ['a', 'b'], firstPart: 'x' });
    expect(types.string.length).toBeInstanceOf(TypeToken);
    expect(types.string.length).not.toBeInstanceOf(StringType);
    expect(types.string.split(',')).toBeInstanceOf(ArrayType);
  });

  it('accessors cast to string first (a number gets upper-cased as text)', async () => {
    const parser = createParser({ value: types.string.upperCase, len: types.string.length });
    expect(await parser({ value: 12, len: 12345 })).toEqual({ value: '12', len: 5 });
    await expect(parser({ value: { nope: true } })).rejects.toThrow('cannot cast value to "string.upperCase"');
  });

  it('is the same token as the types entry point', () => {
    expect(string).toBe(types.string);
  });

  it("treats '' as missing (raw input contract) while keeping other whitespace, unlike text", async () => {
    const { createParser, types } = initializeParser();
    const parser = createParser({
      raw: types.string,
      upper: types.string.upperCase,
      len: types.string.length,
      filled: types.string.default('fallback'),
      nested: { inner: types.string },
      textual: types.text,
      viaPipe: '{{ empty | string || "fallback" }}',
    });
    expect(await parser({ raw: '', upper: '', len: '', filled: '', nested: { inner: '' }, textual: ' ' }, { variables: { empty: '' } })).toEqual({
      filled: 'fallback',
      nested: {},
      viaPipe: 'fallback',
    });
    expect(await parser({ raw: '  ', upper: ' x ', len: ' ', textual: ' x ' }, { variables: { empty: '' } })).toEqual({
      raw: '  ',
      upper: ' X ',
      len: 1,
      filled: 'fallback',
      textual: 'x',
      viaPipe: 'fallback',
    });
  });
});
