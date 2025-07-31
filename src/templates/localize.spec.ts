import { initializeParser } from '../parser';
import { localize } from './localize';

describe('parsing', () => {
  it('should be able to handle localize transformer', async () => {
    const { createParser } = initializeParser({
      locales: ['en', 'fi'],
      defaultLocale: 'en',
      resolveCurrentLocale: (context) => context.currentLocale || context.defaultLocale,
      transformers: { localize: localize({ matching: 'every' }) },
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

  it('should be able to handle localize transformer with only some keys', async () => {
    const { createParser } = initializeParser({
      locales: ['en', 'fi'],
      defaultLocale: 'en',
      resolveCurrentLocale: (context) => context.currentLocale || context.defaultLocale,
      transformers: { localize: localize({ matching: 'some' }) },
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
    expect(finnish.card?.body).toEqual('This is a card body in English.');
  });

  it('should be able to handle localize transformer with custom matching function', async () => {
    const { createParser } = initializeParser({
      locales: ['en', 'fi'],
      defaultLocale: 'en',
      resolveCurrentLocale: (context) => context.currentLocale || context.defaultLocale,
      transformers: {
        localize: localize({ matching: ({ key, data }) => (data && typeof data === 'object' && key === 'title' ? true : false) }),
      },
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
    expect(english.card?.body).toEqual({ en: 'This is a card body in English.', fi: 'Tämä on kortin runko suomeksi.' });

    expect(finnish).toBeTruthy();
    expect(finnish.title).toEqual('Hei maailma');
    expect(finnish.card?.body).toEqual({ en: 'This is a card body in English.', fi: 'Tämä on kortin runko suomeksi.' });
  });

  it('should be able to handle localize transformer with some keys and omit fallback', async () => {
    const { createParser } = initializeParser({
      locales: ['en', 'fi'],
      defaultLocale: 'en',
      resolveCurrentLocale: (context) => context.currentLocale || context.defaultLocale,
      transformers: { localize: localize({ matching: 'some', fallback: false }) },
    });

    const parser = createParser({
      title: 'string',
      card: { body: 'string' },
    });

    const rawData = {
      title: { en: 'Hello World' },
      card: {
        body: {
          en: 'This is a card body in English.',
        },
      },
    };

    const english = await parser(rawData, { currentLocale: 'en' });
    const finnish = await parser(rawData, { currentLocale: 'fi' });

    expect(english).toBeTruthy();
    expect(english.title).toEqual('Hello World');
    expect(english.card?.body).toEqual('This is a card body in English.');

    expect(finnish).toBeTruthy();
    expect(finnish.title).toEqual(undefined);
    expect(finnish.card?.body).toEqual(undefined);
  });

  it('should be able to handle localize transformer with some keys and run custom fallback function', async () => {
    const { createParser } = initializeParser({
      locales: ['en', 'fi'],
      defaultLocale: 'en',
      resolveCurrentLocale: (context) => context.currentLocale || context.defaultLocale,
      transformers: { localize: localize({ matching: 'some', fallback: (context) => 'Fallback message' }) },
    });

    const parser = createParser({
      title: 'string',
      card: { body: 'string' },
    });

    const rawData = {
      title: { en: 'Hello World' },
      card: {
        body: {
          en: 'This is a card body in English.',
        },
      },
    };

    const english = await parser(rawData, { currentLocale: 'en' });
    const finnish = await parser(rawData, { currentLocale: 'fi' });

    expect(english).toBeTruthy();
    expect(english.title).toEqual('Hello World');
    expect(english.card?.body).toEqual('This is a card body in English.');

    expect(finnish).toBeTruthy();
    expect(finnish.title).toEqual('Fallback message');
    expect(finnish.card?.body).toEqual('Fallback message');
  });
});
