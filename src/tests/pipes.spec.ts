import { ContextParserValueFunction, initializeParser } from '../parser';
import { defineType, string, types } from '../types';
import { notAPipe } from '../types';

const up: ContextParserValueFunction<string> = ({ data }) => String(data).toUpperCase();
const exclaim: ContextParserValueFunction<string> = ({ data }) => `${data}!`;
const wave: ContextParserValueFunction<string> = ({ data }) => `${data} o/`;

describe('pipes', () => {
  it('should merge pipes from all three context levels', async () => {
    const { createParser, types } = initializeParser({ variables: { name: 'bob' }, pipes: { up } });
    const parser = createParser({ global: types.string, schema: types.string, instance: types.string }, { pipes: { exclaim } });

    const data = await parser({ global: '{{name | up}}', schema: '{{name | exclaim}}', instance: '{{name | wave}}' }, { pipes: { wave } });

    expect(data.global).toEqual('BOB');
    expect(data.schema).toEqual('bob!');
    expect(data.instance).toEqual('bob o/');
  });

  it('should let instance pipes override schema and global pipes of the same name', async () => {
    const { createParser, types } = initializeParser({ variables: { name: 'bob' }, pipes: { decorate: up } });
    const parser = createParser({ title: types.string }, { pipes: { decorate: exclaim } });

    const fromSchema = await parser({ title: '{{name | decorate}}' });
    expect(fromSchema.title).toEqual('bob!');

    const fromInstance = await parser({ title: '{{name | decorate}}' }, { pipes: { decorate: wave } });
    expect(fromInstance.title).toEqual('bob o/');
  });

  it('should not find pipes defined in variables anymore', async () => {
    const { createParser, types } = initializeParser({ variables: { name: 'bob', legacy: up } });
    const parser = createParser({ title: types.string });
    await expect(parser({ title: '{{name | legacy}}' })).rejects.toThrow('Pipe "legacy" at "title" is defined in `variables`');
  });

  it('should make pipes available to custom patterns with expressions enabled', async () => {
    const records: Record<string, unknown> = { name: 'bob' };
    const { createParser, types } = initializeParser({
      pipes: { up },
      patterns: {
        db: { delimiters: ['<<', '>>'], resolve: ({ path }) => records[path] },
      },
    });

    const parser = createParser({ title: types.string });
    const data = await parser({ title: 'Hello <<name | up>> and <<missing || "guest">>' });
    expect(data.title).toEqual('Hello BOB and guest');
  });
});

