import { ContextParserValueFunction, initializeParser, Parser, ParserContext } from '../parser';
import { types } from '../parser-casting';

const up: ContextParserValueFunction<string> = ({ data }) => String(data).toUpperCase();

describe('v3 migration catches', () => {
  describe('pipes left in variables', () => {
    it('throws a migration hint when the missing pipe exists as a function in variables', async () => {
      const { createParser, types } = initializeParser({ variables: { name: 'bob', legacy: up } });
      const parser = createParser({ title: types.string });
      await expect(parser({ title: '{{name | legacy}}' })).rejects.toThrow(
        'Pipe "legacy" at "title" is defined in `variables` — v3 looks pipes up from the `pipes` config only',
      );
    });

    it('throws the migration hint for dotted pipe names too', async () => {
      const { createParser, types } = initializeParser({ variables: { name: 'bob', fmt: { upper: up } } });
      const parser = createParser({ title: types.string });
      await expect(parser({ title: '{{name | fmt.upper}}' })).rejects.toThrow('Pipe "fmt.upper" at "title" is defined in `variables`');
    });

    it('keeps the plain not-found error when the name is not in variables either', async () => {
      const { createParser, types } = initializeParser({ variables: { name: 'bob' } });
      const parser = createParser({ title: types.string });
      await expect(parser({ title: '{{name | missing}}' })).rejects.toThrow('Pipe "missing" not found at "title"');
    });

    it('does not interfere with properly migrated pipes', async () => {
      const { createParser, types } = initializeParser({ variables: { name: 'bob' }, pipes: { up } });
      const parser = createParser({ title: types.string });
      const data = await parser({ title: '{{name | up}}' });
      expect(data.title).toEqual('BOB');
    });
  });

  describe('removed Parser statics', () => {
    it('throws when reading Parser.parserGlobalContext', () => {
      expect(() => (Parser as any).parserGlobalContext).toThrow('Parser.parserGlobalContext was removed in v3');
    });

    it('throws when assigning Parser.parserGlobalContext', () => {
      expect(() => {
        (Parser as any).parserGlobalContext = { variables: {} };
      }).toThrow('Parser.parserGlobalContext was removed in v3');
    });

    it('throws when calling Parser.createParser', () => {
      expect(() => (Parser as any).createParser({})).toThrow('Parser.createParser was removed in v3');
    });

    it('keeps the instance createParser working', async () => {
      const engine = new Parser({ variables: { name: 'bob' } });
      const parser = engine.createParser({ title: types.string });
      const data = await parser({ title: '{{name}}' });
      expect(data.title).toEqual('bob');
    });
  });

  describe('types.undefined', () => {
    it('throws a migration error on direct access', () => {
      expect(() => (types as any).undefined).toThrow('There is no types.undefined in v3 — use the `optional` util');
    });

    it('is invisible to spreads and enumeration', () => {
      expect(() => ({ ...types })).not.toThrow();
      expect(Object.keys(types)).not.toContain('undefined');
      expect(() => JSON.stringify(types)).not.toThrow();
    });
  });

  describe('full parser context as second argument', () => {
    it('throws when a value-function context is passed in the instance-context slot', async () => {
      const { createParser, types } = initializeParser();
      const child = createParser({ name: types.string });
      const parent = createParser({
        child: (context: ParserContext) => child((context.data as { child: object }).child, context as never),
      });
      await expect(parent({ child: { name: 'bob' } })).rejects.toThrow('the parent context is the third argument');
    });

    it('still accepts a regular instance context', async () => {
      const { createParser, types } = initializeParser();
      const parser = createParser({ title: types.string, greeting: '{{entity}}' });
      const data = await parser({ title: 'hello' }, { variables: { entity: 'world' } });
      expect(data.title).toEqual('hello');
      expect(data.greeting).toEqual('world');
    });
  });
});
