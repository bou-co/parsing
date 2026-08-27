import { initializeParser } from '../parser';

const { createParser, types } = initializeParser();

describe('boolean type', () => {
  it('casts like before', async () => {
    const parser = createParser({ a: types.boolean, b: types.boolean, c: types.boolean, d: types.boolean });
    expect(await parser({ a: true, b: 0, c: ' TRUE ', d: 'false' })).toEqual({ a: true, b: false, c: true, d: false });
    await expect(parser({ a: 'yes' })).rejects.toThrow('Invalid boolean');
    await expect(parser({ a: 2 })).rejects.toThrow('Invalid boolean');
  });

  it('supports the universal chain', async () => {
    const parser = createParser({ flag: types.boolean.default(false), inverted: types.boolean.to((value) => !value) });
    expect(await parser({ inverted: 'true' })).toEqual({ flag: false, inverted: false });
  });
});
