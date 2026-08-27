import { initializeParser } from '../parser';
import { ParserCastError } from '../parser-casting';
import { ParserContextTransformer } from '../parser-types';

const { createParser, types } = initializeParser();

describe('casting', () => {
  it('casts values to string', async () => {
    const parser = createParser({ a: types.string, b: types.string, c: types.string, d: types.string });
    const date = new Date('2020-01-01T00:00:00.000Z');
    const data = await parser({ a: 'hello', b: 21, c: true, d: date });
    expect(data.a).toEqual('hello');
    expect(data.b).toEqual('21');
    expect(data.c).toEqual('true');
    expect(data.d).toEqual('2020-01-01T00:00:00.000Z');
  });

  it('fails to cast invalid strings', async () => {
    const parser = createParser({ value: types.string });
    await expect(parser({ value: { nested: true } })).rejects.toThrow(ParserCastError);
    await expect(parser({ value: NaN })).rejects.toThrow('cannot cast value to "string"');
  });

  it('casts values to number', async () => {
    const parser = createParser({ a: types.number, b: types.number, c: types.number, d: types.number, e: types.number, f: types.number });
    const date = new Date('2020-01-01T00:00:00.000Z');
    const data = await parser({ a: 21, b: '21', c: '12.5', d: true, e: false, f: date });
    expect(data.a).toEqual(21);
    expect(data.b).toEqual(21);
    expect(data.c).toEqual(12.5);
    expect(data.d).toEqual(1);
    expect(data.e).toEqual(0);
    expect(data.f).toEqual(date.getTime());
  });

  it('fails to cast invalid numbers', async () => {
    const parser = createParser({ value: types.number });
    await expect(parser({ value: '12px' })).rejects.toThrow(ParserCastError);
    // The empty string is missing, never a cast failure
    expect(await parser({ value: '' })).toEqual({});
    await expect(parser({ value: { nested: true } })).rejects.toThrow(ParserCastError);
  });

  it('casts values to boolean', async () => {
    const parser = createParser({ a: types.boolean, b: types.boolean, c: types.boolean, d: types.boolean });
    const data = await parser({ a: true, b: 'true', c: ' FALSE ', d: 0 });
    expect(data.a).toEqual(true);
    expect(data.b).toEqual(true);
    expect(data.c).toEqual(false);
    expect(data.d).toEqual(false);
  });

  it('fails to cast invalid booleans', async () => {
    const parser = createParser({ value: types.boolean });
    await expect(parser({ value: 'yes' })).rejects.toThrow(ParserCastError);
    await expect(parser({ value: 2 })).rejects.toThrow(ParserCastError);
  });

  it('casts values to date', async () => {
    const parser = createParser({ a: types.date, b: types.date, c: types.date });
    const date = new Date('2020-01-01T00:00:00.000Z');
    const data = await parser({ a: date, b: '2020-01-01T00:00:00.000Z', c: date.getTime() });
    expect(data.a).toBeInstanceOf(Date);
    expect(data.a?.getTime()).toEqual(date.getTime());
    expect(data.b?.getTime()).toEqual(date.getTime());
    expect(data.c?.getTime()).toEqual(date.getTime());
  });

  it('fails to cast invalid dates', async () => {
    const parser = createParser({ value: types.date });
    await expect(parser({ value: 'not-a-date' })).rejects.toThrow(ParserCastError);
    await expect(parser({ value: true })).rejects.toThrow(ParserCastError);
  });

  it('validates objects', async () => {
    const parser = createParser({ value: types.object });
    const data = await parser({ value: { nested: true } });
    expect(data.value).toEqual({ nested: true });
    await expect(parser({ value: 'hello' })).rejects.toThrow(ParserCastError);
    await expect(parser({ value: [1, 2] })).rejects.toThrow(ParserCastError);
  });

  it('passes any and unknown through without casting', async () => {
    const parser = createParser({ a: types.any, b: types.unknown });
    const data = await parser({ a: { deep: [1] }, b: 'whatever' });
    expect(data.a).toEqual({ deep: [1] });
    expect(data.b).toEqual('whatever');
  });

  it('skips casting for missing and null values', async () => {
    const parser = createParser({ missing: types.number, nulled: types.number });
    const data = await parser({ nulled: null });
    expect(data.missing).toBeUndefined();
    expect(data.nulled).toBeUndefined();
    expect(Object.keys(data)).toHaveLength(0);
  });

  it('casts after variables have been resolved', async () => {
    const parser = createParser({ age: types.number, active: types.boolean });
    const data = await parser({ age: '{{userAge}}', active: '{{isActive}}' }, { variables: { userAge: '21', isActive: 'true' } });
    expect(data.age).toEqual(21);
    expect(data.active).toEqual(true);
  });

  it('casts dot-path variables resolving to non-string values', async () => {
    const parser = createParser({ age: types.number, active: types.boolean, joined: types.date });
    const joined = new Date('2020-01-01T00:00:00.000Z');
    const data = await parser(
      { age: '{{user.age}}', active: '{{user.active}}', joined: '{{user.joined}}' },
      { variables: { user: { age: 42, active: true, joined } } },
    );
    expect(data.age).toEqual(42);
    expect(data.active).toEqual(true);
    expect(data.joined?.getTime()).toEqual(joined.getTime());
  });

  it('casts interpolated strings after variable replacement', async () => {
    const parser = createParser({ price: types.number });
    const data = await parser({ price: '{{euros}}.50' }, { variables: { euros: 12 } });
    expect(data.price).toEqual(12.5);
  });

  it('skips casting when a variable resolves to undefined', async () => {
    const parser = createParser({ age: types.number });
    const data = await parser({ age: '{{user.age}}' }, { variables: { user: {} } });
    expect(data.age).toBeUndefined();
    expect(Object.keys(data)).toHaveLength(0);
  });

  it('applies the type default when a variable resolves to undefined', async () => {
    const parser = createParser({ age: types.number.default(18) });
    const data = await parser({ age: '{{user.age}}' }, { variables: { user: {} } });
    expect(data.age).toEqual(18);
  });

  it('still fails when a variable resolves to an uncastable value', async () => {
    const parser = createParser({ age: types.number });
    await expect(parser({ age: '{{user.age}}' }, { variables: { user: { age: 'not-a-number' } } })).rejects.toThrow(ParserCastError);
  });

  it('casts after transformers have been applied', async () => {
    const unwrap: ParserContextTransformer = {
      when: ({ data }) => !!data && typeof data === 'object' && 'raw' in (data as object),
      then: ({ data }) => (data as { raw: unknown }).raw,
    };
    const { createParser: createTransformingParser, types: t } = initializeParser({ transformers: { unwrap } });
    const parser = createTransformingParser({ amount: t.number });
    const data = await parser({ amount: { raw: '42' } });
    expect(data.amount).toEqual(42);
  });
});

