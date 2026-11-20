import { initializeParser, ParserContextTransformer } from '../parser';
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
  it('should be able to handle global value transformers', async () => {
    const { createParser, types } = initializeParser({
      locales: ['en', 'fi'],
      transformers: { localize },
    });

    const parser = createParser({
      title: types.string,
      card: { body: types.string },
    });

    const rawData = {
      title: { en: 'Hello World', fi: 'Hei maailma' },
      card: {
        body: {
          en: 'This is a card body in English.',
          fi: 'Tämä on kortin runko suomeksi.',
        },
      },
    };

    const english = await parser(rawData, { currentLocale: 'en' });
    const finnish = await parser(rawData, { currentLocale: 'fi' });

    expect(english).toBeTruthy();
    expect(english.title).toEqual('Hello World');
    expect(english.card?.body).toEqual('This is a card body in English.');

    expect(finnish).toBeTruthy();
    expect(finnish.title).toEqual('Hei maailma');
    expect(finnish.card?.body).toEqual('Tämä on kortin runko suomeksi.');
  });

  it('should be able to handle global value transformers with variables', async () => {
    const year = new Date().getFullYear();

    const { createParser, types } = initializeParser({
      locales: ['en', 'fi'],
      transformers: { localize },
      variables: { year },
    });

    const parser = createParser({
      message: types.string,
    });

    const rawData = {
      message: { en: 'Hello from {{year}}', fi: 'Hei vuodesta {{year}}' },
    };

    const english = await parser(rawData, { currentLocale: 'en' });
    const finnish = await parser(rawData, { currentLocale: 'fi' });

    expect(english).toBeTruthy();
    expect(english.message).toEqual('Hello from ' + year);

    expect(finnish).toBeTruthy();
    expect(finnish.message).toEqual('Hei vuodesta ' + year);
  });
});

describe('transformer conditions', () => {
  it('awaits an async when in parse and in resolve alike', async () => {
    const never: ParserContextTransformer = { when: async () => false, then: () => 'TRANSFORMED' };
    const strings: ParserContextTransformer = { when: async ({ data }) => typeof data === 'string', then: ({ data }) => `${data}!` };
    const { createParser, resolve, types } = initializeParser({ transformers: { never, strings } });
    const parser = createParser({ a: types.string, n: types.number });
    expect(await parser({ a: 'x', n: 1 })).toEqual({ a: 'x!', n: 1 });
    expect(await resolve({ a: 'x', n: 1 })).toEqual({ a: 'x!', n: 1 });
  });

  it('mirrors data in value inside parse-mode transformers', async () => {
    const seen: unknown[] = [];
    const spy: ParserContextTransformer = {
      when: ({ data, value }) => {
        seen.push([data, value]);
        return false;
      },
      then: ({ data }) => data,
    };
    const { createParser, types } = initializeParser({ transformers: { spy } });
    await createParser({ a: types.string })({ a: 'x' });
    expect(seen).toEqual([['x', 'x']]);
  });

  it('does not run transformers again on pattern output', async () => {
    const shout: ParserContextTransformer = { when: ({ data }) => data === 'inner', then: () => 'TRANSFORMED' };
    const { createParser, types } = initializeParser({ transformers: { shout }, variables: { v: 'inner' } });
    expect(await createParser({ a: types.string, b: types.string })({ a: 'inner', b: '{{v}}' })).toEqual({ a: 'TRANSFORMED', b: 'inner' });
  });
});
