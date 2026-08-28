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
  it('should resolve variables in object values without a projection', async () => {
    const currentTime = '2024-06-01T12:00:00Z';
    const { resolve } = initializeParser({
      variables: { name: 'John', currentTime: () => currentTime },
    });

    const data = await resolve({
      message: 'Hello {{name}}!',
      time: '{{currentTime}}',
    });

    expect(data).toBeTruthy();
    expect(data.message).toEqual('Hello John!');
    expect(data.time).toEqual(currentTime);
  });

  it('should apply global transformers when resolving', async () => {
    const { resolve } = initializeParser({
      locales: ['en', 'fi'],
      transformers: { localize },
      variables: { name: 'John' },
    });

    const input = {
      message: {
        en: 'Hello {{name}}!',
        fi: 'Hei {{name}}!',
      },
    };

    const english = await resolve<{ message: string }>(input, { currentLocale: 'en' });
    const finnish = await resolve<{ message: string }>(input, { currentLocale: 'fi' });

    expect(english.message).toEqual('Hello John!');
    expect(finnish.message).toEqual('Hei John!');
  });

  it('should apply transformers to the root value', async () => {
    const { resolve } = initializeParser({
      locales: ['en', 'fi'],
      transformers: { localize },
    });

    const message = await resolve<string>({ en: 'Hello', fi: 'Hei' }, { currentLocale: 'fi' });
    expect(message).toEqual('Hei');
  });

  it('should resolve variables from the instance context', async () => {
    const { resolve } = initializeParser();

    const data = await resolve({ message: 'Your order {{orderId}} has been shipped.' }, { variables: { orderId: '12345' } });

    expect(data.message).toEqual('Your order 12345 has been shipped.');
  });

  it('should resolve a plain string input', async () => {
    const { resolve } = initializeParser({ variables: { name: 'John' } });

    const message = await resolve('Hello {{name}}!');
    expect(message).toEqual('Hello John!');
  });

  it('should resolve deeply nested objects and arrays', async () => {
    const { resolve } = initializeParser({
      locales: ['en', 'fi'],
      transformers: { localize },
      variables: { name: 'John' },
    });

    const data = await resolve(
      {
        cards: [
          { title: { en: 'First card', fi: 'Ensimmäinen kortti' }, body: 'Made by {{name}}' },
          { title: { en: 'Second card', fi: 'Toinen kortti' }, body: 'Also by {{name}}' },
        ],
      },
      { currentLocale: 'fi' },
    );

    expect(Array.isArray(data.cards)).toBe(true);
    expect(data.cards[0].title).toEqual('Ensimmäinen kortti');
    expect(data.cards[0].body).toEqual('Made by John');
    expect(data.cards[1].title).toEqual('Toinen kortti');
    expect(data.cards[1].body).toEqual('Also by John');
  });

  it('should pass through values that are not strings or objects', async () => {
    const { resolve } = initializeParser({
      locales: ['en', 'fi'],
      transformers: { localize },
      variables: { name: 'John' },
    });

    const data = await resolve({ count: 42, active: true, missing: null, note: 'By {{name}}' });
    expect(data.count).toEqual(42);
    expect(data.active).toEqual(true);
    expect(data.missing).toEqual(null);
    expect(data.note).toEqual('By John');

    expect(await resolve(null)).toEqual(null);
    expect(await resolve(undefined)).toEqual(undefined);
    expect(await resolve(42)).toEqual(42);
  });

  it('should invoke function values and resolve their results', async () => {
    const { resolve } = initializeParser();

    const data = await resolve({
      message: async () => {
        const inner = await resolve({ name: async () => 'John' });
        return `Hello ${inner.name}!`;
      },
    });

    expect(data.message).toEqual('Hello John!');
  });

  it('should recursively resolve function results including transformers and nested functions', async () => {
    const { resolve } = initializeParser({
      locales: ['en', 'fi'],
      transformers: { localize },
    });

    const data = await resolve(
      {
        user: () => ({
          greeting: { en: 'Hello {{lastName}}', fi: 'Hei {{lastName}}' },
          meta: async () => ({ uid: 'id-{{userId}}' }),
        }),
      },
      { variables: { lastName: 'Doe', userId: '123' }, currentLocale: 'fi' },
    );

    expect(data.user.greeting).toEqual('Hei Doe');
    expect(data.user.meta.uid).toEqual('id-123');
  });

  it('should expose a context resolve inside parser value functions', async () => {
    const { createParser, types } = initializeParser();

    const parser = createParser(
      {
        name: types.string,
        metadata: async ({ resolve }) => {
          const uid = await resolve('id-{{userId}}');
          return { uid };
        },
      },
      { variables: { userId: '123' } },
    );

    const result = await parser({ name: 'John' });
    expect(result.name).toEqual('John');
    expect(result.metadata).toEqual({ uid: 'id-123' });
  });

  it('should inherit instance context through nested resolvers', async () => {
    const { resolve } = initializeParser();

    const data = await resolve(
      {
        user: async ({ resolve }) => {
          return {
            name: await resolve({
              firstName: async () => 'John',
              lastName: async () => 'Doe',
            }),
            metadata: async ({ resolve }: ParserContext) => {
              const uid = await resolve('id-{{userId}}');
              return { uid };
            },
          };
        },
      },
      { variables: { userId: '123' } },
    );

    expect(data.user.name).toEqual({ firstName: 'John', lastName: 'Doe' });
    expect(data.user.metadata).toEqual({ uid: 'id-123' });
  });

  it('should resolve function variables through the inherited context', async () => {
    const { resolve } = initializeParser({
      variables: { random: async () => 0.123456789 },
    });

    const data = await resolve(
      {
        randomValue: async ({ resolve }) => {
          return await resolve('{{random}}-{{uid}}');
        },
      },
      { variables: { uid: async () => '123' } },
    );

    expect(data.randomValue).toEqual('0.123456789-123');
  });

  it('should merge context resolve overrides on top of inherited variables', async () => {
    const { resolve } = initializeParser({ variables: { a: 'A' } });

    const data = await resolve(
      {
        value: async ({ resolve }) => resolve('{{a}}-{{b}}-{{c}}', { variables: { c: 'C' } }),
      },
      { variables: { b: 'B' } },
    );

    expect(data.value).toEqual('A-B-C');
  });

  it('should pass branded functions through untouched', async () => {
    const { resolve, types } = initializeParser();

    const data = await resolve({ token: types.string });
    expect(data.token).toBe(types.string);
  });

  it('should work with a lazily initialized global context', async () => {
    const { resolve } = initializeParser(async () => {
      await new Promise((done) => setTimeout(done, 10));
      return { variables: { name: 'John' } };
    });

    const data = await resolve({ message: 'Hello {{name}}!' });
    expect(data.message).toEqual('Hello John!');
  });
});
