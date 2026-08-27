import { initializeParser, ParserReturnValue } from '../parser';
import { array as arrayType, defineType, number as numberType, string as stringType, StringType, NumberType, DateType, ArrayType, TypeToken } from '../types';
import { AppObject, DefaultParserTypes, ParserType, ParserTypeWithDefault } from '../parser-types';
import type { ParserTypeDefaulted } from '../type-token';
import { get } from '../parser-util';

type Expect<T extends true> = T;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

const email = defineType(async (value) => String(value));
const dmy = defineType({
  fn: (value) => {
    const date = new Date(value as string | number);
    return { day: date.getUTCDate(), month: date.getUTCMonth() + 1, year: date.getUTCFullYear() };
  },
});

const { createParser, types } = initializeParser();

const numberValue: number = 123;

const nestedParser = createParser({ inner: types.string });
const metaParser = createParser({ metaTitle: types.string });

const label = defineType({ fn: (value) => String(value), default: 'none' });
const json = defineType((value) => (typeof value === 'string' ? JSON.parse(value) : value));

const parser = createParser({
  displayName: types.string.default('List item'),
  retries: types.number.default(0),
  label,
  flatMeta: metaParser.flat,
  title: types.string,
  priority: types.number,
  ok: types.boolean,
  when: types.date,
  meta: types.object,
  mystery: types.unknown,
  tags: types.array.of(types.string),
  matrix: types.array.of(types.array.of(types.number)),
  raw: types.array,
  email,
  published: dmy,
  fromEntryPoint: stringType,
  scoresFromEntryPoint: arrayType.of(numberType),
  constant: 'fixed',
  fn: async () => numberValue,
  nested: nestedParser,
  '@if': [{ when: () => true, then: { conditional: types.string } }],
  '@combine': async (): Promise<{ combined: number }> => ({ combined: numberValue }),
  // chained
  shout: types.string.upperCase,
  year: types.date.year,
  iso: types.date.iso,
  rounded: types.number.round(2),
  firstTag: types.array.of(types.string).first,
  tagCount: types.array.of(types.string).length,
  parts: types.string.split(','),
  strictNumber: types.number.strict,
  looseDefaulted: types.number.loose.default(0),
  derived: types.string.to((value) => value.length),
  extended: types.string.extend((value) => value.trim()),
  composed: json.to(types.array.of(types.number)),
});

type Value = ParserReturnValue<typeof parser>;

