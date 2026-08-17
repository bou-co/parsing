import { initializeParser, ParserContext, ParserContextTransformer } from '../parser';
import { get } from '../parser-util';

declare module '../expandable-types' {
  export interface GlobalContext {
    locales?: string[];
  }
  export interface InstanceContext {
    currentLocale?: string;
  }
}

const localize: ParserContextTransformer = {
  when: ({ data, locales = [] }) => (data && typeof data === 'object' ? Object.keys(data).every((key) => locales.includes(key)) : false),
  then: ({ data, currentLocale = 'en' }) => {
    if (typeof data !== 'object' || !data) return data;
    return get(currentLocale, data);
  },
};

describe('parsing', () => {
  it('should expose the raw value at the current key as context.value', async () => {
    const { createParser } = initializeParser();
    const parser = createParser({
      price: ({ value }) => value * 5,
    });

    const result = await parser({ price: 3 });
    expect(result.price).toEqual(15);
  });

  it('should keep context.value raw when it is a variable string', async () => {
    const { createParser } = initializeParser({ variables: { name: 'John' } });
    let captured: unknown;
    const parser = createParser({
      greeting: ({ value }) => {
        captured = value;
        return 'static';
      },
    });

    const result = await parser({ greeting: '{{name}}' });
    expect(captured).toEqual('{{name}}');
    expect(result.greeting).toEqual('static');
  });

  it('should resolve the current value with a zero-arg resolve()', async () => {
    const { createParser } = initializeParser({ variables: { name: 'John' } });
    const parser = createParser({
      message: ({ resolve }) => resolve(),
    });

    const result = await parser({ message: 'Hello {{name}}!' });
    expect(result.message).toEqual('Hello John!');
  });

  it('should apply transformers when resolving the current value', async () => {
    const { createParser } = initializeParser({
      locales: ['en', 'fi'],
      transformers: { localize },
    });
    const parser = createParser({
      title: async ({ resolve }) => `${await resolve()}!`,
    });

    const data = { title: { en: 'Hello', fi: 'Hei' } };
    const finnish = await parser(data, { currentLocale: 'fi' });
    expect(finnish.title).toEqual('Hei!');
  });

  it('should not resolve variables unless resolve() is called', async () => {
    const variableResolver = jest.fn();
    const { createParser } = initializeParser({ variableResolver });
    const parser = createParser({
      v: ({ value }) => (typeof value === 'string' ? 'was string' : 'was other'),
    });

    const result = await parser({ v: '{{dbVar}}' });
    expect(result.v).toEqual('was string');
    expect(variableResolver).not.toHaveBeenCalled();
  });

  it('should memoize zero-arg resolve() per context', async () => {
    // The resolver must not call its cache param so the memo, not the variable cache, is measured
    const variableResolver = jest.fn().mockResolvedValue('from-db');
    const { createParser } = initializeParser({ variableResolver });
    const parser = createParser({
      v: async ({ resolve }) => {
        const first = await resolve();
        const second = await resolve();
        return `${first}|${second}`;
      },
    });

    const result = await parser({ v: '{{dbVar}}' });
    expect(result.v).toEqual('from-db|from-db');
    expect(variableResolver).toHaveBeenCalledTimes(1);

    // The memo lives per context, not per engine — a new parse resolves again
    await parser({ v: '{{dbVar}}' });
    expect(variableResolver).toHaveBeenCalledTimes(2);
  });

  it('should distinguish resolve() from resolve(undefined)', async () => {
    const { createParser } = initializeParser({ variables: { name: 'John' } });
    const parser = createParser({
      v: async ({ resolve }) => {
        const zeroArg = await resolve();
        const explicitUndefined = await resolve(undefined);
        return { zeroArg, explicitUndefined: explicitUndefined === undefined };
      },
    });

    const result = await parser({ v: '{{name}}' });
    expect(result.v).toEqual({ zeroArg: 'John', explicitUndefined: true });
  });

  it('should keep the one-arg resolve(input) working alongside zero-arg', async () => {
    const { createParser } = initializeParser({ variables: { name: 'John', userId: '123' } });
    const parser = createParser({
      v: async ({ resolve }) => {
        const current = await resolve();
        const other = await resolve('id-{{userId}}');
        return `${current}:${other}`;
      },
    });

    const result = await parser({ v: '{{name}}' });
    expect(result.v).toEqual('John:id-123');
  });

  it('should leave context.value undefined for missing keys and projection-driven resolution', async () => {
    const { createParser } = initializeParser();
    const parser = createParser({
      direct: ({ value }) => (value === undefined ? 'none' : 'some'),
      nested: {
        inner: ({ value }) => (value === undefined ? 'none' : 'some'),
      },
    });

    const result = await parser({ other: true });
    expect(result.direct).toEqual('none');
    expect(result.nested?.inner).toEqual('none');
  });

  it('should provide context.value for each item when parsing arrays', async () => {
    const { createParser } = initializeParser();
    const parser = createParser({
      n: ({ value }) => value * 2,
    });

    const result = await parser.asArray([{ n: 1 }, { n: 2 }]);
    expect(result).toEqual([{ n: 2 }, { n: 4 }]);
  });

  it('should scope context.value to each nested level', async () => {
    const { createParser } = initializeParser();
    const parser = createParser({
      child: {
        n: ({ value }) => value + 1,
      },
    });

    const result = await parser({ child: { n: 41 } });
    expect(result.child?.n).toEqual(42);
  });

  it('should mirror data as value inside resolve-mode functions and transformers', async () => {
    const { resolve } = initializeParser({
      locales: ['en', 'fi'],
      transformers: {
        localize: {
          when: ({ value, locales = [] }) => (value && typeof value === 'object' ? Object.keys(value).every((key) => locales.includes(key)) : false),
          then: ({ value, currentLocale = 'en' }) => get(currentLocale, value),
        },
      },
    });

    let mirrored = false;
    const result = await resolve(
      {
        title: { en: 'Hello', fi: 'Hei' },
        msg: (context: ParserContext) => {
          mirrored = context.value === context.data;
          return 'checked';
        },
      },
      { currentLocale: 'fi' },
    );

    expect(result.title).toEqual('Hei');
    expect(result.msg).toEqual('checked');
    expect(mirrored).toEqual(true);
  });

  // Extra type testing

  it('should let an explicit type argument override the inferred resolve typing', async () => {
    const { createParser, resolve } = initializeParser({ variables: { count: 5 } });

    interface Shaped {
      when: Date;
    }
    const shaped = { when: new Date() };

    const parser = createParser({
      typedZeroArg: async ({ resolve }) => {
        const n = await resolve<number>();
        return n * 2;
      },
      typedOneArg: async ({ resolve }) => {
        const n = await resolve<number>('{{count}}');
        return n + 1;
      },
    });

    const result = await parser({ typedZeroArg: '{{count}}' });
    expect(result.typedZeroArg).toEqual(10);
    expect(result.typedOneArg).toEqual(6);

    // Explicit R wins verbatim even when the input is assignable to it (no ResolvedValue mapping)
    const verbatim: Shaped = await resolve<Shaped>(shaped);
    expect(verbatim.when).toBeInstanceOf(Date);

    // Without a type argument inference still maps through ResolvedValue and types fn contexts
    const inferred = await resolve({ n: ({ variables }: ParserContext) => variables['count'] as number });
    const n: number = inferred.n;
    expect(n).toEqual(5);
  });
});
