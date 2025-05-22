import { initializeParser, ParserContext, ParserReturnValue } from '../parser';
import { condition, optional } from '../parser-util';

const variableTitle = 'variable title';
const variableFunction = () => variableTitle + ' function';
const asyncVariable = Promise.resolve(variableTitle + ' async');
const asyncVariableFunction = async () => variableTitle + ' async function';

const variableFunctionWithContext = (context: ParserContext) => {
  if (!context) throw new Error('context is undefined');
  const { random } = context.data;
  return `${variableTitle} ${random}`;
};

const { createParser } = initializeParser(async () => {
  return { variableTitle, variableFunction, asyncVariable, asyncVariableFunction, variableFunctionWithContext };
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
});
