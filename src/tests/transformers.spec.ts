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
    const { createParser } = initializeParser({
      locales: ['en', 'fi'],
      transformers: { localize },
    });

    const parser = createParser({
      title: 'string',
      card: { body: 'string' },
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

    const { createParser } = initializeParser({
      locales: ['en', 'fi'],
      transformers: { localize },
      variables: { year },
    });

    const parser = createParser({
      message: 'string',
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
