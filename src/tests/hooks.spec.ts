import { initializeParser } from '../parser';

declare module '../expandable-types' {
  export interface FunctionalContext {
    base: number;
    instanceMultiplier?: number;
  }
}

describe('parsing', () => {
  it('should be able to add before hook to modify data in context', async () => {
    const { createParser, types } = initializeParser();
    const parser = createParser(
      { value: types.number, always: types.boolean, override: types.string },
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

  it('should be able to add before hook to add additional context properties for arrays based on the data per array item', async () => {
    const { createParser } = initializeParser();
    const initialValue = 5;
    const parser = createParser(
      { value: ({ data, base }) => data['value'] + base },
      {
        before: (context) => {
          context.base = context.data['value'] || 0; // Set base to value from data
          return context;
        },
      },
    );

    expect(parser).toBeTruthy();
    const result = await parser.asArray([{ value: initialValue }, { value: initialValue }]);
    expect(result).toBeTruthy();
    for (const item of result) {
      expect(item.value).toEqual(initialValue + initialValue); // Each value should be base + initialValue
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
    const { createParser, types } = initializeParser();
    const parser = createParser(
      { value: types.number, always: types.boolean },
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

  it('should be able to run global before for all parsers while instance before should only run for the instance', async () => {
    const { createParser } = initializeParser({
      before: (context) => {
        context.base = 100; // Set a global base value
        return context;
      },
    });

    const parser = createParser({ value: ({ data, base, instanceMultiplier }) => data['value'] + base * (instanceMultiplier || 2) });

    const results1 = await parser({ value: 5 });
    expect(results1).toBeTruthy();
    expect(results1.value).toEqual(5 + 100 * 2); // Global base should be applied with default multiplier

    const results2 = await parser(
      { value: 5 },
      {
        before: (context) => {
          context.instanceMultiplier = 3; // Set instance-specific multiplier
          return context;
        },
      },
    );
    expect(results2).toBeTruthy();
    expect(results2.value).toEqual(5 + 100 * 3); // Global base should be applied with instance-specific multiplier

    const results3 = await parser(
      { value: 5 },
      {
        before: (context) => {
          context.base = 50; // Override global base for this instance
          context.instanceMultiplier = 4; // Set instance-specific multiplier
          return context;
        },
      },
    );
    expect(results3).toBeTruthy();
    expect(results3.value).toEqual(5 + 50 * 4); // Instance-specific base should be applied with instance-specific multiplier
  });

  it('should be able to run global after for all parsers while instance after should only run for the instance', async () => {
    const { createParser, types } = initializeParser({
      after: (context) => {
        context.data['global'] = 'This is global'; // Add a global property
        return context;
      },
    });

    const parser = createParser({ value: types.number, global: types.string, instance: types.string });

    const results1 = await parser({ value: 5 });
    expect(results1).toBeTruthy();
    expect(results1.value).toEqual(5); // Value should remain unchanged
    expect(results1.global).toEqual('This is global'); // Global property should be added
    expect(results1.instance).toBeUndefined(); // Instance-specific property should not be present

    const results2 = await parser(
      { value: 10 },
      {
        after: (context) => {
          context.data['instance'] = 'This is instance'; // Add an instance-specific property
          return context;
        },
      },
    );
    expect(results2).toBeTruthy();
    expect(results2.value).toEqual(10); // Value should remain unchanged
    expect(results2.global).toEqual('This is global'); // Global property should still be present
    expect(results2.instance).toEqual('This is instance'); // Instance-specific property should be added
  });

  it('should be able to modify context in before hook of a parent parser and have the modified context available in child parser', async () => {
    const { createParser } = initializeParser();
    const parentParser = createParser(
      { value: ({ data, base }) => data['value'] + base },
      {
        before: (context) => {
          context.base = 20; // Set base in parent parser
          return context;
        },
      },
    );

    const childParser = parentParser.extend({
      value: ({ data, base }) => data['value'] * base, // Use modified base from parent parser
    });

    const result = await childParser({ value: 5 });
    expect(result).toBeTruthy();
    expect(result.value).toEqual(5 * 20); // Value should be multiplied by the base set in the parent parser
  });
});

describe('hook composition on extend/withContext', () => {
  it('should run both base and extension before hooks when extending with a second before hook', async () => {
    const { createParser } = initializeParser();
    const parser = createParser(
      { value: ({ data, base }) => data['value'] + base },
      {
        before: (context) => {
          context.base = 10;
          return context;
        },
      },
    );

    const extended = parser.extend(
      { extra: ({ base, instanceMultiplier }) => base * (instanceMultiplier || 0) },
      {
        before: (context) => {
          context.instanceMultiplier = context.base + 5; // Reads the value set by the base hook
          return context;
        },
      },
    );

    const result = await extended({ value: 5 });
    expect(result.value).toEqual(5 + 10); // Base hook still ran
    expect(result.extra).toEqual(10 * 15); // Extension hook ran and saw the base hook's context
  });

  it('should run both base and extension after hooks when extending with a second after hook', async () => {
    const { createParser, types } = initializeParser();
    const parser = createParser(
      { value: types.number },
      {
        after: (context) => {
          context.data['value'] *= 2;
          return context;
        },
      },
    );

    const extended = parser.extend(
      { note: types.string },
      {
        after: (context) => {
          context.data['note'] = `value is ${context.data['value']}`; // Sees the base hook's transformed data
          return context;
        },
      },
    );

    const result = await extended({ value: 5 });
    expect(result.value).toEqual(10);
    expect(result.note).toEqual('value is 10');
  });

  it('should chain before hooks across multiple extends in definition order', async () => {
    const { createParser } = initializeParser();
    const order: string[] = [];
    const parser = createParser(
      { value: ({ base }) => base },
      {
        before: (context) => {
          order.push('base');
          context.base = 1;
          return context;
        },
      },
    );

    const extended = parser
      .extend(
        {},
        {
          before: (context) => {
            order.push('first');
            context.base += 10;
            return context;
          },
        },
      )
      .extend(
        {},
        {
          before: (context) => {
            order.push('second');
            context.base *= 3;
            return context;
          },
        },
      );

    const result = await extended({ value: 0 });
    expect(order).toEqual(['base', 'first', 'second']);
    expect(result.value).toEqual((1 + 10) * 3);
  });

  it('should let the extension before hook override values set by the base hook', async () => {
    const { createParser } = initializeParser();
    const parser = createParser(
      { value: ({ base }) => base },
      {
        before: (context) => {
          context.base = 10;
          return context;
        },
      },
    );

    const extended = parser.extend(
      {},
      {
        before: (context) => {
          context.base = 99;
          return context;
        },
      },
    );

    expect((await parser({ any: true })).value).toEqual(10); // Base parser stays unaffected by the extension
    expect((await extended({ any: true })).value).toEqual(99);
  });

  it('should keep the base before hook when the extend context has no hook of its own', async () => {
    const { createParser } = initializeParser();
    const parser = createParser(
      { value: ({ base }) => base, greeting: '{{greeting}}' },
      {
        before: (context) => {
          context.base = 7;
          return context;
        },
      },
    );

    const extended = parser.extend({ extra: 'constant' }, { variables: { greeting: 'hello' } });

    const result = await extended({ any: true });
    expect(result.value).toEqual(7);
    expect(result.greeting).toEqual('hello');
    expect(result.extra).toEqual('constant');
  });

  it('should run both before hooks when withContext adds a second before hook', async () => {
    const { createParser } = initializeParser();
    const parser = createParser(
      { value: ({ base, instanceMultiplier }) => base * (instanceMultiplier || 1) },
      {
        before: (context) => {
          context.base = 5;
          return context;
        },
      },
    );

    const withExtra = parser.withContext({
      before: (context) => {
        context.instanceMultiplier = 4;
        return context;
      },
    });

    expect((await withExtra({ any: true })).value).toEqual(5 * 4);
    expect((await parser({ any: true })).value).toEqual(5); // Original parser stays unaffected
  });

  it('should run global, schema, extension and instance before hooks once each on an extended parser', async () => {
    const counts = { global: 0, schema: 0, extension: 0, instance: 0 };
    const { createParser } = initializeParser({
      before: (context) => {
        counts.global += 1;
        context.base = 1;
        return context;
      },
    });

    const parser = createParser(
      { value: ({ base }) => base },
      {
        before: (context) => {
          counts.schema += 1;
          context.base += 10;
          return context;
        },
      },
    ).extend(
      {},
      {
        before: (context) => {
          counts.extension += 1;
          context.base += 100;
          return context;
        },
      },
    );

    const result = await parser(
      { any: true },
      {
        before: (context) => {
          counts.instance += 1;
          context.base += 1000;
          return context;
        },
      },
    );

    expect(result.value).toEqual(1111);
    expect(counts).toEqual({ global: 1, schema: 1, extension: 1, instance: 1 });
  });
});
