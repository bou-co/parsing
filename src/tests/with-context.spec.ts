import { initializeParser } from '../parser';

declare module '../expandable-types' {
  export interface FunctionalContext {
    base: number;
    instanceMultiplier?: number;
  }
}

describe('parsing', () => {
  it('should be able to modify context by using "withContext"', async () => {
    const { createParser } = initializeParser();
    const parser = createParser({ values: 'string' }, { variables: { first: 1 } });

    expect(parser).toBeTruthy();

    const resultWithoutSecondVariable = await parser({ values: '{{ first }}, {{ second }}, {{ third }}' }, { variables: { third: 3 } });
    expect(resultWithoutSecondVariable).toBeTruthy();
    expect(resultWithoutSecondVariable.values).toEqual('1, undefined, 3');

    const withSecondVariable = parser.withContext({ variables: { second: 2 } });
    const resultWithAllVariables = await withSecondVariable({ values: '{{ first }}, {{ second }}, {{ third }}' }, { variables: { third: 3 } });
    expect(resultWithAllVariables).toBeTruthy();
    expect(resultWithAllVariables.values).toEqual('1, 2, 3');
  });

  it('should be able to override context by using "withContext" but not overridden for reuse', async () => {
    const { createParser } = initializeParser();
    const parser = createParser({ values: 'string' }, { variables: { variableValue: 'original' } });

    expect(parser).toBeTruthy();
    const withChangedContext = parser.withContext({ variables: { variableValue: 'changed' } });
    const changedResult = await withChangedContext({ values: 'variable value is {{variableValue}}' });
    expect(changedResult).toBeTruthy();
    expect(changedResult.values).toEqual('variable value is changed');

    const originalResult = await parser({ values: 'variable value is {{variableValue}}' });
    expect(originalResult).toBeTruthy();
    expect(originalResult.values).toEqual('variable value is original');
  });
});
