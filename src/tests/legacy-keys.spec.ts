import { initializeParser } from '../parser';

const { createParser } = initializeParser();

describe('legacy type keys', () => {
  const legacyKeys = ['string', 'number', 'boolean', 'date', 'object', 'array', 'any', 'unknown', 'undefined'];

  it.each(legacyKeys)('throws a migration error for legacy "%s" projections', async (key) => {
    const parser = createParser({ value: key });
    await expect(parser({ value: 'anything' })).rejects.toThrow(`Legacy type string '${key}'`);
  });

  it('throws a migration error for legacy array<...> projections', async () => {
    const parser = createParser({ value: 'array<string>' });
    await expect(parser({ value: ['a'] })).rejects.toThrow("Legacy type string 'array<string>'");
  });

  it('includes a migration hint in the error', async () => {
    const parser = createParser({ value: 'number' });
    await expect(parser({ value: 1 })).rejects.toThrow('use `types.number` instead');
  });

  it('throws for legacy keys inside nested projections', async () => {
    const parser = createParser({ nested: { value: 'string' } });
    await expect(parser({ nested: { value: 'anything' } })).rejects.toThrow("Legacy type string 'string'");
  });

  it('throws for legacy keys inside nested projections even without data', async () => {
    const parser = createParser({ nested: { value: 'string' } });
    await expect(parser({})).rejects.toThrow("Legacy type string 'string'");
  });

  it('still supports other string constants', async () => {
    const parser = createParser({ value: 'hello world' });
    const data = await parser({ anything: true });
    expect(data.value).toEqual('hello world');
  });
});
