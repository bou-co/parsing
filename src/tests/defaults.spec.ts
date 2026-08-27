import { initializeParser } from '../parser';
import { defineType, ParserCastError } from '../parser-casting';

describe('type defaults', () => {
  it('applies the default when the input is undefined', async () => {
    const { createParser, types } = initializeParser();
    const parser = createParser({ displayName: types.string.default('List item') });
    const data = await parser({ other: true });
    expect(data.displayName).toEqual('List item');
  });

  it('applies the default when the input is null', async () => {
    const { createParser, types } = initializeParser();
    const parser = createParser({ displayName: types.string.default('List item') });
    const data = await parser({ displayName: null });
    expect(data.displayName).toEqual('List item');
  });

  it('keeps valid input values untouched', async () => {
    const { createParser, types } = initializeParser();
    const parser = createParser({ displayName: types.string.default('List item'), count: types.number.default(0) });
    const data = await parser({ displayName: 'Hello', count: '5' });
    expect(data.displayName).toEqual('Hello');
    expect(data.count).toEqual(5);
  });

  it('applies the default when a failed cast resolves to undefined', async () => {
    const onCastError = vi.fn();
    const { createParser, types } = initializeParser({ looseCasting: true, onCastError });
    const parser = createParser({ count: types.number.default(0) });
    const data = await parser({ count: 'abc' });
    expect(data.count).toEqual(0);
    expect(onCastError).toHaveBeenCalledWith(expect.any(ParserCastError), expect.anything());
  });

  it('still throws by default when casting fails', async () => {
    const { createParser, types } = initializeParser();
    const parser = createParser({ count: types.number.default(0) });
    await expect(parser({ count: 'abc' })).rejects.toThrow(ParserCastError);
  });

  it('combines defaults with strict types: default for missing input, throw on bad input', async () => {
    const positive = defineType({
      fn: (value) => {
        const parsed = Number(value);
        if (!(parsed > 0)) throw new Error('Not positive');
        return parsed;
      },
      strict: true,
      default: 1,
    });
    const { createParser } = initializeParser({ looseCasting: true });
    const parser = createParser({ value: positive });
    expect((await parser({ other: true })).value).toEqual(1);
    await expect(parser({ value: -2 })).rejects.toThrow(ParserCastError);
  });

  it('supports defaults on bare and parameterized array types', async () => {
    const { createParser, types } = initializeParser();
    const parser = createParser({
      raw: types.array.default([]),
      tags: types.array.of(types.string).default(['none']),
    });
    const data = await parser({ other: true });
    expect(data.raw).toEqual([]);
    expect(data.tags).toEqual(['none']);
    const filled = await parser({ raw: [1], tags: [2] });
    expect(filled.raw).toEqual([1]);
    expect(filled.tags).toEqual(['2']);
  });

  it('supports defaults via defineType object definitions', async () => {
    const email = defineType({ fn: (value) => String(value).toLowerCase(), default: 'unknown@example.com' });
    const { createParser } = initializeParser();
    const parser = createParser({ email });
    expect((await parser({ other: true })).email).toEqual('unknown@example.com');
    expect((await parser({ email: 'A@B.CO' })).email).toEqual('a@b.co');
  });

  it('does not cast the default value itself', async () => {
    const { createParser, types } = initializeParser();
    const marker = { reason: 'missing' };
    const parser = createParser({ meta: types.object.default(marker) });
    const data = await parser({ other: true });
    expect(data.meta).toBe(marker);
  });

  it('chains with accessors — the default applies at the end of the chain', async () => {
    const { createParser, types } = initializeParser();
    const parser = createParser({ year: types.date.year.default(1970), shout: types.string.upperCase.default('NONE') });
    const data = await parser({ other: true });
    expect(data.year).toEqual(1970);
    expect(data.shout).toEqual('NONE');
    const filled = await parser({ year: '2024-05-15', shout: 'hi' });
    expect(filled.year).toEqual(2024);
    expect(filled.shout).toEqual('HI');
  });

  it('exposes the default value on the token', () => {
    const { types } = initializeParser();
    expect(types.number.default(3).defaultValue).toEqual(3);
    expect(types.number.defaultValue).toBeUndefined();
  });

  it('accepts the options-object form, identical to the chain', async () => {
    const { createParser, types } = initializeParser();
    const parser = createParser({
      a: types.string({ default: 'x' }),
      b: types.array({ default: ['none'] }).of(types.string),
      c: types.array.of(types.string)({ default: ['none'] }),
      d: types.date.year({ default: 1970 }),
    });
    expect(await parser({})).toEqual({ a: 'x', b: ['none'], c: ['none'], d: 1970 });
    expect(await parser({ a: '', b: [1], c: null, d: '2024-05-15' })).toEqual({ a: 'x', b: ['1'], c: ['none'], d: 2024 });
    expect(String(types.string({ default: 'x' }))).toEqual(String(types.string.default('x')));
    expect(types.string({ default: 'x' }).defaultValue).toEqual('x');
    expect(types.string({})).not.toBe(types.string);
    expect(types.string()).toBe(types.string);
  });
});
