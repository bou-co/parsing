import { initializeParser, ParserReturnValue } from '../parser';
import { array as arrayType, defineType, number as numberType, string as stringType } from '../types';
import { AppObject, ArrayParserType, DefaultParserTypes, ParserType } from '../parser-types';

type Expect<T extends true> = T;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

const email = defineType(async (value) => String(value));
const dmy = defineType({
  fn: (value) => {
    const date = new Date(value as string | number);
    return { day: date.getUTCDate(), month: date.getUTCMonth() + 1, year: date.getUTCFullYear() };
  },
});

const { createParser, types } = initializeParser();

const numberValue: number = 123;

const nestedParser = createParser({ inner: types.string });

const parser = createParser({
  title: types.string,
  priority: types.number,
  ok: types.boolean,
  when: types.date,
  meta: types.object,
  mystery: types.unknown,
  tags: types.array(types.string),
  matrix: types.array(types.array(types.number)),
  raw: types.array,
  email,
  published: dmy,
  fromEntryPoint: stringType,
  scoresFromEntryPoint: arrayType(numberType),
  constant: 'fixed',
  fn: async () => numberValue,
  nested: nestedParser,
  '@if': [{ when: () => true, then: { conditional: types.string } }],
  '@combine': async (): Promise<{ combined: number }> => ({ combined: numberValue }),
});

type Value = ParserReturnValue<typeof parser>;

describe('type inference', () => {
  it('infers output types from the projection', async () => {
    const checks: [
      Expect<Equal<Value['title'], string | undefined>>,
      Expect<Equal<Value['priority'], number | undefined>>,
      Expect<Equal<Value['ok'], boolean | undefined>>,
      Expect<Equal<Value['when'], Date | undefined>>,
      Expect<Equal<Value['meta'], AppObject | undefined>>,
      Expect<Equal<Value['mystery'], unknown>>,
      Expect<Equal<Value['tags'], string[] | undefined>>,
      Expect<Equal<Value['matrix'], number[][] | undefined>>,
      Expect<Equal<Value['raw'], unknown[] | undefined>>,
      Expect<Equal<Value['email'], string | undefined>>,
      Expect<Equal<Value['published'], { day: number; month: number; year: number } | undefined>>,
      Expect<Equal<NonNullable<Value['published']>['day'], number>>,
      Expect<Equal<Value['fromEntryPoint'], string | undefined>>,
      Expect<Equal<Value['scoresFromEntryPoint'], number[] | undefined>>,
      Expect<Equal<Value['constant'], 'fixed' | undefined>>,
      Expect<Equal<Value['fn'], number | undefined>>,
      Expect<Equal<NonNullable<Value['nested']>['inner'], string | undefined>>,
      Expect<Equal<Value['conditional'], string | undefined>>,
      Expect<Equal<Value['combined'], number | undefined>>,
    ] = [true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true];
    expect(checks.every(Boolean)).toBe(true);

    const data = await parser({ title: 'hello', priority: '2', tags: ['a', 1], scoresFromEntryPoint: ['3', 4] });
    expect(data.title).toEqual('hello');
    expect(data.priority).toEqual(2);
    expect(data.tags).toEqual(['a', '1']);
    expect(data.scoresFromEntryPoint).toEqual([3, 4]);
  });

  it('defineType preserves the output type', () => {
    const single = defineType({
      fn: (value) => {
        const date = new Date(value as string | number);
        return { day: date.getUTCDate() };
      },
      strict: true,
    });
    const check: Expect<Equal<typeof single, ParserType<{ day: number }>>> = true;
    expect(check).toBe(true);
    expect(single).toBeInstanceOf(Function);
  });

  it('returns the default types from initializeParser', () => {
    const { types: defaultTypes } = initializeParser();
    const checks: [
      Expect<Equal<typeof defaultTypes, DefaultParserTypes>>,
      Expect<Equal<(typeof defaultTypes)['string'], ParserType<string>>>,
      Expect<Equal<(typeof defaultTypes)['date'], ParserType<Date>>>,
      Expect<Equal<(typeof defaultTypes)['array'], ArrayParserType>>,
      Expect<Equal<typeof stringType, ParserType<string>>>,
      Expect<Equal<typeof arrayType, ArrayParserType>>,
    ] = [true, true, true, true, true, true];
    expect(checks.every(Boolean)).toBe(true);
  });
});
