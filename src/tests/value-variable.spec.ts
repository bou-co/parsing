import { initializeParser } from '../parser';
import { ParserContext } from '../parser-types';
import { get, value, variable } from '../parser-util';
import { ParserCastError } from '../type-token';

const resolver = vi.fn(async (name: string) => (name === 'remote' ? 'from-resolver' : undefined));

const { createParser, resolve, types } = initializeParser({
  variables: {
    myVariable: 'Hello',
    count: '42',
    bad: 'not a number',
    user: { name: 'bob', email: 'Bob@Example.com' },
    fallbackEmail: 'fallback@example.com',
    settings: { theme: 'dark', nested: { a: 1 } },
  },
  pipes: { upperCase: ({ data }: ParserContext) => String(data).toUpperCase() },
  variableResolver: resolver,
});

describe('value(input, type)', () => {
  it('resolves patterns in the input and casts the result like a token at the key', async () => {
    const parser = createParser({
      title: value('{{myVariable}}', types.string.required),
      count: value('{{count}}', types.number),
      greeting: value('{{myVariable}}, {{user.name}}!', types.string),
      email: value('{{user.missing || user.email}}', types.email.normalized),
    });
    expect(await parser({})).toEqual({ title: 'Hello', count: 42, greeting: 'Hello, bob!', email: 'bob@example.com' });
  });

  it('applies defaults, required, and the failure policy with the projection key as the error path', async () => {
    const parser = createParser({ title: value('{{missing}}', types.string.required) });
    await expect(parser({})).rejects.toThrow('Parser cast error at "title"');
    expect(await createParser({ title: value('{{missing}}', types.string.default('none')) })({})).toEqual({ title: 'none' });

    const numeric = createParser({ n: value('{{bad}}', types.number) });
    await expect(numeric({})).rejects.toThrow(ParserCastError);
    const onCastError = vi.fn();
    expect(await numeric({}, { looseCasting: true, onCastError })).toEqual({});
    expect(onCastError).toHaveBeenCalledTimes(1);
    await expect(createParser({ n: value('{{bad}}', types.number.strict) })({}, { looseCasting: true })).rejects.toThrow(ParserCastError);
  });

  it('lets a written fallback win over a failed pipe cast', async () => {
    const parser = createParser({ n: value('{{bad | number || "0"}}', types.number) });
    expect(await parser({})).toEqual({ n: 0 });
  });

  it('passes a full-string variable resolving to an object through raw', async () => {
    const parser = createParser({ settings: value('{{settings.nested}}', types.object) });
    expect(await parser({})).toEqual({ settings: { a: 1 } });
  });

  it('calls a function input with the context and casts its result', async () => {
    const parser = createParser({ n: value(({ data }: ParserContext) => data['raw'], types.number.required) });
    expect(await parser({ raw: '7' })).toEqual({ n: 7 });
    await expect(parser({})).rejects.toThrow('Parser cast error at "n"');
  });

  it('casts inside resolve and nested projections', async () => {
    expect(await resolve({ a: { b: value('{{count}}', types.number) } })).toEqual({ a: { b: 42 } });
    const parser = createParser({ outer: { inner: value('{{count}}', types.number) } });
    expect(await parser({})).toEqual({ outer: { inner: 42 } });
  });

  it('hashes by input and token', () => {
    expect(String(value('{{a}}', types.string))).not.toEqual(String(value('{{b}}', types.string)));
    expect(String(value('{{a}}', types.string))).not.toEqual(String(value('{{a}}', types.number)));
    expect(String(createParser({ v: value('{{a}}', types.string) }))).not.toEqual(String(createParser({ v: value('{{b}}', types.string) })));
  });
});

describe('variable(expression, type?)', () => {
  it('evaluates the inside of a variable with fallbacks, literals and pipes', async () => {
    const parser = createParser({
      name: variable('user.name | upperCase', types.string.required),
      theme: variable('settings.missing || "light"'),
      dark: variable('settings.theme'),
      count: variable('count', types.number),
      email: variable('user.missing || fallbackEmail', types.email),
    });
    expect(await parser({})).toEqual({ name: 'BOB', theme: 'light', dark: 'dark', count: 42, email: 'fallback@example.com' });
  });

  it('applies required and defaults on a missing variable', async () => {
    await expect(createParser({ v: variable('missing', types.string.required) })({})).rejects.toThrow('Parser cast error at "v"');
    expect(await createParser({ v: variable('missing', types.string.default('x')) })({})).toEqual({ v: 'x' });
    expect(await createParser({ v: variable('missing') })({})).toEqual({});
  });

  it('reads the built-in data head and falls back to the variable resolver', async () => {
    const parser = createParser({ field: variable('data.field', types.number), remote: variable('remote', types.string) });
    expect(await parser({ field: '3' })).toEqual({ field: 3, remote: 'from-resolver' });
    expect(resolver).toHaveBeenCalledWith('remote', expect.anything(), expect.anything());
  });

  it('follows re-delimited variables patterns', async () => {
    const redelimited = initializeParser({ variables: { name: 'World' }, patterns: { variables: { match: /\$\{([^}]+)\}/g } } });
    const parser = redelimited.createParser({ a: variable('name', redelimited.types.string.required), b: variable('missing || "guest"') });
    expect(await parser({})).toEqual({ a: 'World', b: 'guest' });
  });

  it('hashes by expression and token', () => {
    expect(String(variable('a'))).not.toEqual(String(variable('b')));
    expect(String(variable('a'))).not.toEqual(String(variable('a', types.string)));
    expect(String(variable('a', types.string))).not.toEqual(String(variable('a', types.number)));
    expect(String(variable('a'))).not.toEqual(String(get('a')));
  });
});