describe('type inference', () => {
  it('infers output types from the projection', async () => {
    const checks: [
      Expect<Equal<Value['title'], string | undefined>>,
      Expect<Equal<Value['priority'], number | undefined>>,
      Expect<Equal<Value['ok'], boolean | undefined>>,
      Expect<Equal<Value['when'], Date | undefined>>,
      Expect<Equal<Value['meta'], AppObject | undefined>>,
      Expect<Equal<Value['mystery'], unknown>>,
      Expect<Equal<Value['tags'], string[] | undefined>>,
      Expect<Equal<Value['matrix'], number[][] | undefined>>,
      Expect<Equal<Value['raw'], unknown[] | undefined>>,
      Expect<Equal<Value['email'], string | undefined>>,
      Expect<Equal<Value['published'], { day: number; month: number; year: number } | undefined>>,
      Expect<Equal<NonNullable<Value['published']>['day'], number>>,
      Expect<Equal<Value['fromEntryPoint'], string | undefined>>,
      Expect<Equal<Value['scoresFromEntryPoint'], number[] | undefined>>,
      Expect<Equal<Value['constant'], 'fixed' | undefined>>,
      Expect<Equal<Value['fn'], number | undefined>>,
      Expect<Equal<NonNullable<Value['nested']>['inner'], string | undefined>>,
      Expect<Equal<Value['conditional'], string | undefined>>,
      Expect<Equal<Value['combined'], number | undefined>>,
      // Defaulted fields are non-optional; .flat fields merge in and the flat key disappears
      Expect<Equal<Value['displayName'], string>>,
      Expect<Equal<Value['retries'], number>>,
      Expect<Equal<Value['label'], string>>,
      Expect<Equal<Value['metaTitle'], string | undefined>>,
      Expect<Equal<'flatMeta' extends keyof Value ? true : false, false>>,
      // Chained tokens carry the accessor's output type
      Expect<Equal<Value['shout'], string | undefined>>,
      Expect<Equal<Value['year'], number | undefined>>,
      Expect<Equal<Value['iso'], string | undefined>>,
      Expect<Equal<Value['rounded'], number | undefined>>,
      Expect<Equal<Value['firstTag'], string | undefined>>,
      Expect<Equal<Value['tagCount'], number | undefined>>,
      Expect<Equal<Value['parts'], string[] | undefined>>,
      Expect<Equal<Value['strictNumber'], number | undefined>>,
      Expect<Equal<Value['looseDefaulted'], number>>,
      Expect<Equal<Value['derived'], number | undefined>>,
      Expect<Equal<Value['extended'], string | undefined>>,
      Expect<Equal<Value['composed'], number[] | undefined>>,
    ] = [
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
    ];
    expect(checks.every(Boolean)).toBe(true);

    const data = await parser({
      title: 'hello',
      priority: '2',
      tags: ['a', 1],
      scoresFromEntryPoint: ['3', 4],
      flatMeta: { metaTitle: 'm' },
      shout: 'hey',
      year: '2024-05-15',
      rounded: 1.005,
      parts: 'a,b',
      composed: '[1, "2"]',
    });
    expect(data.title).toEqual('hello');
    expect(data.priority).toEqual(2);
    expect(data.tags).toEqual(['a', '1']);
    expect(data.scoresFromEntryPoint).toEqual([3, 4]);
    expect(data.displayName).toEqual('List item');
    expect(data.retries).toEqual(0);
    expect(data.label).toEqual('none');
    expect(data.metaTitle).toEqual('m');
    expect(data.shout).toEqual('HEY');
    expect(data.year).toEqual(2024);
    expect(data.rounded).toEqual(1.01);
    expect(data.parts).toEqual(['a', 'b']);
    expect(data.looseDefaulted).toEqual(0);
  });

  it('defineType preserves the output type', () => {
    const single = defineType({
      fn: (value) => {
        const date = new Date(value as string | number);
        return { day: date.getUTCDate() };
      },
      strict: true,
    });
    const check: Expect<Equal<typeof single, TypeToken<{ day: number }>>> = true;
    expect(check).toBe(true);
    expect(single).toBeInstanceOf(TypeToken);
    const asAlias: ParserType<{ day: number }> = single;
    expect(asAlias).toBe(single);
  });

  it('marks defaulted, required and options-configured types with ParserTypeWithDefault', () => {
    const chained = types.string.default('x');
    const defined = defineType({ fn: (value) => Number(value), default: 0 });
    const asAlias: ParserTypeWithDefault<number> = defined;
    const called = types.string({ default: 'x' });
    const required = types.number.required;
    const requiredCall = types.number({ required: true });
    const plainCall = types.number({ strict: true });
    const classFactory = defineType(StringType, { default: 'y' });
    const checks: [
      Expect<Equal<typeof chained, StringType & ParserTypeDefaulted>>,
      Expect<Equal<typeof defined, ParserTypeWithDefault<number>>>,
      Expect<Equal<typeof called, StringType & ParserTypeDefaulted>>,
      Expect<Equal<typeof required, NumberType & ParserTypeDefaulted>>,
      Expect<Equal<typeof requiredCall, NumberType & ParserTypeDefaulted>>,
      Expect<Equal<typeof plainCall, NumberType>>,
      Expect<Equal<typeof classFactory, StringType & ParserTypeDefaulted>>,
    ] = [true, true, true, true, true, true, true];
    expect(checks.every(Boolean)).toBe(true);
    expect(asAlias).toBe(defined);
    const requiredParser = createParser({ n: types.number.required, s: types.string({ default: 'x' }) });
    type RequiredValue = ParserReturnValue<typeof requiredParser>;
    const requiredChecks: [Expect<Equal<RequiredValue['n'], number>>, Expect<Equal<RequiredValue['s'], string>>] = [true, true];
    expect(requiredChecks.every(Boolean)).toBe(true);
  });

  it('keeps the family through transforms and the intersection through defaults', () => {
    const emailLike = defineType({ extends: types.string, fn: (value) => value.toLowerCase(), accessors: { domain: (value) => value.split('@')[1] } });
    const check: Expect<Equal<typeof types.email.domain, StringType>> = true;
    expect(check).toBe(true);
    const checks: [
      Expect<Equal<typeof types.string.upperCase, StringType>>,
      Expect<Equal<typeof types.number.round, (decimals?: number) => NumberType>>,
      Expect<Equal<typeof types.date.iso, StringType>>,
      Expect<Equal<typeof types.date.year, TypeToken<number>>>,
      Expect<Equal<ReturnType<typeof types.array.of<string>>, ArrayType<string>>>,
      Expect<Equal<typeof emailLike.domain, TypeToken<string>>>,
      Expect<Equal<typeof emailLike.upperCase, typeof emailLike>>,
      Expect<Equal<ReturnType<typeof emailLike.default>, typeof emailLike & ParserTypeDefaulted>>,
    ] = [true, true, true, true, true, true, true, true];
    expect(checks.every(Boolean)).toBe(true);
  });

  it('infers cacheResult output types in projections and standalone', async () => {
    const { createParser: create, cacheResult } = initializeParser();
    const cached = cacheResult('profile-{{data.uid}}', async () => ({ role: 'admin' }));
    const cachedParser = create({ profile: cached });
    type CachedValue = ParserReturnValue<typeof cachedParser>;

    const standalone = await cacheResult('count', async () => numberValue);

    // Object returns recurse through RealValue like any value function, so their fields come out optional
    const checks: [Expect<Equal<CachedValue['profile'], { role?: string } | undefined>>, Expect<Equal<typeof standalone, number>>] = [true, true];
    expect(checks.every(Boolean)).toBe(true);

    const data = await cachedParser({ uid: '1' });
    expect(data.profile).toEqual({ role: 'admin' });
    expect(standalone).toEqual(numberValue);
  });

  it('returns the default types from initializeParser', () => {
    const { types: defaultTypes } = initializeParser();
    const checks: [
      Expect<Equal<typeof defaultTypes, DefaultParserTypes>>,
      Expect<Equal<(typeof defaultTypes)['string'], StringType>>,
      Expect<Equal<(typeof defaultTypes)['date'], DateType>>,
      Expect<Equal<(typeof defaultTypes)['array'], ArrayType>>,
      Expect<Equal<typeof stringType, StringType>>,
      Expect<Equal<typeof arrayType, ArrayType>>,
    ] = [true, true, true, true, true, true];
    expect(checks.every(Boolean)).toBe(true);
  });
});

