import { initializeParser, ParserContext, ParserPattern } from '../parser';
import { ParserPatternCycleError } from '../parser-patterns';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('patterns', () => {
  it('should resolve a custom pattern and variables independently in the same string', async () => {
    const db: Record<string, unknown> = { 'products.count': 42 };
    const dbResolve = jest.fn(async ({ path }: { path: string }) => db[path]);
    const { createParser, types } = initializeParser({
      variables: { name: 'World' },
      patterns: {
        db: { match: /\$([a-zA-Z0-9_.]+)/g, expressions: false, resolve: dbResolve as ParserPattern['resolve'] },
      },
    });

    const parser = createParser({ title: types.string });
    const data = await parser({ title: 'Hello {{name}} and $products.count items' });

    expect(data.title).toEqual('Hello World and 42 items');
    expect(dbResolve).toHaveBeenCalledTimes(1);
    const input = dbResolve.mock.calls[0][0] as { path: string; raw: string; groups: RegExpExecArray };
    expect(input.path).toEqual('products.count');
    expect(input.raw).toEqual('$products.count');
    expect(input.groups[1]).toEqual('products.count');
  });

  it('should prefer the longest match and then registration order on overlap', async () => {
    const singleResolve = jest.fn(({ path }: { path: string }) => `single:${path}`);
    const shadowResolve = jest.fn(() => 'shadowed');
    const { createParser, types } = initializeParser({
      variables: { name: 'Bob' },
      patterns: {
        single: { match: /\{([a-z]+)\}/g, expressions: false, resolve: singleResolve as ParserPattern['resolve'] },
        // Same delimiters as the built-in variables pattern — variables registers first and must win
        shadow: { match: /\{\{([a-z]+)\}\}/g, expressions: false, resolve: shadowResolve as ParserPattern['resolve'] },
      },
    });

    const parser = createParser({ title: types.string });
    const data = await parser({ title: 'Go {{name}} and {code}' });

    // The single-brace pattern matches inside {{name}} but loses to the longer variables match
    expect(data.title).toEqual('Go Bob and single:code');
    expect(singleResolve).toHaveBeenCalledTimes(1);
    expect(shadowResolve).not.toHaveBeenCalled();
  });

  it('should call resolve once for a pattern occurring five times in one string', async () => {
    const resolve = jest.fn(async () => 'X');
    const { createParser, types } = initializeParser({
      patterns: {
        db: { match: /\$([a-z]+)/g, expressions: false, cache: 'none', resolve },
      },
    });

    const parser = createParser({ title: types.string });
    const data = await parser({ title: '$a $a $a $a $a' });

    expect(data.title).toEqual('X X X X X');
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('should resolve unique matches in parallel', async () => {
    const events: string[] = [];
    const { createParser, types } = initializeParser({
      patterns: {
        db: {
          match: /\$([a-z]+)/g,
          expressions: false,
          resolve: async ({ path }) => {
            events.push(`start:${path}`);
            await sleep(20);
            events.push(`end:${path}`);
            return path;
          },
        },
      },
    });

    const parser = createParser({ title: types.string });
    await parser({ title: '$a $b $c' });

    expect(events).toHaveLength(6);
    expect(events.slice(0, 3).every((event) => event.startsWith('start:'))).toBe(true);
    expect(events.slice(3).every((event) => event.startsWith('end:'))).toBe(true);
  });

  it('should feed a full-string pattern resolving to an object into a nested projection', async () => {
    const records: Record<string, unknown> = { user: { name: 'John' }, count: 42 };
    const { createParser, types } = initializeParser({
      patterns: {
        db: { match: /\$([a-z]+)/g, expressions: false, resolve: ({ path }) => records[path] },
      },
    });

    const parser = createParser({ user: { name: types.string, always: 'yes' } });
    const data = await parser({ user: '$user' });
    expect(data.user).toEqual({ name: 'John', always: 'yes' });

    // A scalar result keeps falling through to projection-driven resolution
    const scalar = await parser({ user: '$count' });
    expect(scalar.user).toEqual({ always: 'yes' });
  });

  it('should re-scan transformer output for patterns', async () => {
    const { createParser, types } = initializeParser({
      variables: { year: 2024 },
      transformers: {
        legacy: {
          when: ({ data }) => typeof data === 'string' && data.includes('[['),
          then: ({ data }) => String(data).replace(/\[\[([^\]]+)\]\]/g, '{{$1}}'),
        },
      },
    });

    const parser = createParser({ title: types.string });
    const data = await parser({ title: 'Copyright [[year]]' });
    expect(data.title).toEqual('Copyright 2024');
  });

  it('should re-scan resolved pattern output by default and allow opting out', async () => {
    const rescanning = initializeParser({ variables: { a: '{{b}}', b: 'deep' } });
    const rescanned = await rescanning.createParser({ title: rescanning.types.string })({ title: 'Value: {{a}}' });
    expect(rescanned.title).toEqual('Value: deep');

    const optedOut = initializeParser({ variables: { a: '{{b}}', b: 'deep' }, patterns: { variables: { rescan: false } } });
    const literal = await optedOut.createParser({ title: optedOut.types.string })({ title: 'Value: {{a}}' });
    expect(literal.title).toEqual('Value: {{b}}');
  });

  it('should throw a named error on a rescan cycle instead of hanging', async () => {
    const { createParser, types } = initializeParser({ variables: { a: '{{b}}', b: '{{a}}' } });
    const parser = createParser({ title: types.string });
    await expect(parser({ title: '{{a}}' })).rejects.toThrow(ParserPatternCycleError);
  });

  it('should treat a backslash-escaped match as literal text', async () => {
    const { createParser, types } = initializeParser({ variables: { name: 'Bob' } });
    const parser = createParser({ title: types.string, other: types.string });

    const data = await parser({ title: 'Hi \\{{name}}', other: 'Hi \\\\{{name}}' });
    expect(data.title).toEqual('Hi {{name}}');
    expect(data.other).toEqual('Hi \\Bob');
  });

  it('should leave variables untouched when the built-in pattern is disabled', async () => {
    const { createParser, types } = initializeParser({ variables: { name: 'Bob' }, patterns: { variables: false } });
    const parser = createParser({ title: types.string });
    const data = await parser({ title: 'Hi {{name}}' });
    expect(data.title).toEqual('Hi {{name}}');
  });

  it('should give delimiter-declared patterns the full expression grammar automatically', async () => {
    const records: Record<string, unknown> = { 'animals.cat': 'Cat' };
    const { createParser, types } = initializeParser({
      pipes: { uppercase: ({ data }) => String(data).toUpperCase() },
      patterns: {
        db: { delimiters: ['${', '}'], resolve: ({ path }) => records[path] },
      },
    });

    const parser = createParser({ title: types.string });
    const data = await parser({ title: 'I like ${animals.dog || animals.cat | uppercase} and ${missing || "you"}' });
    expect(data.title).toEqual('I like CAT and you');
  });

  it('should throw when expressions are requested without delimiters', async () => {
    const { createParser, types } = initializeParser({
      patterns: {
        db: { match: /\$([a-z.]+)/g, expressions: true, resolve: ({ path }) => path },
      },
    });

    const parser = createParser({ title: types.string });
    await expect(parser({ title: '$anything' })).rejects.toThrow('Pattern "db" requires delimiters for expressions');
  });

  it('should leave expression syntax around token patterns as literal text', async () => {
    const records: Record<string, unknown> = { 'animals.cat.title': 'Cat' };
    const { createParser, types } = initializeParser({
      patterns: {
        db: { match: /\$([a-zA-Z0-9_.]+)/g, resolve: ({ path }) => records[path] },
      },
    });

    const parser = createParser({ title: types.string });
    // A token pattern has no end delimiter, so || is not an expression — only the $ token itself resolves
    const data = await parser({ title: 'My favorite animal is $animals.cat.title || animals.dog.title' });
    expect(data.title).toEqual('My favorite animal is Cat || animals.dog.title');
  });

  it('should re-delimit the variables pattern via delimiters alone', async () => {
    const { createParser, types } = initializeParser({
      variables: { name: 'World' },
      pipes: { uppercase: ({ data }) => String(data).toUpperCase() },
      patterns: { variables: { delimiters: ['${', '}'] } },
    });

    const parser = createParser({ title: types.string, piped: types.string, legacy: types.string });
    const data = await parser({
      title: 'Hello ${name}!',
      piped: '${missing || name | uppercase}',
      legacy: 'Hello {{name}}!',
    });
    expect(data.title).toEqual('Hello World!');
    expect(data.piped).toEqual('WORLD');
    expect(data.legacy).toEqual('Hello {{name}}!');
  });

  it('should expose the parser context to a pattern resolve', async () => {
    const seen: { key?: PropertyKey } = {};
    const { createParser, types } = initializeParser({
      patterns: {
        ctx: {
          match: /\$([a-z]+)/g,
          expressions: false,
          resolve: ({ path, context }: { path: string; context: ParserContext }) => {
            seen.key = context.key;
            return path;
          },
        },
      },
    });

    const parser = createParser({ title: types.string });
    await parser({ title: 'value $here' });
    expect(seen.key).toEqual('title');
  });
});