describe('types as pipes', () => {
  const contact = defineType({
    name: 'contact',
    extends: string,
    fn: (value) => {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error('Invalid contact');
      return value.toLowerCase();
    },
    accessors: { domain: (value) => value.split('@')[1] },
  });

  it('exposes every built-in type and accessor under its qualified and root names', async () => {
    const { createParser, types } = initializeParser({ variables: { when: '2024-05-15T10:00:00.000Z', n: '3.14159', name: 'bob' } });
    const parser = createParser({
      year: types.number,
      iso: types.string,
      rounded: types.number,
      up: types.string,
      upQualified: types.string,
      len: types.number,
    });
    const data = await parser({
      year: '{{ when | date.year }}',
      iso: '{{ when | date.iso }}',
      rounded: '{{ n | round:2 }}',
      up: '{{ name | upperCase }}',
      upQualified: '{{ name | string.upperCase }}',
      len: '{{ name | string.length }}',
    });
    expect(data).toEqual({ year: 2024, iso: '2024-05-15T10:00:00.000Z', rounded: 3.14, up: 'BOB', upQualified: 'BOB', len: 3 });
  });

  it('root forms carry their base cast, and pipes chain', async () => {
    const { createParser, types } = initializeParser({ variables: { n: 12, list: ['b', 'a', 'b'] } });
    const parser = createParser({ up: types.string, joined: types.string, chained: types.string });
    const data = await parser({
      up: '{{ n | upperCase }}',
      joined: '{{ list | unique | join:", " }}',
      chained: '{{ list | array.unique | reverse | first | upperCase }}',
    });
    expect(data).toEqual({ up: '12', joined: 'b, a', chained: 'A' });
  });

  it('makes registered types pipes at global, schema and instance level', async () => {
    const { createParser } = initializeParser({ types: { contact }, variables: { contact: 'Bob@Example.com' } });
    const parser = createParser(
      { g: '{{ contact | contact }}', gd: '{{ contact | contact.domain }}', s: '{{ contact | code }}', i: '{{ contact | shout }}' },
      { types: { code: contact.upperCase } },
    );
    const data = await parser({}, { types: { shout: contact.upperCase } });
    expect(data).toEqual({ g: 'bob@example.com', gd: 'example.com', s: 'BOB@EXAMPLE.COM', i: 'BOB@EXAMPLE.COM' });
  });

  it('function-form global contexts register types for pipes', async () => {
    const { createParser } = initializeParser(async () => ({ types: { contact }, variables: { contact: 'A@B.CO' } }));
    const parser = createParser({ e: '{{ contact | contact }}' });
    expect(await parser({})).toEqual({ e: 'a@b.co' });
  });

  it('explicit pipes shadow type names', async () => {
    const { createParser } = initializeParser({ types: { contact }, pipes: { contact: ({ value }) => `pipe:${value}` }, variables: { contact: 'x' } });
    expect(await createParser({ e: '{{ contact | contact }}' })({})).toEqual({ e: 'pipe:x' });
  });

  it('applies the failure policy: throws without a fallback, falls back when one is written', async () => {
    const errors: string[] = [];
    const { createParser } = initializeParser({ types: { contact }, variables: { contact: 'nope' }, onCastError: (error) => errors.push(error.path) });
    await expect(createParser({ e: '{{ contact | contact }}' })({})).rejects.toThrow('cannot cast value to "contact"');
    expect(await createParser({ e: '{{ contact | contact || "n/a" }}', u: '{{ contact | contact || undefined }}' })({})).toEqual({ e: 'n/a' });
    expect(errors).toEqual(['e', 'e', 'u']);
  });

  it('treats missing values as missing in templates too, unless required', async () => {
    const { createParser } = initializeParser({ types: { contact }, variables: { empty: '' } });
    expect(await createParser({ e: '{{ empty | contact || "n/a" }}', u: '{{ empty | contact }}' })({})).toEqual({ e: 'n/a' });
    await expect(createParser({ e: '{{ empty | contact.required }}' })({})).rejects.toThrow('Missing required value');
  });

  it('looseCasting and token policies apply in templates like at the cast site', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { createParser } = initializeParser({ types: { contact }, variables: { contact: 'nope' } });
    expect(await createParser({ e: '{{ contact | contact }}' })({}, { looseCasting: true })).toEqual({});
    expect(await createParser({ e: '{{ contact | contact.loose }}', d: '{{ contact | contact.loose.default:"x" }}' })({})).toEqual({ d: 'x' });
    await expect(createParser({ e: '{{ contact | contact.strict || "n/a" }}' })({})).rejects.toThrow('cannot cast value to "contact"');
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('calls literal-parameter factories and rejects token-taking ones', async () => {
    const oneOf = (...values: string[]) =>
      defineType((value) =>
        values.includes(String(value))
          ? String(value)
          : (() => {
              throw new Error('Not allowed');
            })(),
      );
    const { createParser } = initializeParser({ types: { oneOf, tokens: notAPipe(() => types.array) }, variables: { s: 'draft' } });
    expect(await createParser({ s: '{{ s | oneOf:"draft":"live" }}', f: '{{ s | oneOf:"live" || "fallback" }}' })({})).toEqual({ s: 'draft', f: 'fallback' });
    await expect(createParser({ s: '{{ s | tokens }}' })({})).rejects.toThrow('cannot be used as a pipe');
  });

  it('reports unknown members, parameter misuse and collisions clearly', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    warn.mockClear();
    const other = defineType({ extends: string, fn: (value) => value, accessors: { domain: (value) => value } });
    const { createParser } = initializeParser({ types: { contact, other }, variables: { v: 'a@b.co' } });
    await expect(createParser({ x: '{{ v | domain }}' })({})).rejects.toThrow('Pipe "domain" not found');
    expect(warn.mock.calls[0][0]).toContain('Accessor "domain" is declared by more than one type');
    expect(await createParser({ x: '{{ v | contact.domain }}' })({})).toEqual({ x: 'b.co' });
    await expect(createParser({ x: '{{ v | contact.nope }}' })({})).rejects.toThrow('has no accessor "nope"');
    await expect(createParser({ x: '{{ v | contact.domain:1 }}' })({})).rejects.toThrow('takes no parameters');
    await expect(createParser({ x: '{{ v | contact.cast }}' })({})).rejects.toThrow('is not an accessor');
    warn.mockRestore();
  });
});
