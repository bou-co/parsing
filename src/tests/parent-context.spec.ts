import { initializeParser, ParserContext } from '../parser';

describe('parsing', () => {
  it('should not have a parent in the root parser context', async () => {
    const { createParser } = initializeParser();

    const parser = createParser({
      hasParent: (context) => context.parent !== undefined,
      isRoot: (context) => context.isRoot === true,
    });

    const data = await parser({ value: 'Hello world!!!' });

    expect(data).toBeTruthy();
    expect(data.hasParent).toEqual(false);
    expect(data.isRoot).toEqual(true);
  });

  it('should be able to access parent context from a child parser', async () => {
    const { createParser } = initializeParser();

    const childParser = createParser({
      title: 'string',
      parentValue: ({ parent }) => parent?.data?.['rootField'],
      parentKey: ({ parent }) => parent?.key,
    });

    const parser = createParser({
      rootField: 'string',
      child: childParser,
    });

    const data = await parser({
      rootField: 'root value',
      child: { title: 'Child title' },
    });

    expect(data).toBeTruthy();
    expect(data.child?.title).toEqual('Child title');
    expect(data.child?.parentValue).toEqual('root value');
    expect(data.child?.parentKey).toEqual('child');
  });

  it('should be able to access parent context from a nested object projection', async () => {
    const { createParser } = initializeParser();

    const parser = createParser({
      rootField: 'string',
      child: {
        parentValue: ({ parent }: ParserContext) => parent?.data?.['rootField'],
      },
    });

    const data = await parser({
      rootField: 'root value',
      child: { anything: true },
    });

    expect(data).toBeTruthy();
    expect(data.child?.parentValue).toEqual('root value');
  });

  it('should be able to walk up the parent chain until the root is reached', async () => {
    const { createParser } = initializeParser();

    const grandchildParser = createParser({
      rootValue: ({ parent }) => parent?.parent?.data?.['rootField'],
      walkDepth: (context) => {
        let current: Partial<ParserContext> | undefined = context;
        let depth = 0;
        while (current?.parent) {
          current = current.parent;
          depth++;
        }
        return depth;
      },
      walkedRootValue: (context) => {
        let current: Partial<ParserContext> | undefined = context;
        while (current?.parent) current = current.parent;
        return current?.data?.['rootField'];
      },
    });

    const childParser = createParser({
      grandchild: grandchildParser,
    });

    const parser = createParser({
      rootField: 'string',
      child: childParser,
    });

    const data = await parser({
      rootField: 'root value',
      child: {
        grandchild: { value: 'deep' },
      },
    });

    expect(data).toBeTruthy();
    expect(data.child?.grandchild?.rootValue).toEqual('root value');
    expect(data.child?.grandchild?.walkDepth).toEqual(2);
    expect(data.child?.grandchild?.walkedRootValue).toEqual('root value');
  });

  it('should be able to access parent context from items in an array', async () => {
    const { createParser } = initializeParser();

    const itemParser = createParser({
      '@array': true,
      name: 'string',
      parentIsArray: ({ parent }) => Array.isArray(parent?.data),
      parentKey: ({ parent }) => parent?.key,
      rootValue: ({ parent }) => parent?.parent?.data?.['rootField'],
    });

    const parser = createParser({
      rootField: 'string',
      items: itemParser,
    });

    const data = await parser({
      rootField: 'root value',
      items: [{ name: 'first' }, { name: 'second' }],
    });

    expect(data).toBeTruthy();
    expect(data.items).toHaveLength(2);
    expect(data.items?.[0]?.parentIsArray).toEqual(true);
    expect(data.items?.[0]?.parentKey).toEqual(0);
    expect(data.items?.[0]?.rootValue).toEqual('root value');
    expect(data.items?.[1]?.parentKey).toEqual(1);
    expect(data.items?.[1]?.rootValue).toEqual('root value');
  });

  it('should reach the root by walking up from items parsed with "asArray" syntax', async () => {
    const { createParser } = initializeParser();

    const itemParser = createParser({
      name: 'string',
      parentIsArray: ({ parent }) => Array.isArray(parent?.data),
      walkDepth: (context) => {
        let current: Partial<ParserContext> | undefined = context;
        let depth = 0;
        while (current?.parent) {
          current = current.parent;
          depth++;
        }
        return depth;
      },
    });

    const data = await itemParser.asArray([{ name: 'first' }, { name: 'second' }]);

    expect(data).toHaveLength(2);
    expect(data[0]?.parentIsArray).toEqual(true);
    expect(data[0]?.walkDepth).toEqual(1);
    expect(data[1]?.walkDepth).toEqual(1);
  });

  it('should report isRoot correctly on parent contexts', async () => {
    const { createParser } = initializeParser();

    const grandchildParser = createParser({
      ownIsRoot: ({ isRoot }) => isRoot === true,
      parentIsRoot: ({ parent }) => parent?.isRoot === true,
      grandparentIsRoot: ({ parent }) => parent?.parent?.isRoot === true,
    });

    const parser = createParser({
      child: createParser({
        isRootValue: ({ isRoot }) => isRoot === true,
        parentIsRoot: ({ parent }) => parent?.isRoot === true,
        grandchild: grandchildParser,
      }),
    });

    const data = await parser({
      child: {
        grandchild: { value: 'deep' },
      },
    });

    expect(data).toBeTruthy();
    expect(data.child?.isRootValue).toEqual(false);
    expect(data.child?.parentIsRoot).toEqual(true);
    expect(data.child?.grandchild?.ownIsRoot).toEqual(false);
    expect(data.child?.grandchild?.parentIsRoot).toEqual(false);
    expect(data.child?.grandchild?.grandparentIsRoot).toEqual(true);
  });

  it('should be able to access parent context from an @if child parser', async () => {
    const { createParser } = initializeParser();

    const innerParser = createParser({
      title: 'string',
      parentValue: ({ parent }) => parent?.data?.['rootField'],
    });

    const parser = createParser({
      rootField: 'string',
      '@if': [
        {
          when: () => true,
          then: innerParser,
        },
      ],
    });

    const data = await parser({
      rootField: 'root value',
      title: 'Hello world!!!',
    });

    expect(data).toBeTruthy();
    expect(data.title).toEqual('Hello world!!!');
    expect(data.parentValue).toEqual('root value');
  });
});