describe('missing values', () => {
  const { createParser, types } = initializeParser();

  it("treats undefined, null and '' as missing for every type — never a failure", async () => {
    const parser = createParser({ s: types.string, n: types.number, b: types.boolean, d: types.date, e: types.email, o: types.oneOf('a', 'b') });
    expect(await parser({ s: '', n: null, b: undefined, d: '', e: '', o: '' })).toEqual({});
    expect(await parser({ s: '', n: '', b: '', d: null, e: null, o: null })).toEqual({});
  });

  it('keeps false, 0 and whitespace as present values', async () => {
    const parser = createParser({ b: types.boolean, n: types.number, s: types.string, t: types.text });
    expect(await parser({ b: false, n: 0, s: ' ', t: 'x' })).toEqual({ b: false, n: 0, s: ' ', t: 'x' });
    await expect(parser({ n: ' ' })).rejects.toThrow(ParserCastError);
  });

  it('fills defaults for missing values, including the empty string', async () => {
    const parser = createParser({ title: types.string({ default: 'Untitled' }), count: types.number.default(0) });
    expect(await parser({ title: '', count: null })).toEqual({ title: 'Untitled', count: 0 });
  });

  it('only a required token complains about missing values', async () => {
    const parser = createParser({ title: types.string.required, slug: types.string({ required: true }), free: types.string });
    await expect(parser({ title: '', slug: 'x' })).rejects.toThrow('Parser cast error at "title": cannot cast value to "string" — Missing required value');
    await expect(parser({ title: 'x', slug: null })).rejects.toThrow('at "slug"');
    expect(await parser({ title: 'a', slug: 'b', free: '' })).toEqual({ title: 'a', slug: 'b' });
  });
});
