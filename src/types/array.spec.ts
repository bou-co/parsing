import { initializeParser } from '../parser';
import { ArrayType, TypeToken } from './index';

const { createParser, types } = initializeParser();

describe('array type', () => {
  it('validates and casts items with .of()', async () => {
    const parser = createParser({ raw: types.array, nums: types.array.of(types.number), nested: types.array.of(types.array.of(types.string)) });
    expect(await parser({ raw: [1, 'a'], nums: ['1', 2], nested: [[1], ['b']] })).toEqual({ raw: [1, 'a'], nums: [1, 2], nested: [['1'], ['b']] });
    await expect(parser({ raw: 'nope' })).rejects.toThrow('Invalid array');
    await expect(parser({ nums: ['1', 'x'] })).rejects.toThrow('at "nums.1"');
    expect(types.array.of(types.number).name).toEqual('array<number>');
  });

  it('transforms keep the family (and the item type)', async () => {
    const parser = createParser({
      unique: types.array.unique,
      uniqueNums: types.array.of(types.number).unique,
      compact: types.array.compact,
      reverse: types.array.of(types.number).reverse,
      chained: types.array.of(types.string).compact.unique.reverse,
    });
    expect(
      await parser({
        unique: [1, 1, '1', NaN, NaN, 0, -0],
        uniqueNums: ['1', 1, 2],
        compact: [1, null, undefined, 0, ''],
        reverse: ['1', '2'],
        chained: ['a', null, 'a', 'b'],
      }),
    ).toEqual({ unique: [1, '1', NaN, 0], uniqueNums: [1, 2], compact: [1, 0, ''], reverse: [2, 1], chained: ['b', 'a'] });
    expect(types.array.unique).toBeInstanceOf(ArrayType);
    expect(types.array.of(types.number).unique).toBe(types.array.of(types.number).unique);
  });

  it('derivations return the new type', async () => {
    const parser = createParser({
      first: types.array.of(types.number).first,
      last: types.array.last,
      length: types.array.length,
      joined: types.array.join(', '),
      joinedDefault: types.array.join(),
      firstOfUnique: types.array.of(types.number).unique.first,
    });
    expect(
      await parser({ first: ['1', 2], last: [1, 2, 3], length: [1, 2], joined: ['a', 'b'], joinedDefault: ['a', 'b'], firstOfUnique: ['3', '3', '4'] }),
    ).toEqual({
      first: 1,
      last: 3,
      length: 2,
      joined: 'a, b',
      joinedDefault: 'a,b',
      firstOfUnique: 3,
    });
    expect(types.array.first).toBeInstanceOf(TypeToken);
    expect(types.array.first).not.toBeInstanceOf(ArrayType);
  });

  it('drops the key for empty derivations of missing input', async () => {
    const parser = createParser({ first: types.array.first, length: types.array.length });
    expect(await parser({ other: true })).toEqual({});
    expect(await parser({ first: [], length: [] })).toEqual({ length: 0 });
  });
});
