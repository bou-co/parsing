import { ContextParserValueFunction, initializeParser } from '../parser';

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
