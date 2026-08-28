import { initializeParser } from '../parser';
import { ParserCastError } from '../parser-casting';

const { createParser, types } = initializeParser();

describe('array types', () => {
  it('passes arrays through with bare types.array', async () => {
    const parser = createParser({ items: types.array });
    const data = await parser({ items: [1, 'two', { three: true }] });
    expect(data.items).toEqual([1, 'two', { three: true }]);
  });

  it('fails bare types.array for non-arrays', async () => {
    const parser = createParser({ items: types.array });
    await expect(parser({ items: 'nope' })).rejects.toThrow(ParserCastError);
  });

  it('casts items with types.array.of(types.number)', async () => {
    const parser = createParser({ values: types.array.of(types.number) });
    const data = await parser({ values: ['1', 2, '3.5', true] });
    expect(data.values).toEqual([1, 2, 3.5, 1]);
  });

  it('resolves item variables before casting', async () => {
    const parser = createParser({ values: types.array.of(types.number) });
    const data = await parser({ values: ['{{first}}', '2'] }, { variables: { first: '1' } });
    expect(data.values).toEqual([1, 2]);
  });

  it('supports nested item types', async () => {
    const parser = createParser({ matrix: types.array.of(types.array.of(types.number)) });
    const data = await parser({
      matrix: [
        ['1', 2],
        [3, '4'],
      ],
    });
    expect(data.matrix).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it('applies looseCasting per item', async () => {
    const parser = createParser({ values: types.array.of(types.number) }, { looseCasting: 'undefined' });
    const data = await parser({ values: ['1', 'abc', 3] });
    expect(data.values).toEqual([1, undefined, 3]);
  });

  it('reports the failing item in cast errors', async () => {
    const parser = createParser({ values: types.array.of(types.number) });
    await expect(parser({ values: ['1', 'abc'] })).rejects.toThrow('at "values.1"');
  });

  it('keeps parameterized tokens identity-stable', () => {
    expect(types.array.of(types.number)).toBe(types.array.of(types.number));
  });

  it('is callable with an options object — the same configuration as the chain', async () => {
    expect(await types.array({ default: [] }).of(types.number).cast(['1'])).toEqual([1]);
    expect(String(types.array({ default: [] }).of(types.number))).toEqual(String(types.array.of(types.number).default([])));
    expect(types.array({ default: [] }).of(types.number).defaultValue).toEqual([]);
    // Types are never parameters of a call
    expect(() => (types.array as unknown as (arg: unknown) => unknown)(types.number)).toThrow('use .of(number)');
    // @ts-expect-error the options object must match the token's output type
    expect(() => types.string({ default: 1 })).not.toThrow();
  });
});
