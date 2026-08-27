import { initializeParser } from '../parser';
import { NumberType } from './index';

const { createParser, types } = initializeParser();

describe('number type', () => {
  it('casts like before', async () => {
    const parser = createParser({ a: types.number, b: types.number, c: types.number });
    expect(await parser({ a: '12.5', b: true, c: new Date(1000) })).toEqual({ a: 12.5, b: 1, c: 1000 });
    await expect(parser({ a: '12px' })).rejects.toThrow('Invalid number');
    expect(await parser({ a: '' })).toEqual({});
    await expect(parser({ a: '   ' })).rejects.toThrow('Invalid number');
  });

  it('rounds decimal-safely and half away from zero', async () => {
    const parser = createParser({
      a: types.number.round(),
      b: types.number.round(2),
      c: types.number.round(2),
      d: types.number.round(1),
      e: types.number.round(),
    });
    expect(await parser({ a: 2.5, b: 1.005, c: '3.14159', d: -2.25, e: -2.5 })).toEqual({ a: 3, b: 1.01, c: 3.14, d: -2.3, e: -3 });
    expect(types.number.round(2)).toBe(types.number.round(2));
    expect(types.number.round(2)).not.toBe(types.number.round(3));
    expect(types.number.round(2)).toBeInstanceOf(NumberType);
  });

  it('floors, ceils, abs and clamps', async () => {
    const parser = createParser({
      f: types.number.floor,
      c: types.number.ceil,
      a: types.number.abs,
      lo: types.number.clamp(0, 10),
      hi: types.number.clamp(0, 10),
      ok: types.number.clamp(0, 10),
    });
    expect(await parser({ f: 1.9, c: 1.1, a: -4, lo: -5, hi: 50, ok: 5 })).toEqual({ f: 1, c: 2, a: 4, lo: 0, hi: 10, ok: 5 });
  });

  it('chains transforms', async () => {
    const parser = createParser({ value: types.number.abs.round(1).clamp(0, 3) });
    expect((await parser({ value: '-2.46' })).value).toEqual(2.5);
  });
});
