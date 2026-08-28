import { initializeParser } from '../parser';
import { defineType, string, date, DateType, StringType, TypeToken } from '../types';
import { toHash } from '../to-hash';

type Expect<T extends true> = T;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

const productCode = defineType({
  name: 'productCode',
  extends: string,
  fn: (value) => {
    if (!/^P\d{4}$/.test(value)) throw new Error('Invalid product code');
    return value;
  },
  accessors: { number: (value) => Number(value.slice(1)) },
});

describe('type registration', () => {
  it('adds registered types and accessor maps to the engine namespace', async () => {
    const { createParser, types } = initializeParser({
      types: { productCode, date: { relative: (value: Date) => `${new Date('2024-01-02').getUTCFullYear() - value.getUTCFullYear()}y` } },
    });
    const checks: [
      Expect<Equal<typeof types.productCode, typeof productCode>>,
      Expect<Equal<typeof types.date.relative, TypeToken<string>>>,
      Expect<Equal<typeof types.string, StringType>>,
    ] = [true, true, true];
    expect(checks.every(Boolean)).toBe(true);

    expect(types.productCode).toBe(productCode);
    expect(types.string).toBe(string);
    expect(types.date).not.toBe(date);
    expect(types.date).toBeInstanceOf(DateType);
    expect(toHash(types.date)).toEqual(toHash(date));

    const parser = createParser({ code: types.productCode, n: types.productCode.number, age: types.date.relative, iso: types.date.iso });
    expect(await parser({ code: 'P0001', n: 'P0042', age: '2020-06-01', iso: '2020-06-01' })).toEqual({
      code: 'P0001',
      n: 42,
      age: '4y',
      iso: '2020-06-01T00:00:00.000Z',
    });
  });

  it('returns the untouched namespace without registrations', () => {
    const { types } = initializeParser();
    expect(types.date).toBe(date);
    const { types: fromFn } = initializeParser(async () => ({ types: { productCode } }));
    expect(fromFn.date).toBe(date);
    expect('productCode' in fromFn).toBe(false);
  });

  it('warns once when a registration shadows a built-in', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const loud = string.upperCase;
    const config = { types: { string: loud } };
    const { types } = initializeParser(config);
    initializeParser(config);
    expect(types.string).toBe(loud);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('Type "string" overrides the built-in');
    warn.mockRestore();
  });

  it('rejects accessor maps for unknown names and invalid entries', () => {
    expect(() => initializeParser({ types: { nope: { x: (value: unknown) => value } } })).toThrow('an accessor map extends an existing type');
    expect(() => initializeParser({ types: { bad: 42 as never } })).toThrow('expected a type token');
  });

  it('merges by identity so nested parses reuse the engine namespace', async () => {
    const seen: unknown[] = [];
    const { createParser, types } = initializeParser({ types: { productCode }, pipes: { spy: (context) => (seen.push(context.types), context.value) } });
    const inner = createParser({ v: '{{ x | spy }}' });
    const parser = createParser({ a: '{{ x | spy }}', nested: inner });
    await parser({ nested: {} }, { variables: { x: 1 } });
    expect(seen).toHaveLength(2);
    expect(seen[0]).toBe(types);
    expect(seen[1]).toBe(types);
  });

  it('carries schema-level types through withContext and extend', async () => {
    const { createParser } = initializeParser();
    const base = createParser({ v: '{{ x | productCode.number }}' }, { types: { productCode } });
    const extended = base.extend({ w: '{{ x | productCode }}' }).withContext({ variables: { x: 'P0007' } });
    expect(await extended({})).toEqual({ v: 7, w: 'P0007' });
  });
});
