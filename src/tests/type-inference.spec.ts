import { initializeParser, ParserReturnValue } from '../parser';
import { array as arrayType, defineType, number as numberType, string as stringType, StringType, NumberType, DateType, ArrayType, TypeToken } from '../types';
import { AppObject, DefaultParserTypes, ParserType, ParserTypeWithDefault } from '../parser-types';
import type { Carry, ParserTypeDefaulted } from '../type-token';
import { get, value, variable } from '../parser-util';
import { record } from '../types/data/record';
import { variables } from '../variables';

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

  it('infers store output types in projections, value functions and standalone', async () => {
    const { createParser: create, store } = initializeParser();
    const cached = store('profile-{{data.uid}}', async () => ({ role: 'admin' }));
    const cachedParser = create({
      profile: cached,
      viaContext: ({ store }) => store('count-ctx', async () => numberValue),
    });
    type CachedValue = ParserReturnValue<typeof cachedParser>;

    const standalone = await store('count', async () => numberValue);
    const matched = await store.match<number>('count');
    const key = await store.add({ value: numberValue, ttl: 60 });
    const positionalKey = await store.add('count', numberValue);

    // Object returns recurse through RealValue like any value function, so their fields come out optional
    const checks: [
      Expect<Equal<CachedValue['profile'], { role?: string } | undefined>>,
      Expect<Equal<CachedValue['viaContext'], number | undefined>>,
      Expect<Equal<typeof standalone, number>>,
      Expect<Equal<typeof matched, number | undefined>>,
      Expect<Equal<typeof key, string>>,
      Expect<Equal<typeof positionalKey, string>>,
    ] = [true, true, true, true, true, true];
    expect(checks.every(Boolean)).toBe(true);

    const data = await cachedParser({ uid: '1' });
    expect(data.profile).toEqual({ role: 'admin' });
    expect(data.viaContext).toEqual(numberValue);
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

describe('value / variable inference', () => {
  type IsOptional<T, K extends keyof T> = {} extends Pick<T, K> ? true : false;

  it('follows the token like get', () => {
    const parser = createParser({
      a: value('{{x}}', types.string),
      b: value('{{x}}', types.string.required),
      c: value('{{x}}', types.number.default(0)),
      d: variable('x', types.email),
      e: variable('x', types.text.required),
      f: variable('x'),
      g: variable<string>('x'),
    });
    type Out = ParserReturnValue<typeof parser>;
    const checks: [
      Expect<Equal<Out['a'], string | undefined>>,
      Expect<IsOptional<Out, 'a'>>,
      Expect<Equal<Out['b'], string>>,
      Expect<Equal<IsOptional<Out, 'b'>, false>>,
      Expect<Equal<Out['c'], number>>,
      Expect<Equal<Out['d'], string | undefined>>,
      Expect<Equal<Out['e'], string>>,
      Expect<Equal<Out['f'], unknown>>,
      Expect<Equal<Out['g'], string | undefined>>,
    ] = [true, true, true, true, true, true, true, true, true];
    expect(checks.every(Boolean)).toBe(true);
  });
});

describe('variables proxy inference', () => {
  type IsOptional<T, K extends keyof T> = {} extends Pick<T, K> ? true : false;

  it('is any unless asserted', () => {
    const parser = createParser({
      a: variables.year,
      b: variables.year as number,
      c: variables.lorem.ipsum as string,
    });
    type Out = ParserReturnValue<typeof parser>;
    const checks: [
      Expect<Equal<Out['a'], any>>,
      Expect<Equal<Out['b'], number | undefined>>,
      Expect<IsOptional<Out, 'b'>>,
      Expect<Equal<Out['c'], string | undefined>>,
    ] = [true, true, true, true];
    expect(checks.every(Boolean)).toBe(true);
  });
});

describe('.of() keeps a default or required set before it', () => {
  type IsOptional<T, K extends keyof T> = {} extends Pick<T, K> ? true : false;

  it('types the options-first and chain-last forms identically', async () => {
    const parser = createParser({
      a: types.array({ default: [] }).of(types.number),
      b: types.array.of(types.number).default([]),
      c: types.array.required.of(types.string),
      d: types.array.of(types.string),
      e: record({ default: {} }).of(types.number),
      f: record.of(types.number),
    });
    type Out = ParserReturnValue<typeof parser>;
    const checks: [
      Expect<Equal<Out['a'], number[]>>,
      Expect<Equal<IsOptional<Out, 'a'>, false>>,
      Expect<Equal<Out['a'], Out['b']>>,
      Expect<Equal<Out['c'], string[]>>,
      Expect<Equal<Out['d'], string[] | undefined>>,
      Expect<Equal<Out['e'], Record<string, number>>>,
      Expect<Equal<IsOptional<Out, 'e'>, false>>,
      Expect<Equal<Out['f'], Record<string, number> | undefined>>,
    ] = [true, true, true, true, true, true, true, true];
    expect(checks.every(Boolean)).toBe(true);
    expect(await parser({ c: ['x'] })).toEqual({ a: [], b: [], c: ['x'], e: {} });
    await expect(parser({})).rejects.toThrow('Missing required value');
  });
});

describe('required and default carry through the chain', () => {
  it('keeps the field non-optional after accessors and derivations', () => {
    const parser = createParser({
      domain: types.email.required.domain,
      upper: types.email.required.domain.upperCase,
      plain: types.email.domain,
      mapped: types.string.required.to((value) => value.length),
      composed: types.string.default('a').to(types.number),
    });
    type Value = ParserReturnValue<typeof parser>;
    const checks: [
      Expect<Equal<Value['domain'], string>>,
      Expect<Equal<Value['upper'], string>>,
      Expect<Equal<Value['plain'], string | undefined>>,
      Expect<Equal<Value['mapped'], number>>,
      Expect<Equal<Value['composed'], number>>,
    ] = [true, true, true, true, true];
    expect(checks.every(Boolean)).toBe(true);
  });
});

describe('required and default carry through built-in accessors', () => {
  it('follows every kind of derivation', () => {
    const parser = createParser({
      iso: types.date.required.iso,
      year: types.date.default(new Date(0)).year,
      length: types.string.default('a').length,
      lines: types.text.default('a').lines,
      split: types.string.required.split(','),
      first: types.array.required.of(types.number).first,
      joined: types.array.of(types.string).join('-'),
      optionalIso: types.date.iso,
      host: types.url.required.hostname.upperCase,
    });
    type Value = ParserReturnValue<typeof parser>;
    const checks: [
      Expect<Equal<Value['iso'], string>>,
      Expect<Equal<Value['year'], number>>,
      Expect<Equal<Value['length'], number>>,
      Expect<Equal<Value['lines'], string[]>>,
      Expect<Equal<Value['split'], string[]>>,
      Expect<Equal<Value['first'], number>>,
      Expect<Equal<Value['joined'], string | undefined>>,
      Expect<Equal<Value['optionalIso'], string | undefined>>,
      Expect<Equal<Value['host'], string>>,
    ] = [true, true, true, true, true, true, true, true, true];
    expect(checks.every(Boolean)).toBe(true);
  });
});

describe('required and default carry through custom class accessors', () => {
  class SkuType extends StringType {
    get slugged(): Carry<this, StringType> {
      return this.derive('slugged', (value) => value.toLowerCase(), [], types.string);
    }

    get size(): TypeToken<number> {
      return this.derive('size', (value) => value.length);
    }
  }
  const sku = defineType(SkuType);

  it('carries with a Carry annotation and stays optional with a plain one', async () => {
    const parser = createParser({ carried: sku.required.slugged, plain: sku.required.size, optional: sku.slugged });
    type Value = ParserReturnValue<typeof parser>;
    const checks: [
      Expect<Equal<Value['carried'], string>>,
      Expect<Equal<Value['plain'], number | undefined>>,
      Expect<Equal<Value['optional'], string | undefined>>,
    ] = [true, true, true];
    expect(checks.every(Boolean)).toBe(true);
    expect(await parser({ carried: 'AB', plain: 'AB' })).toEqual({ carried: 'ab', plain: 2 });
  });
});
