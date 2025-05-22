import { AppObject, ContextParserValueFunction, initializeParser } from '../parser';

const variableTitle = 'variable title';
const variableFunction = () => variableTitle + ' function';
const asyncVariable = Promise.resolve(variableTitle + ' async');
const asyncVariableFunction = async () => variableTitle + ' async function';
const uppercase: ContextParserValueFunction<string> = ({ data }) => data.toUpperCase();
const multiply: ContextParserValueFunction<number, [number]> = ({ data, params: [by] = [2] }) => {
  return data * by;
};
const join: ContextParserValueFunction<number, string[]> = ({ data, params: strings = [] }) => {
  return data + ' ' + strings.join(' ');
};

const variableFunctionWithContext: ContextParserValueFunction<AppObject> = (context) => {
  if (!context) throw new Error('context is undefined');
  const { random } = context.data;
  return `${variableTitle} ${random}`;
};

const { createParser } = initializeParser(async () => {
  return { variableTitle, variableFunction, asyncVariable, asyncVariableFunction, variableFunctionWithContext, uppercase, multiply, join };
});

const hello = 'hello world';
const lorem = 'lorem ipsum';

describe('parsing', () => {
  it('should use global variable value in string values', async () => {
    const parser = createParser({
      title: 'string',
    });
    const data = await parser({ title: `This is: {{variableTitle}}` });
    expect(data).toBeTruthy();
    expect(data.title).toEqual(`This is: ${variableTitle}`);
  });

  it('should use global variable function in string values', async () => {
    const parser = createParser({
      title: 'string',
    });
    const data = await parser({ title: `This is: {{variableFunction}}` });
    expect(data).toBeTruthy();
    expect(data.title).toEqual(`This is: ${variableTitle} function`);
  });

  it('should use global async variable in string values', async () => {
    const parser = createParser({
      title: 'string',
    });
    const data = await parser({ title: `This is: {{asyncVariable}}` });
    expect(data).toBeTruthy();
    expect(data.title).toEqual(`This is: ${variableTitle} async`);
  });

  it('should use global async variable function in string values', async () => {
    const parser = createParser({
      title: 'string',
    });
    const data = await parser({ title: `This is: {{asyncVariableFunction}}` });
    expect(data).toBeTruthy();
    expect(data.title).toEqual(`This is: ${variableTitle} async function`);
  });

  it('should be able to use two global variable values in string values', async () => {
    const parser = createParser({
      title: 'string',
    });
    const data = await parser({ title: `This is: {{variableTitle}} and {{variableTitle}}` });
    expect(data).toBeTruthy();
    expect(data.title).toEqual(`This is: ${variableTitle} and ${variableTitle}`);
  });

  it('should be able to use projection variable values in string values', async () => {
    const projectionContext = { description: lorem };
    const parser = createParser(
      {
        title: 'string',
      },
      projectionContext,
    );
    const data = await parser({ title: `This is: {{description}}` });
    expect(data).toBeTruthy();
    expect(data.title).toEqual(`This is: ${lorem}`);
  });

  it('should be able to use instance variable values in string values', async () => {
    const parser = createParser({
      title: 'string',
    });
    const instanceContext = { added: hello };
    const data = await parser({ title: `This is: {{added}}` }, instanceContext);
    expect(data).toBeTruthy();
    expect(data.title).toEqual(`This is: ${hello}`);
  });

  it('should be able to use instance context in function values', async () => {
    const parser = createParser({
      title: async (context) => {
        const addedValue = context.instanceContext?.['customValue'];
        expect(addedValue).toEqual(hello);
        return `This is: ${addedValue}`;
      },
    });
    const instanceContext = { customValue: hello };
    const data = await parser(
      {
        nothing: true,
      },
      instanceContext,
    );
    expect(data).toBeTruthy();
    expect(data.title).toEqual(`This is: ${hello}`);
  });

  it('should be able to project variable object from instance context', async () => {
    const parser = createParser({ contextual: 'object', another: 'object' });

    const custom = { nested: lorem, deep: { value: hello } };
    const instanceContext = { custom };
    const data = await parser({ contextual: '{{custom}}', another: '{{custom.deep}}' }, instanceContext);
    expect(data).toBeTruthy();
    expect(data.contextual).toEqual(custom);
    expect(data.another).toEqual(custom.deep);
  });

  it('should be able use global variable function with context in string values', async () => {
    const parser = createParser({ title: 'string' });
    const random = Math.floor(Math.random() * 100);
    const data = await parser({ random, title: `This is: {{variableFunctionWithContext}}` });
    expect(data).toBeTruthy();
    expect(data.title).toEqual(`This is: ${variableTitle} ${random}`);
  });

  it('should be able handle string "or" fallbacks for variable values', async () => {
    const parser = createParser({
      title: 'string',
    });
    const data = await parser({ title: `This is: {{notFound || "fallback"}}` });
    expect(data).toBeTruthy();
    expect(data.title).toEqual(`This is: fallback`);
  });

  it('should be able handle dynamic "or" fallbacks for variable values', async () => {
    const parser = createParser({
      title: 'string',
    });
    const data = await parser({ title: `This is: {{notFound || variableTitle}}` });
    expect(data).toBeTruthy();
    expect(data.title).toEqual(`This is: ${variableTitle}`);
  });

  it('should be able handle multiple possible dynamic "or" fallbacks but then result to a string', async () => {
    const parser = createParser({
      title: 'string',
    });
    const data = await parser({ title: `This is: {{notFound || secondNotFound || "fallback"}}` });
    expect(data).toBeTruthy();
    expect(data.title).toEqual(`This is: fallback`);
  });

  it('should be able handle multiple possible dynamic "or" fallbacks but then result to a found variable', async () => {
    const parser = createParser({
      title: 'string',
    });
    const data = await parser({ title: `This is: {{notFound || secondNotFound || variableTitle}}` });
    expect(data).toBeTruthy();
    expect(data.title).toEqual(`This is: ${variableTitle}`);
  });

  it('should be able handle multiple possible dynamic "or" fallbacks but then result to a undefined', async () => {
    const parser = createParser({
      title: 'string',
    });
    const data = await parser({ title: `This is: {{notFound || secondNotFound}}` });
    expect(data).toBeTruthy();
    expect(data.title).toEqual(`This is: undefined`);
  });

  it('should be able handle multiple possible dynamic "or" fallbacks that are deeply nested until finds a match', async () => {
    const parser = createParser({ deepCheck: 'object', deeperCheck: 'string' });
    const custom = { deep: { value: hello } };
    const data = await parser(
      { deepCheck: '{{custom.deep.not.found || custom.deep.stillNo || custom.deep}}', deeperCheck: '{{custom.deep.notFound || custom.deep.value}}' },
      { custom },
    );
    expect(data).toBeTruthy();
    expect(data.deepCheck).toEqual(custom.deep);
    expect(data.deeperCheck).toEqual(custom.deep.value);
  });

  it('should be able handle number "or" fallbacks for variable values', async () => {
    const parser = createParser({
      title: 'string',
      amount: 'number',
    });
    const data = await parser({ title: `This is: {{notFound || 42}}`, amount: `{{notFound || 42}}` });
    expect(data).toBeTruthy();
    expect(data.title).toEqual(`This is: 42`);
    expect(data.amount).toEqual(42);
  });

  it('should be able handle boolean "or" fallbacks for variable values', async () => {
    const parser = createParser({
      title: 'string',
      truthy: 'boolean',
      falsy: 'boolean',
    });
    const data = await parser({ title: `This is: {{notFound || true}}`, truthy: `{{notFound || true}}`, falsy: `{{notFound || false}}` });
    expect(data).toBeTruthy();
    expect(data.title).toEqual(`This is: true`);
    expect(data.truthy).toEqual(true);
    expect(data.falsy).toEqual(false);
  });

  it('should be able handle pipes in variable values', async () => {
    const parser = createParser({
      title: 'string',
    });
    const data = await parser({ title: `This is: {{variableTitle | uppercase}}` });
    expect(data).toBeTruthy();
    expect(data.title).toEqual(`This is: ${variableTitle.toUpperCase()}`);
  });

  it('should be able handle pipes with params in variable values', async () => {
    const parser = createParser({
      amount: 'number',
      another: 'number',
      withDefault: 'number',
    });
    const data = await parser(
      {
        amount: `{{base | multiply:3}}`,
        another: `{{base | multiply:6}}`,
        withDefault: `{{base | multiply}}`,
      },
      { base: 10 },
    );
    expect(data).toBeTruthy();
    expect(data.amount).toEqual(30);
    expect(data.another).toEqual(60);
    expect(data.withDefault).toEqual(20);
  });

  it('should be able handle pipes with multiple params in variable values', async () => {
    const parser = createParser({
      title: 'string',
    });
    const data = await parser({ title: `This is: {{variableTitle | join:"and":"lorem":"ipsum"}}` });
    expect(data).toBeTruthy();
    expect(data.title).toEqual(`This is: ${variableTitle} and lorem ipsum`);
  });

  it('should be able handle pipes with multiple params that are also variables in variable values', async () => {
    const parser = createParser({
      title: 'string',
    });
    const data = await parser({ title: `This is: {{variableTitle | join:"from":firstName:lastName}}` }, { firstName: 'John', lastName: 'Doe' });
    expect(data).toBeTruthy();
    expect(data.title).toEqual(`This is: ${variableTitle} from John Doe`);
  });
});