describe('get inference', () => {
  type IsOptional<T, K extends keyof T> = {} extends Pick<T, K> ? true : false;

  it('follows the token: optional by default, required with a default or required marker', async () => {
    const parser = createParser({
      a: get('x', types.tel),
      b: get('x', types.tel.href.default('tel:')),
      c: get('x', types.text.required),
      d: get('x', types.text.wordCount),
      e: get('x'),
      f: get('x', { x: 1 }, types.number),
      g: get('x', { x: 1 }),
    });
    type Out = ParserReturnValue<typeof parser>;
    const standalone = await get('x', { x: 1 }, types.number.default(0));
    const checks: [
      Expect<Equal<Out['a'], string | undefined>>,
      Expect<IsOptional<Out, 'a'>>,
      Expect<Equal<Out['b'], string>>,
      Expect<Equal<IsOptional<Out, 'b'>, false>>,
      Expect<Equal<Out['c'], string>>,
      Expect<Equal<Out['d'], number | undefined>>,
      Expect<Equal<Out['e'], unknown>>,
      Expect<Equal<Out['f'], number | undefined>>,
      Expect<Equal<Out['g'], unknown>>,
      Expect<Equal<typeof standalone, number>>,
    ] = [true, true, true, true, true, true, true, true, true, true];
    expect(checks.every(Boolean)).toBe(true);
    expect(standalone).toEqual(1);
  });
});
