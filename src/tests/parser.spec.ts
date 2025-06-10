import { initializeParser, ParserReturnValue } from '../parser';
import { condition, optional } from '../parser-util';

const variableTitle = 'variable title';

const { createParser } = initializeParser(async () => {
  return { variables: { variableTitle } };
});

const hello = 'hello world';
const lorem = 'lorem ipsum';

describe('parsing', () => {
  it('should work', async () => {
    const parser = createParser({ added: 'string', custom: lorem, missing: 'string' });

    expect(parser).toBeTruthy();
    expect(parser.projection).toEqual({ added: 'string', custom: lorem, missing: 'string' });
    expect(typeof parser).toEqual('function');

    const promise = parser({ added: hello });
    expect(promise).toBeInstanceOf(Promise);
    const data = await promise;

    expect(data).toBeTruthy();
    expect(data.added).toEqual(hello);
    expect(data.custom).toEqual(lorem);
    expect(data.missing).toBeUndefined();
  });

  it('nested projection should work', async () => {
    const parser = createParser({
      added: 'string',
      nested: { child: 'string' },
    });

    expect(parser.projection.nested.child).toEqual('string');

    const data = await parser({ added: hello, nested: { child: lorem } });

    expect(data).toBeTruthy();
    expect(data.added).toEqual(hello);
    expect(data.nested?.child).toEqual(lorem);
  });

  it('should work with async functions', async () => {
    const parser = createParser({
      added: 'string',
      custom: async () => lorem,
    });

    const data = await parser({ added: hello });

    expect(data).toBeTruthy();
    expect(data.added).toEqual(hello);
    expect(data.custom).toEqual(lorem);
  });

  it('should work with nested parsers', async () => {
    const parser = createParser({
      added: 'string',
      custom: createParser({ nested: 'string' }),
    });

    const data = await parser({ added: hello, custom: { nested: lorem } });

    expect(data).toBeTruthy();
    expect(data.added).toEqual(hello);
    expect(data.custom?.nested).toEqual(lorem);
  });

  it('should work with nested parsers when value is an array', async () => {
    const parser = createParser({
      added: 'string',
      items: createParser({ title: 'string' }),
    });

    const data = await parser({ added: hello, items: [{ title: hello }, { title: lorem }] });

    expect(data).toBeTruthy();
    expect(data.added).toEqual(hello);
    expect(data.items).toBeInstanceOf(Array);
    expect(data.items).toHaveLength(2);
    expect(data.items).toEqual([{ title: hello }, { title: lorem }]);
  });

  it('should work turn null into undefined', async () => {
    const parser = createParser({
      hello: 'string',
      notDefined: () => null,
    });

    const data = await parser({ hello, notDefined: 'here' });

    expect(data).toBeTruthy();
    expect(data.hello).toEqual(hello);
    expect(data.notDefined).toBeUndefined();
  });

  it('should be able to override parsed values', async () => {
    const parser = createParser({
      hello: 'string',
    });

    const data = await parser({ hello });

    expect(data).toBeTruthy();
    expect(data.hello).toEqual(hello);
    data.hello = lorem;
    expect(data.hello).toEqual(lorem);
  });

  it('should be able to do optional values', async () => {
    const parser = createParser({
      lorem: 'string',
      notDefined: optional<string>,
      defined: optional<string>,
    });

    type ParserValue = ParserReturnValue<typeof parser>;
    const value: ParserValue = { lorem, defined: 'defined' };
    const data = await parser(value);

    expect(data).toBeTruthy();
    expect(data.lorem).toEqual(lorem);
    expect(data.notDefined).toBeUndefined();
    expect(data.defined).toEqual('defined');
  });

  it('should be able to do "any" or "unknown" value', async () => {
    const deepParser = createParser({
      hello: 'any',
    });

    const nestedParser = createParser({
      lorem: 'unknown',
      hello: 'any',
      nested: deepParser,
    });

    const parser = createParser({
      lorem: 'string',
      hello: 'string',
      nested: nestedParser,
    });

    type ParserValue = ParserReturnValue<typeof parser>;
    const value: ParserValue = { lorem, hello, nested: { lorem, hello, nested: { hello: '123' } } };
    const data = await parser(value);

    expect(data).toBeTruthy();
    expect(data.lorem).toEqual(lorem);
    expect(data.hello).toEqual(hello);
    expect(data.nested?.lorem).toEqual(lorem);
    expect(data.nested?.hello).toEqual(hello);
    expect(data.nested?.nested?.hello).toEqual('123');
  });

  it('should be able to do "date" value', async () => {
    const parser = createParser({
      timeStamp: 'date',
      endof1970: 'date',
    });

    const value = { timeStamp: new Date(), endof1970: '1970-12-31T23:59:59.999Z' };
    const data = await parser(value);

    const timeStampValue = new Date(value.timeStamp).getTime();
    const endof1970Value = new Date(value.endof1970).getTime();

    expect(data).toBeTruthy();
    expect(data.timeStamp).toBeInstanceOf(Date);
    expect(data.timeStamp?.getTime()).toEqual(timeStampValue);
    expect(data.endof1970).toBeInstanceOf(Date);
    expect(data.endof1970?.getTime()).toEqual(endof1970Value);
  });

  // Utils

  it('should turn nested object into array when "@array": true is used', async () => {
    const parser = createParser({
      added: 'string',
      custom: { '@array': true, nested: 'string' },
    });

    const data = await parser({ added: hello, custom: [{ nested: lorem }, { nested: lorem }] });

    expect(data).toBeTruthy();
    expect(data.added).toEqual(hello);
    expect(data.custom).toBeInstanceOf(Array);
    expect(data.custom?.[0].nested).toEqual(lorem);
    expect(data.custom?.[1].nested).toEqual(lorem);
  });

  it('should turn nested parsers into array when "@array": true is used', async () => {
    const deeperParser = createParser({
      '@array': true,
      deep: 'boolean',
      fn: async () => true,
    });

    const innerParser = createParser({
      '@array': true,
      nested: 'string',
      custom: deeperParser,
    });

    const parser = createParser({
      added: 'string',
      custom: innerParser,
    });

    const data = await parser({ added: hello, custom: [{ nested: lorem }, { nested: lorem, custom: [{ deep: true }, { deep: false }] }] });

    expect(data).toBeTruthy();
    expect(data.added).toEqual(hello);
    expect(data.custom).toBeInstanceOf(Array);
    expect(data.custom?.[0].nested).toEqual(lorem);
    expect(data.custom?.[1].nested).toEqual(lorem);
    expect(data.custom?.[1].custom?.[0].deep).toEqual(true);
    expect(data.custom?.[1].custom?.[1].deep).toEqual(false);
  });

  it('should append values conditionally when "@if" is used', async () => {
    const parser = createParser({
      added: 'string',
      '@if': [
        {
          when: () => true,
          then: { custom: lorem },
        },
        condition(() => false, { another: 'string' }),
      ],
    });

    const data = await parser({ added: hello });

    expect(data).toBeTruthy();
    expect(data.added).toEqual(hello);
    expect(data.custom).toEqual(lorem);
    expect(data.another).toBeUndefined();
  });

  it('should append values conditionally when "@if" is used with inner projections', async () => {
    const innerParser = createParser({
      '@array': true,
      nested: 'string',
    });

    const parser = createParser({
      added: 'string',
      '@if': [
        {
          when: () => true,
          then: { custom: 'string', lorem, inner: innerParser },
        },
      ],
    });

    const data = await parser({ added: hello, custom: hello, inner: [{ nested: lorem }] });

    expect(data).toBeTruthy();
    expect(data.added).toEqual(hello);
    expect(data.custom).toEqual(hello);
    expect(data.lorem).toEqual(lorem);
    expect(data.inner?.[0]?.nested).toEqual(lorem);
  });

  it('should append values conditionally when "@if" is used with deeper inner projections', async () => {
    const level3Parser = createParser({
      level3: true,
      '@if': [
        {
          when: () => true,
          then: { level3Additional1: 'string' },
        },
        {
          when: () => true,
          then: { level3Additional2: 'string' },
        },
      ],
    });

    const level2Parser1 = createParser({
      level2: true,
      '@if': [
        {
          when: () => true,
          then: level3Parser,
        },
        {
          when: () => true,
          then: { level2Additional1: 'string' },
        },
      ],
    });

    const level2Parser2 = createParser({
      level2p2: true,
      '@if': [
        {
          when: () => true,
          then: { level2p2Additional1: true },
        },
      ],
    });

    const level1Parser = createParser({
      level1: true,
      '@if': [
        {
          when: () => true,
          then: { level1Additional1: 'string' },
        },
        {
          when: () => true,
          then: {
            level2Parser1,
          },
        },
        {
          when: () => true,
          then: level2Parser2,
        },
      ],
    });

    const rootParser = createParser({
      level1Parser,
    });

    const level3Value = { level3: true, level3Additional1: 'level3Additional1Works', level3Additional2: 'level3Additional2Works' };
    const level3Data = await level3Parser(level3Value);
    const level2Value1 = { level2: true, level2Additional1: 'level2Additional1Works', ...level3Value };
    const level2Data1 = await level2Parser1(level2Value1);
    const level2Value2 = { level2p2: true, level2p2Additional1: true };
    const level2Data2 = await level2Parser2(level2Value2);
    const level1Value = { level1: true, level1Additional1: 'level1Additional1Works', level2Parser1: level2Data1, ...level2Data2 };
    const level1Data = await level1Parser(level1Value);
    const rootValue = { level1Parser: level1Value };
    const rootData = await rootParser(rootValue);

    expect(level3Data).toBeTruthy();
    expect(level3Data.level3).toBeTruthy();
    expect(level3Data.level3Additional1).toEqual('level3Additional1Works');
    expect(level3Data.level3Additional2).toEqual('level3Additional2Works');

    expect(level2Data1).toBeTruthy();
    expect(level2Data1.level2).toBeTruthy();
    expect(level2Data1.level2Additional1).toEqual('level2Additional1Works');
    expect(level2Data1.level3).toBeTruthy();
    expect(level2Data1.level3Additional1).toEqual('level3Additional1Works');
    expect(level2Data1.level3Additional2).toEqual('level3Additional2Works');
    expect(level2Data1.level3Additional2).toEqual('level3Additional2Works');

    expect(level1Data).toBeTruthy();
    expect(level1Data.level1).toBeTruthy();
    expect(level1Data.level1Additional1).toEqual('level1Additional1Works');

    expect(level1Data.level2Parser1?.level2).toBeTruthy();
    expect(level1Data.level2Parser1?.level2Additional1).toEqual('level2Additional1Works');
    expect(level1Data.level2Parser1?.level3).toBeTruthy();
    expect(level1Data.level2Parser1?.level3Additional1).toEqual('level3Additional1Works');
    expect(level1Data.level2Parser1?.level3Additional2).toEqual('level3Additional2Works');

    expect(rootData).toBeTruthy();
    expect(rootData.level1Parser?.level1).toBeTruthy();
    expect(rootData.level1Parser?.level1Additional1).toEqual('level1Additional1Works');
    expect(rootData.level1Parser?.level2Parser1?.level2).toBeTruthy();
    expect(rootData.level1Parser?.level2Parser1?.level2Additional1).toEqual('level2Additional1Works');
    expect(rootData.level1Parser?.level2Parser1?.level3).toBeTruthy();
    expect(rootData.level1Parser?.level2Parser1?.level3Additional1).toEqual('level3Additional1Works');
    expect(rootData.level1Parser?.level2Parser1?.level3Additional2).toEqual('level3Additional2Works');
  });

  it('should append values when "@combine" is used', async () => {
    const parser = createParser({
      added: 'string',
      '@combine': async () => ({ custom: lorem }),
    });

    const data = await parser({ added: hello });

    expect(data).toBeTruthy();
    expect(data.added).toEqual(hello);
    expect(data.custom).toEqual(lorem);
  });

  it('should append values when multiple "@combine"s are used', async () => {
    const parser = createParser({
      added: 'string',
      '@combine:custom': async () => {
        const truthy = false;
        if (truthy) return undefined;
        return { first: lorem };
      },
      '@combine:2': async () => ({ second: 123 }),
    });

    type ParserValue = ParserReturnValue<typeof parser>;

    const infiniteTest = (data: ParserValue) => data;

    const data = await parser({ added: hello });

    expect(data).toBeTruthy();
    expect(data.added).toEqual(hello);
    expect(data.first).toEqual(lorem);
    expect(data.second).toEqual(123);

    const res = infiniteTest(data);
    expect(res).toBeTruthy();
  });

  it('should be able to use deeply nested instance context values', async () => {
    const deepValue = 'deep';
    const asyncValue = 'async';
    const async = new Promise((resolve) => setTimeout(() => resolve(asyncValue), 10));
    const nestedInstanceContext = { variables: { baseValue: hello, nested: { value: lorem, async }, deep: { 1: { 2: { 3: { value: deepValue } } } } } };

    const parser = createParser({
      baseValue: 'string',
      nestedValue: 'string',
      asyncValue: 'string',
      deepValue: 'string',
      title: async ({ variables }) => {
        const _baseValue = variables['baseValue'];
        expect(_baseValue).toEqual(hello);
        const _nestedValue = variables['nested'].value;
        expect(_nestedValue).toEqual(lorem);
        const _asyncValue = await variables['nested'].async;
        expect(_asyncValue).toEqual(asyncValue);
        const _deepValue = variables['deep'][1][2][3].value;
        expect(_deepValue).toEqual(_deepValue);
        return `This is: ${_baseValue}, ${_nestedValue}, ${_asyncValue}, ${_deepValue}`;
      },
    });

    const data = await parser(
      {
        baseValue: '{{baseValue}}',
        nestedValue: '{{nested.value}}',
        asyncValue: '{{nested.async}}',
        deepValue: '{{deep.1.2.3.value}}',
      },
      nestedInstanceContext,
    );

    expect(data).toBeTruthy();
    expect(data.baseValue).toEqual(hello);
    expect(data.nestedValue).toEqual(lorem);
    expect(data.asyncValue).toEqual(asyncValue);
    expect(data.deepValue).toEqual(deepValue);
    expect(data.title).toEqual(`This is: ${hello}, ${lorem}, ${asyncValue}, ${deepValue}`);
  });

  it('should be able to project full instance context variables as a value', async () => {
    const parser = createParser({ contextual: 'object' });

    const instanceContext = { variables: { added: hello, custom: lorem } };
    const data = await parser({ contextual: '{{...}}' }, instanceContext);

    expect(data).toBeTruthy();
    expect(data.contextual).toEqual(instanceContext.variables);
  });

  it('should be able to handle frozen objects', async () => {
    const parser = createParser({ nested: 'any', deep: 'object' });
    const deep = Object.freeze({ value: hello });
    const rawData = { nested: lorem, deep };
    const data = await parser(rawData);

    expect(data).toBeTruthy();
    expect(data.deep).toEqual(rawData.deep);
  });

  it('should be able to handle frozen arrays', async () => {
    const parser = createParser({ nested: 'any', deep: 'object' });
    const deep = Object.freeze([hello, lorem]);
    const rawData = { nested: lorem, deep };
    const data = await parser(rawData);

    expect(data).toBeTruthy();
    expect(data.deep).toEqual(rawData.deep);
  });

  // Extra type testing

  it('should work', async () => {
    const parser = createParser({ title: 'string' });

    const data = await parser({ title: 'Hello' });
    expect(data.title).toEqual('Hello');

    const arr = await parser.asArray([{ title: 'Hello' }, { title: 'World' }]);
    expect(arr).toEqual([{ title: 'Hello' }, { title: 'World' }]);

    const as = await parser.as<{ title: 'Hello' }>({ title: 'Hello' });
    expect(as).toEqual({ title: 'Hello' });

    const parser2 = createParser({ items: parser.asArray });

    const data2 = await parser2({ items: [{ title: 'Hello' }, { title: 'World' }] });
    expect(data2?.items).toEqual([{ title: 'Hello' }, { title: 'World' }]);
  });

  it('should discard undefined values correctly', async () => {
    const parser = createParser({ title: 'string', description: 'string', year: 'number' });
    const data = await parser({ title: 'Hello' });
    expect(data.title).toEqual('Hello');
    expect(data.description).toBeUndefined();
    expect(data.year).toBeUndefined();

    const keys = Object.keys(data);
    expect(keys).toHaveLength(1);
    expect(keys).toContain('title');
    expect(keys).not.toContain('description');
    expect(keys).not.toContain('year');
  });
});
