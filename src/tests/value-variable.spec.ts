import { initializeParser } from '../parser';
import { ParserContext } from '../parser-types';
import { get, value, variable } from '../parser-util';
import { isTypeToken, ParserCastError } from '../type-token';
import { toHash } from '../to-hash';
import { variables } from '../variables';

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

describe('variables proxy', () => {
  it('resolves like the equivalent {{ }} string', async () => {
    const proxied = createParser({ title: variables.myVariable, name: variables.user.name, missing: variables.missing });
    const literal = createParser({ title: '{{myVariable}}', name: '{{user.name}}', missing: '{{missing}}' });
    expect(await proxied({})).toEqual({ title: 'Hello', name: 'bob' });
    expect(await proxied({})).toEqual(await literal({}));
  });

  it('passes an object variable through raw', async () => {
    expect(await createParser({ settings: variables.settings.nested })({})).toEqual({ settings: { a: 1 } });
  });

  it('stringifies to the {{ }} form', async () => {
    expect(String(variables.user.name)).toEqual('{{user.name}}');
    expect(variables.user.name.toString()).toEqual('{{user.name}}');
    expect(JSON.stringify(variables.a.b)).toEqual('"{{a.b}}"');
    const parser = createParser({ greeting: `${variables.myVariable}, ${variables.user.name}!` });
    expect(await parser({})).toEqual({ greeting: 'Hello, bob!' });
  });

  it('works as a value input and inside resolve', async () => {
    expect(await createParser({ count: value(variables.count, types.number) })({})).toEqual({ count: 42 });
    expect(await resolve({ a: variables.myVariable })).toEqual({ a: 'Hello' });
  });

  it('reads the built-in data head and falls back to the variable resolver', async () => {
    const parser = createParser({ uid: variables.data.uid, remote: variables.remote });
    expect(await parser({ uid: 'abc' })).toEqual({ uid: 'abc', remote: 'from-resolver' });
  });

  it('follows re-delimited variables patterns', async () => {
    const redelimited = initializeParser({ variables: { name: 'World' }, patterns: { variables: { match: /\$\{([^}]+)\}/g } } });
    expect(await redelimited.createParser({ a: variables.name })({})).toEqual({ a: 'World' });
  });

  it('keeps then as a variable name', async () => {
    expect(await createParser({ a: variables.then })({}, { variables: { then: 'next' } })).toEqual({ a: 'next' });
  });

  it('is not a type token and hashes like the {{ }} string', () => {
    expect(isTypeToken(variables.x)).toBe(false);
    expect(toHash({ a: variables.year })).toEqual(toHash({ a: '{{year}}' }));
    expect(toHash({ a: variables.year })).not.toEqual(toHash({ a: variables.month }));
  });

  it('is the same proxy returned from initializeParser', () => {
    expect(initializeParser().variables).toBe(variables);
  });
});

describe('value / variable details', () => {
  it('runs transformers on the result before the cast', async () => {
    const engine = initializeParser({
      variables: { localized: { en: '42', fi: '43' } },
      transformers: {
        pick: { when: ({ data }) => !!data && typeof data === 'object' && 'en' in (data as object), then: ({ data }) => (data as { en: string }).en },
      },
    });
    const parser = engine.createParser({
      fromValue: value({ en: '7', fi: '8' }, engine.types.number),
      fromVariable: variable('localized', engine.types.number),
      fromGet: get('raw', engine.types.number),
    });
    expect(await parser({ raw: { en: '9' } })).toEqual({ fromValue: 7, fromVariable: 42, fromGet: 9 });
  });

  it('does not call a type token or a parser passed as value() input', async () => {
    const inner = createParser({ a: 'x' });
    const called = vi.fn(() => 'computed');
    const anyType = types.any;
    expect(await createParser({ fn: value(called, types.string) })({})).toEqual({ fn: 'computed' });
    expect(called).toHaveBeenCalledTimes(1);
    const data = await createParser({ token: value(types.string, anyType), parser: value(inner, anyType) })({});
    expect(data.token).toBe(types.string);
    expect(data.parser).toBe(inner);
  });

  it('hashes variable() by expression and token', () => {
    expect(String(variable('user.name'))).toEqual('__variable:user.name__');
    expect(String(variable('user.name', types.string))).toEqual(`__variable:user.name:${types.string.id}__`);
    expect(toHash({ a: variable('user.name') })).not.toEqual(toHash({ a: variable('user.email') }));
    expect(toHash({ a: variable('count', types.number) })).not.toEqual(toHash({ a: variable('count', types.string) }));
  });

  it('keeps toString, valueOf and toJSON reserved on the proxy but reachable through variable()', async () => {
    const reserved = { toString: 'a', valueOf: 'b', toJSON: 'c' } as never;
    expect(typeof variables.toString).toEqual('function');
    expect(variables.user.valueOf()).toEqual('{{user}}');
    expect(variables.user.toJSON()).toEqual('{{user}}');
    const parser = createParser({ a: variable('toString'), b: variable('valueOf'), c: variable('toJSON') });
    expect(await parser({}, { variables: reserved })).toEqual({ a: 'a', b: 'b', c: 'c' });
  });

  it('stringifies the proxy to the default {{ }} form even when variables are re-delimited', async () => {
    const redelimited = initializeParser({ variables: { name: 'World' }, patterns: { variables: { match: /\$\{([^}]+)\}/g } } });
    const parser = redelimited.createParser({ direct: variables.name, template: `Hello ${variables.name}` });
    expect(await parser({})).toEqual({ direct: 'World', template: 'Hello {{name}}' });
  });
});
