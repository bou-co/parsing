import { CreateParserContext, initializeParser, ParserGlobalContext, ParserInstanceContext } from '../parser';

declare module '../expandable-types' {
  export interface GlobalContext {
    globalValue?: string;
  }
  export interface InstanceContext {
    customContext?: string;
  }
}

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
        value: 'string',
        info: 'string',
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
    const { createParser } = initializeParser();

    const innerParser = createParser({
      title: 'string',
      contextValue: (context) => {
        const { customContext } = context;
        return customContext;
      },
    });

    const parser = createParser({
      value: 'string',
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
});
