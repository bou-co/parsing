import { AppObject, initializeParser } from '../parser';

const variableTitle = 'variable title';
const variableFunction = () => variableTitle + ' function';

const calledVariables = new Set<string>();

const _cache: AppObject = {};
let randomVariableCount = 0;

const { createParser } = initializeParser(async () => {
  return {
    variables: { variableTitle, variableFunction },
    variableResolver: async (variableName, context, cache) => {
      calledVariables.add(variableName);
      if (variableName.startsWith('undefinedVariable')) return 'wadap';
      if (variableName === 'randomVariable') {
        randomVariableCount++;
        const randomValue = Math.random();
        if (!_cache[variableName]) _cache[variableName] = randomValue;
        return cache(randomValue);
      }
      if (variableName === 'asyncVariable') {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve('async variable resolved');
          }, 100);
        });
      }
      if (variableName === 'nestedVariable') {
        return {
          inner: {
            value: 'nested variable value',
          },
        };
      }

      return undefined;
    },
  };
});

describe('parsing', () => {
  it('should be able basic variable resolution', async () => {
    const parser = createParser({
      title: 'string',
      description: 'string',
    });
    const data = await parser({ title: `This is: {{variableTitle}}`, description: `Description is: {{variableFunction}}` });
    expect(data).toBeTruthy();
    expect(data.title).toEqual(`This is: ${variableTitle}`);
    expect(data.description).toEqual(`Description is: ${variableFunction()}`);
  });

  it('should be able resolve variable that is not defined previously', async () => {
    const parser = createParser({
      title: 'string',
    });
    const data = await parser({ title: `This is: {{undefinedVariable}} {{undefinedVariable2}} {{undefinedVariable3}}` });
    expect(data).toBeTruthy();
    expect(data.title).toEqual(`This is: wadap wadap wadap`);
    expect(calledVariables.has('undefinedVariable')).toBeTruthy();
    expect(calledVariables.has('undefinedVariable2')).toBeTruthy();
    expect(calledVariables.has('undefinedVariable3')).toBeTruthy();
  });

  it('should be able to resolve random variable', async () => {
    const parser = createParser({
      title: 'string',
    });
    expect(randomVariableCount).toEqual(0);
    const data = await parser({ title: `This is: {{randomVariable}}` });
    expect(data).toBeTruthy();
    expect(data.title).toEqual(`This is: ${_cache['randomVariable']}`);
    expect(calledVariables.has('randomVariable')).toBeTruthy();
    expect(randomVariableCount).toEqual(1);
  });

  it('should be able to resolve async variable', async () => {
    const parser = createParser({
      title: 'string',
    });
    const data = await parser({ title: `This is: {{asyncVariable}}` });
    expect(data).toBeTruthy();
    expect(data.title).toEqual(`This is: async variable resolved`);
    expect(calledVariables.has('asyncVariable')).toBeTruthy();
  });

  it('should be able to resolve to already cached value', async () => {
    const parser = createParser({
      title: 'string',
    });
    expect(randomVariableCount).toEqual(1); // Should be cached from previous test
    const data = await parser({ title: `This is: {{randomVariable}}` });
    expect(data).toBeTruthy();
    expect(data.title).toEqual(`This is: ${_cache['randomVariable']}`);
    expect(calledVariables.has('randomVariable')).toBeTruthy();
    expect(randomVariableCount).toEqual(1); // Should not increase, as it is cached
  });

  it('should be able handle variables that are returned from resolver and return nested value', async () => {
    const parser = createParser({
      title: 'string',
    });
    const data = await parser({ title: `This is: {{nestedVariable.inner.value}}` });
    expect(data).toBeTruthy();
    expect(data.title).toEqual(`This is: nested variable value`);
    expect(calledVariables.has('nestedVariable')).toBeTruthy();
  });
});
