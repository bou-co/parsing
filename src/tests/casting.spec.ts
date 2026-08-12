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
    await expect(parser({ value: '' })).rejects.toThrow(ParserCastError);
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
