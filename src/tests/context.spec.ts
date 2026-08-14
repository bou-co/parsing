import { CreateParserContext, initializeParser, ParserContext, ParserGlobalContext, ParserInstanceContext } from '../parser';

declare module '../expandable-types' {
  export interface GlobalContext {
    globalValue?: string;
  }
  export interface InstanceContext {
    customContext?: string;
  }
}

const { types } = initializeParser();

describe('parsing', () => {
  it('should be able to handle context variables and other values', async () => {
    const globalContext: ParserGlobalContext = {
      variables: {
        symbol: '!!!',
      },
      globalValue: 'global value',
    };

    const { createParser } = initializeParser(globalContext);

    const createParserContext: CreateParserContext = {
      variables: {
        description: 'This is a test',
      },
    };

    const parser = createParser(
      {
        value: types.string,
        info: types.string,
        customContextValue: (context) => {
          const { customContext } = context;
          return customContext;
        },
        message: ({ variables, customContext }) => {
          return `Title: ${variables['title']}\nDescription: ${variables['description']}\nCustom Context: ${customContext}`;
        },
        globalValue: ({ globalValue }) => {
          return globalValue;
        },
      },
      createParserContext,
    );

    const instanceContext: ParserInstanceContext = {
      variables: {
        title: 'Hello World',
      },
      customContext: 'custom context value',
    };

    const data = await parser(
      {
        value: '{{title}}{{symbol}}',
        info: '{{description}}',
      },
      instanceContext,
    );
    expect(data).toBeTruthy();
    expect(data.value).toEqual('Hello World!!!');
    expect(data.customContextValue).toEqual('custom context value');
    expect(data.info).toEqual('This is a test');
    expect(data.message).toEqual('Title: Hello World\nDescription: This is a test\nCustom Context: custom context value');
    expect(data.globalValue).toEqual('global value');
  });

  it('should be pass the context variables and other values to child parsers', async () => {
    const { createParser, types } = initializeParser();

    const innerParser = createParser({
      title: types.string,
      contextValue: (context) => {
        const { customContext } = context;
        return customContext;
      },
    });

    const parser = createParser({
      value: types.string,
      innerValue: innerParser,
    });

    const instanceContext: ParserInstanceContext = {
      customContext: 'custom context value',
    };

    const data = await parser(
      {
        value: 'Hello world!!!',
        innerValue: {
          title: 'Inner Title',
        },
      },
      instanceContext,
    );

    expect(data).toBeTruthy();
    expect(data.value).toEqual('Hello world!!!');
    expect(data.innerValue).toBeTruthy();
    expect(data.innerValue?.contextValue).toEqual('custom context value');
  });

  it('should be pass the context variables and other values to @if child parsers', async () => {
    const { createParser, types } = initializeParser({ globalValue: 'global-works' });

    const innerParser = createParser({
      title: types.string,
      contextValue: (context) => {
        const { customContext } = context;
        return customContext;
      },
    });

    const parser = createParser({
      '@if': [
        {
          when: ({ globalValue }: ParserContext) => globalValue === 'global-works',
          then: innerParser,
        },
      ],
    });

    const data = await parser(
      {
        title: 'Hello world!!!',
      },
      {
        customContext: 'custom context value',
      },
    );

    expect(data).toBeTruthy();
    expect(data.title).toEqual('Hello world!!!');
    expect(data.contextValue).toEqual('custom context value');
  });

  it('should expose the projection path from root to the current level', async () => {
    const { createParser } = initializeParser();

    let rootPath: object[] | undefined;
    let nestedPath: object[] | undefined;
    let datalessPath: object[] | undefined;

    const nestedProjection = {
      value: ({ path, datalessPath: dataless }: ParserContext) => {
        nestedPath = path;
        datalessPath = dataless;
        return 'nested';
      },
    };

    const projection = {
      rootValue: ({ path }: ParserContext) => {
        rootPath = path;
        return 'root';
      },
      nested: nestedProjection,
    };

    const parser = createParser(projection);

    // Data enabled parse contains the path but no dataless path
    await parser({ nested: { anything: true } });
    expect(rootPath).toHaveLength(1);
    expect(rootPath?.[0]).toBe(projection);
    expect(nestedPath).toHaveLength(2);
    expect(nestedPath?.[0]).toBe(projection);
    expect(nestedPath?.[1]).toBe(nestedProjection);
    expect(datalessPath).toBeUndefined();

    // Data-less parse contains the same path and the dataless path
    await parser({});
    expect(nestedPath).toHaveLength(2);
    expect(nestedPath?.[1]).toBe(nestedProjection);
    expect(datalessPath).toHaveLength(1);
    expect(datalessPath?.[0]).toBe(nestedProjection);
  });
});
