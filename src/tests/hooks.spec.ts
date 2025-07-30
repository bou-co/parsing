import { initializeParser } from '../parser';

declare module '../expandable-types' {
  export interface CommonContext {
    base?: number;
  }
}

describe('parsing', () => {
  it('should be able to add before hook to modify data in context', async () => {
    const { createParser } = initializeParser();
    const parser = createParser(
      { value: 'number', always: 'boolean', override: 'string' },
      {
        before: (context) => {
          context.data['value'] += 1; // Increment value by 1
          context.data['always'] = true; // Ensure this hook runs every time
          context.data['override'] = 'Value was modified'; // Add an override property
          return context;
        },
      },
    );

    expect(parser).toBeTruthy();
    const result = await parser({ value: 123, override: 'Initial value' });
    expect(result).toBeTruthy();
    expect(result.value).toEqual(124); // Value should be incremented by 1
    expect(result.always).toEqual(true); // Always should be true
    expect(result.override).toEqual('Value was modified'); // Override should be set
  });

  it('should be able to add before hook to add additional context properties', async () => {
    const { createParser } = initializeParser();
    const initialValue = 5;
    const baseValue = 10;
    const parser = createParser(
      { value: ({ data, base }) => data['value'] + base },
      {
        before: (context) => {
          context.base = baseValue; // Set base to baseValue
          return context;
        },
      },
    );

    expect(parser).toBeTruthy();
    const result = await parser({ value: initialValue });
    expect(result).toBeTruthy();
    expect(result.value).toEqual(initialValue + baseValue); // Value should be base + initialValue
  });

  it('should be able to add before hook to add additional context properties for arrays', async () => {
    const { createParser } = initializeParser();
    const initialValue = 5;
    const baseValue = 10;
    const parser = createParser(
      { value: ({ data, base }) => data['value'] + base },
      {
        before: (context) => {
          context.base = baseValue; // Set base to baseValue
          return context;
        },
      },
    );

    expect(parser).toBeTruthy();
    const result = await parser.asArray([{ value: initialValue }, { value: initialValue }]);
    expect(result).toBeTruthy();
    for (const item of result) {
      expect(item.value).toEqual(initialValue + baseValue); // Each value should be base + initialValue
    }
  });

  it('should be able to add before hook to add additional context properties to parsers that are then extended', async () => {
    const { createParser } = initializeParser();
    const initialValue = 5;
    const baseValue = 10;
    const parser = createParser(
      { value: ({ data, base }) => data['value'] + base },
      {
        before: (context) => {
          context.base = baseValue; // Set base to baseValue
          return context;
        },
      },
    );

    const extendedParser = parser.extend({
      extraValue: ({ data, base }) => data['value'] + base + 5,
    });

    expect(extendedParser).toBeTruthy();
    const result = await extendedParser({ value: initialValue });
    expect(result).toBeTruthy();
    expect(result.value).toEqual(initialValue + baseValue); // Value should be base + initialValue
    expect(result.extraValue).toEqual(initialValue + baseValue + 5);
  });

  it('should be able to add after hook to modify data returned from parser', async () => {
    const { createParser } = initializeParser();
    const parser = createParser(
      { value: 'number', always: 'boolean' },
      {
        after: (context) => {
          context.data['value'] *= 2; // Double the value
          context.data['always'] = true; // Ensure this hook runs every time
          return context;
        },
      },
    );

    expect(parser).toBeTruthy();
    const result = await parser({ value: 123 });
    expect(result).toBeTruthy();
    expect(result.value).toEqual(246); // Value should be doubled
    expect(result.always).toEqual(true); // Always should be true
  });
});
