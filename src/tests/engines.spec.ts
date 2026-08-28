import { initializeParser } from '../parser';
import { ParserContextTransformer, StorageLike } from '../parser-types';

class MemCache implements StorageLike {
  values: Record<string, unknown> = {};
  match = async (key: string) => this.values[key];
  add = async (key: string, value: unknown) => {
    this.values[key] = value;
  };
}

describe('engine isolation', () => {
  it('keeps parsers bound to their engine after later initializeParser calls', async () => {
    const first = initializeParser({ variables: { who: 'first' } });
    const parser = first.createParser({ who: ({ variables }) => variables['who'] });

    expect((await parser({ anything: true })).who).toEqual('first');

    initializeParser({ variables: { who: 'second' } });
    expect((await parser({ anything: true })).who).toEqual('first');
  });

  it('isolates variables between engines', async () => {
    const a = initializeParser({ variables: { name: 'A' } });
    const b = initializeParser({ variables: { name: 'B' } });
    const parserA = a.createParser({ name: a.types.string });
    const parserB = b.createParser({ name: b.types.string });

    expect((await parserA({ name: '{{name}}' })).name).toEqual('A');
    expect((await parserB({ name: '{{name}}' })).name).toEqual('B');
  });

  it('resolves nested parsers against their own engine', async () => {
    const exclaim: ParserContextTransformer = {
      when: ({ data }) => typeof data === 'string',
      then: ({ data }) => `${data}!`,
    };
    const loud = initializeParser({ transformers: { exclaim } });
    const plain = initializeParser();

    const innerParser = plain.createParser({ word: ({ data }) => data['word'] });
    const outerParser = loud.createParser({ word: ({ data }) => data['word'], nested: innerParser });

    const data = await outerParser({ word: 'hey', nested: { word: 'hey' } });
    expect(data.word).toEqual('hey!');
    expect(data.nested?.word).toEqual('hey');
  });

  it('initializes async global contexts once per engine', async () => {
    let countA = 0;
    let countB = 0;
    const a = initializeParser(async () => {
      countA++;
      return { variables: { value: 'a' } };
    });
    const b = initializeParser(async () => {
      countB++;
      return { variables: { value: 'b' } };
    });

    const parserA = a.createParser({ value: a.types.string });
    const parserB = b.createParser({ value: b.types.string });

    const [firstA, secondA, firstB] = await Promise.all([parserA({ value: '{{value}}' }), parserA({ value: '{{value}}' }), parserB({ value: '{{value}}' })]);

    expect(firstA.value).toEqual('a');
    expect(secondA.value).toEqual('a');
    expect(firstB.value).toEqual('b');
    expect(countA).toBe(1);
    expect(countB).toBe(1);
  });

  it('isolates whole-parse caching storage between engines', async () => {
    const storageA = new MemCache();
    const storageB = new MemCache();
    const a = initializeParser({ storage: storageA, cache: { enabled: true } });
    const b = initializeParser({ storage: storageB, cache: { enabled: true } });

    const parserA = a.createParser({ origin: () => 'A' });
    const parserB = b.createParser({ origin: () => 'B' });

    // Same projection shape + same data would collide if the engines shared storage
    expect((await parserA({ id: 1 })).origin).toEqual('A');
    expect((await parserB({ id: 1 })).origin).toEqual('B');
    expect(Object.keys(storageA.values)).toHaveLength(1);
    expect(Object.keys(storageB.values)).toHaveLength(1);
  });

  it('isolates context.store between engines', async () => {
    const storageA = new MemCache();
    const storageB = new MemCache();
    const a = initializeParser({ storage: storageA });
    const b = initializeParser({ storage: storageB });

    const parserA = a.createParser({ value: ({ store }) => store('shared-key', () => 'from-a') });
    const parserB = b.createParser({ value: ({ store }) => store('shared-key', () => 'from-b') });

    // Same store key must not collide across engines (in-flight dedup and storage are per engine)
    const [dataA, dataB] = await Promise.all([parserA({ anything: true }), parserB({ anything: true })]);
    expect(dataA.value).toEqual('from-a');
    expect(dataB.value).toEqual('from-b');
    expect(storageA.values['shared-key']).toEqual('from-a');
    expect(storageB.values['shared-key']).toEqual('from-b');
  });
});
