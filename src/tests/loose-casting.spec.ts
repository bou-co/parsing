import { initializeParser } from '../parser';
import { defineType, ParserCastError } from '../parser-casting';

describe('loose casting', () => {
  it('throws by default when casting fails', async () => {
    const { createParser, types } = initializeParser();
    const parser = createParser({ value: types.number });
    await expect(parser({ value: 'abc' })).rejects.toThrow(ParserCastError);
    await expect(parser({ value: 'abc' })).rejects.toThrow('Parser cast error at "value"');
  });

  it('passes the original value through with looseCasting: true', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { createParser, types } = initializeParser({ looseCasting: true });
    const parser = createParser({ value: types.number });
    const data = await parser({ value: 'abc' });
    expect(data.value).toEqual('abc');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('returns undefined with looseCasting: "undefined"', async () => {
    const { createParser, types } = initializeParser({ looseCasting: 'undefined' });
    const parser = createParser({ value: types.number, other: types.string });
    const data = await parser({ value: 'abc', other: 'ok' });
    expect(data.value).toBeUndefined();
    expect(Object.keys(data)).toEqual(['other']);
  });

  it('overrides looseCasting per parser', async () => {
    const { createParser, types } = initializeParser();
    const parser = createParser({ value: types.number }, { looseCasting: 'undefined' });
    const data = await parser({ value: 'abc' });
    expect(data.value).toBeUndefined();
  });

  it('overrides looseCasting per call', async () => {
    const { createParser, types } = initializeParser();
    const parser = createParser({ value: types.number });
    const data = await parser({ value: 'abc' }, { looseCasting: 'undefined' });
    expect(data.value).toBeUndefined();
    await expect(parser({ value: 'abc' })).rejects.toThrow(ParserCastError);
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
    expect(data.value).toEqual('abc');
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
    const { createParser, types } = initializeParser({ looseCasting: 'undefined' });

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
});
