import { initializeParser } from '../parser';
import { array, defineType, number, string } from '../types';

describe('custom types', () => {
  it('supports defineType with a bare function', async () => {
    const email = defineType((value) => {
      if (typeof value !== 'string') throw new Error('Invalid email (not a string)');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error('Invalid email (not a valid email format)');
      return value;
    });
    const { createParser } = initializeParser();
    const parser = createParser({ email });

    const data = await parser({ email: 'test@example.com' });
    expect(data.email).toEqual('test@example.com');
    await expect(parser({ email: 'not-an-email' })).rejects.toThrow('Invalid email (not a valid email format)');
  });

  it('supports async object definitions', async () => {
    const dmy = defineType({
      fn: async (value) => {
        const date = value instanceof Date ? value : new Date(value as string | number);
        if (isNaN(date.getTime())) throw new Error('Invalid date');
        return { day: date.getUTCDate(), month: date.getUTCMonth() + 1, year: date.getUTCFullYear() };
      },
    });
    const { createParser } = initializeParser();
    const parser = createParser({ published: dmy });

    const data = await parser({ published: '2024-05-15T12:00:00.000Z' });
    expect(data.published).toEqual({ day: 15, month: 5, year: 2024 });
  });

  it('supports standalone type files composed from the types entry point', async () => {
    // Simulates a user-repo my-types.ts: aliases and customs built with no engine involved
    const numbers = array.of(number);
    const shout = defineType((value) => `${String(value)}!`);

    const a = initializeParser({ variables: { who: 'a' } });
    const b = initializeParser();
    const parserA = a.createParser({ title: string, scores: numbers, word: shout });
    const parserB = b.createParser({ scores: numbers, word: shout });

    const dataA = await parserA({ title: 'hello', scores: ['1', 2], word: 'hey' });
    const dataB = await parserB({ scores: [3, '4.5'], word: 'ho' });
    expect(dataA.title).toEqual('hello');
    expect(dataA.scores).toEqual([1, 2]);
    expect(dataA.word).toEqual('hey!');
    expect(dataB.scores).toEqual([3, 4.5]);
    expect(dataB.word).toEqual('ho!');
  });

  it('shares token identity between the types entry point and initializeParser', () => {
    const { types } = initializeParser();
    expect(string).toBe(types.string);
    expect(array.of(number)).toBe(types.array.of(types.number));
  });
});

describe('defineType forms', () => {
  const { createParser } = initializeParser();

  it('names a bare casting function "custom" in errors and ids', async () => {
    const failing = defineType(() => {
      throw new Error('no');
    });
    expect(failing.name).toEqual('custom');
    expect(failing.id).toMatch(/^custom:custom:/);
    await expect(createParser({ a: failing })({ a: 1 })).rejects.toThrow('cannot cast value to "custom" — no');
  });

  it('accepts required and loose in the object form', async () => {
    const needed = defineType({ name: 'needed', fn: (value) => String(value), required: true });
    expect(needed.isRequired).toBe(true);
    await expect(createParser({ a: needed })({})).rejects.toThrow('Missing required value');

    const quiet = defineType({
      name: 'quiet',
      loose: true,
      fn: () => {
        throw new Error('no');
      },
    });
    expect(quiet.policy).toEqual('loose');
    expect(await createParser({ a: quiet })({ a: 1 })).toEqual({});
  });

  it('throws when the object form has no fn and no parent', () => {
    expect(() => defineType({ name: 'empty' } as never)).toThrow('a casting function `fn` is required');
    expect(() => defineType({ extends: {} as never, fn: (value: unknown) => value } as never)).toThrow('`extends` must be a type token');
  });

  it('treats a custom cast returning undefined as missing', async () => {
    const blankable = defineType({ name: 'blankable', fn: (value) => (value === 'skip' ? undefined : String(value)) });
    expect(await createParser({ a: blankable, b: blankable.default('dflt') })({ a: 'skip', b: 'skip' })).toEqual({ b: 'dflt' });
    await expect(createParser({ a: blankable.required })({ a: 'skip' })).rejects.toThrow('Missing required value');
  });
});
