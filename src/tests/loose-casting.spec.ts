import { initializeParser } from '../parser';
import { defineType, ParserCastError } from '../parser-casting';

describe('loose casting', () => {
  it('throws by default when casting fails', async () => {
    const { createParser, types } = initializeParser();
    const parser = createParser({ value: types.number });
    await expect(parser({ value: 'abc' })).rejects.toThrow(ParserCastError);
    await expect(parser({ value: 'abc' })).rejects.toThrow('Parser cast error at "value"');
  });

  it('logs and drops the value with looseCasting: true (the key is omitted)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { createParser, types } = initializeParser({ looseCasting: true });
    const parser = createParser({ value: types.number, other: types.string });
    const data = await parser({ value: 'abc', other: 'ok' });
    expect(data.value).toBeUndefined();
    expect(Object.keys(data)).toEqual(['other']);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("accepts the deprecated 'undefined' alias as the same flow", async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { createParser, types } = initializeParser({ looseCasting: 'undefined' });
    const parser = createParser({ value: types.number, other: types.string });
    const data = await parser({ value: 'abc', other: 'ok' });
    expect(data.value).toBeUndefined();
    expect(Object.keys(data)).toEqual(['other']);
    warn.mockRestore();
  });

  it('overrides looseCasting per parser', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { createParser, types } = initializeParser();
    const parser = createParser({ value: types.number }, { looseCasting: true });
    const data = await parser({ value: 'abc' });
    expect(data.value).toBeUndefined();
    warn.mockRestore();
  });

  it('overrides looseCasting per call', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { createParser, types } = initializeParser();
    const parser = createParser({ value: types.number });
    const data = await parser({ value: 'abc' }, { looseCasting: true });
    expect(data.value).toBeUndefined();
    await expect(parser({ value: 'abc' })).rejects.toThrow(ParserCastError);
    warn.mockRestore();
  });

  it('supports strict via object definitions', async () => {
    const positive = defineType({
      fn: (value) => {
        const parsed = Number(value);
        if (!(parsed > 0)) throw new Error('Not positive');
        return parsed;
      },
      strict: true,
    });
    const { createParser } = initializeParser({ looseCasting: true });
    const parser = createParser({ value: positive });
    await expect(parser({ value: -5 })).rejects.toThrow('Not positive');
  });

  it('onCastError receives the error and replaces the warning with looseCasting: true', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const errors: ParserCastError[] = [];
    const { createParser, types } = initializeParser({ looseCasting: true, onCastError: (error) => errors.push(error) });
    const parser = createParser({ value: types.number });

    const data = await parser({ value: 'abc' });
    expect(data.value).toBeUndefined();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(ParserCastError);
    expect(errors[0].path).toEqual('value');
    expect(errors[0].type).toEqual('number');
    expect(errors[0].received).toEqual('abc');
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('onCastError fires before the error is thrown by default', async () => {
    const errors: ParserCastError[] = [];
    const { createParser, types } = initializeParser({ onCastError: (error) => errors.push(error) });
    const parser = createParser({ value: types.number });

    await expect(parser({ value: 'abc' })).rejects.toThrow(ParserCastError);
    expect(errors).toHaveLength(1);
  });

  it('onCastError can be set per parser and per call', async () => {
    const parserErrors: ParserCastError[] = [];
    const callErrors: ParserCastError[] = [];
    const { createParser, types } = initializeParser({ looseCasting: true });

    const parser = createParser({ value: types.number }, { onCastError: (error) => parserErrors.push(error) });
    await parser({ value: 'abc' });
    expect(parserErrors).toHaveLength(1);

    await parser({ value: 'abc' }, { onCastError: (error) => callErrors.push(error) });
    expect(callErrors).toHaveLength(1);
    expect(parserErrors).toHaveLength(1);
  });

  it('strict types always throw regardless of looseCasting', async () => {
    const hex = defineType({
      fn: (value) => {
        if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error('Invalid hex color');
        return value;
      },
      strict: true,
    });
    const { createParser } = initializeParser({ looseCasting: true });
    const parser = createParser({ color: hex, direct: hex });

    const data = await parser({ color: '#ffffff', direct: '#000000' });
    expect(data.color).toEqual('#ffffff');
    expect(data.direct).toEqual('#000000');

    await expect(parser({ color: '#fff', direct: '#000000' })).rejects.toThrow(ParserCastError);
    await expect(parser({ color: '#ffffff', direct: '#000' })).rejects.toThrow(ParserCastError);
  });

  it('.strict pins throwing on any token', async () => {
    const { createParser, types } = initializeParser({ looseCasting: true });
    const parser = createParser({ value: types.number.strict });
    await expect(parser({ value: 'abc' })).rejects.toThrow(ParserCastError);
    expect(types.number.strict).toBe(types.number.strict);
  });

  it('.loose pins undefined (then the default) on any token, silently, and still reports to onCastError', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const errors: ParserCastError[] = [];
    const { createParser, types } = initializeParser({ onCastError: (error) => errors.push(error) });
    const parser = createParser({ value: types.number.loose, filled: types.number.loose.default(0) });
    const data = await parser({ value: 'abc', filled: 'abc' });
    expect(data.value).toBeUndefined();
    expect(data.filled).toEqual(0);
    expect(errors).toHaveLength(2);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('casts standalone with .cast(), throwing on failure', async () => {
    const { types } = initializeParser();
    expect(await types.number.cast('12')).toEqual(12);
    await expect(async () => types.number.cast('abc')).rejects.toThrow('Invalid number');
    expect(await types.array.of(types.number).cast(['1', 2])).toEqual([1, 2]);
    await expect(types.array.of(types.number).cast(['1', 'x'])).rejects.toThrow('at "1"');
  });

  it('required follows the two flows: throws by default, dropped and logged under looseCasting, pinned by .strict', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const errors: ParserCastError[] = [];
    const { createParser, types } = initializeParser({ onCastError: (error) => errors.push(error) });
    const parser = createParser({ title: types.string.required });
    await expect(parser({})).rejects.toThrow('Missing required value');
    expect(await parser({}, { looseCasting: true })).toEqual({});
    await expect(parser({ title: '' }, { looseCasting: true, onCastError: undefined })).resolves.toEqual({});
    expect(warn).toHaveBeenCalledTimes(1);
    const strict = createParser({ title: types.string.required.strict });
    await expect(strict({}, { looseCasting: true })).rejects.toThrow('Missing required value');
    expect(errors).toHaveLength(3);
    expect(errors[0].received).toBeUndefined();
    warn.mockRestore();
  });

  it('accepts strict and loose through the options object', async () => {
    const { createParser, types } = initializeParser({ looseCasting: true, onCastError: () => undefined });
    await expect(createParser({ v: types.number({ strict: true }) })({ v: 'x' })).rejects.toThrow(ParserCastError);
    expect(await createParser({ v: types.number({ loose: true, default: 1 }) })({ v: 'x' })).toEqual({ v: 1 });
    expect(() => types.number({ strict: true, loose: true })).toThrow('cannot be both strict and loose');
    expect(() => (types.number as unknown as (arg: unknown) => unknown)('nope')).toThrow('expected an options object');
  });
});
