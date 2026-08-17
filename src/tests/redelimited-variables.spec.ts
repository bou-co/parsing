import { ContextParserValueFunction, getVariableValue, initializeParser, ParserContext } from '../parser';

const uppercase: ContextParserValueFunction<string> = ({ data }) => String(data).toUpperCase();

// Re-delimit the built-in variables pattern to ${ } — everything else must keep working
const { createParser, types } = initializeParser({
  variables: {
    name: 'World',
    user: { profile: { city: 'Helsinki' } },
  },
  pipes: { uppercase },
  variableResolver: async (variableName) => (variableName === 'dynamic' ? 'resolved' : undefined),
  patterns: {
    variables: { match: /\$\{([^}]+)\}/g },
  },
});

describe('re-delimited variables', () => {
  it('should resolve variables with the new delimiters', async () => {
    const parser = createParser({ title: types.string });
    const data = await parser({ title: 'Hello ${name}!' });
    expect(data.title).toEqual('Hello World!');
  });

  it('should keep fallbacks, literals and pipes working', async () => {
    const parser = createParser({ fallback: types.string, piped: types.string });
    const data = await parser({ fallback: '${missing || "guest"}', piped: '${name | uppercase}' });
    expect(data.fallback).toEqual('guest');
    expect(data.piped).toEqual('WORLD');
  });

  it('should keep dot paths and the variable resolver working', async () => {
    const parser = createParser({ city: types.string, dynamic: types.string });
    const data = await parser({ city: '${user.profile.city}', dynamic: '${dynamic}' });
    expect(data.city).toEqual('Helsinki');
    expect(data.dynamic).toEqual('resolved');
  });

  it('should keep the spread equivalent working', async () => {
    const parser = createParser({ all: types.object });
    const data = await parser({ all: '${...}' });
    expect(data.all).toEqual(expect.objectContaining({ name: 'World' }));
  });

  it('should not resolve the old delimiters anymore', async () => {
    const parser = createParser({ title: types.string });
    const data = await parser({ title: 'Hello {{name}}!' });
    expect(data.title).toEqual('Hello {{name}}!');
  });

  it('should resolve the new syntax, the legacy form and bare paths through getVariableValue', async () => {
    const parser = createParser({
      redelimited: (context: ParserContext) => getVariableValue('${name}', context),
      legacy: (context: ParserContext) => getVariableValue('{{name}}', context),
      bare: (context: ParserContext) => getVariableValue('name', context),
    });
    const data = await parser({ anything: true });
    expect(data.redelimited).toEqual('World');
    expect(data.legacy).toEqual('World');
    expect(data.bare).toEqual('World');
  });
});
