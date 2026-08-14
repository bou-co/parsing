import { AppObject, initializeParser, ParserFunction } from '../parser';
const variableTitle = 'variable title';

let initializeCount = 0;

const { createParser, types } = initializeParser(async () => {
  await new Promise((resolve) => setTimeout(resolve, 10));
  initializeCount++;
  return { variables: { variableTitle } };
});

describe('parsing', () => {
  it('should be able to parse deeply nested objects in reasonable time', async () => {
    const basicParser = createParser({ value: types.string });
    const levels = 1000;
    const parsers: ParserFunction<any>[] = [];
    let fullData: AppObject = {};
    let halfData: AppObject = {};
    let tenLevelsData: AppObject = {};

    let asyncCount = 0;

    for (let i = 0; i < levels; i++) {
      const previousParser = parsers[i - 1] || basicParser;
      // Note: only one parser key per level since every parser key resolves regardless of data
      const newParser = createParser({
        childValue: previousParser,
        asyncTest: async () => {
          await new Promise((resolve) => setTimeout(resolve, 10)); // Simulate async operation
          asyncCount++;
          return 'default value';
        },
        secondAsyncTest: async () => {
          await new Promise((resolve) => setTimeout(resolve, 10)); // Simulate async operation
          return basicParser({ value: '{{variableTitle}}' });
        },
        thirdAsyncTest: async () => {
          await new Promise((resolve) => setTimeout(resolve, 10)); // Simulate async operation
          return basicParser({ value: '{{variableTitle}}' });
        },
      });
      fullData = i === 0 ? { value: '{{variableTitle}}' } : { childValue: { ...fullData } };
      if (i === Math.floor(levels / 2)) halfData = { ...fullData };
      if (i === 10) tenLevelsData = { ...fullData };
      parsers.push(newParser);
    }
    const rootParser = parsers[parsers.length - 1];
    console.log(`Running parsing test with ${levels} levels...`);

    const initialStartTime = Date.now();
    console.time('Run first async initialization (>=10ms)');
    await basicParser({ title: 'hello' });
    console.timeEnd('Run first async initialization (>=10ms)');
    const initialEndTime = Date.now();
    expect(initialEndTime - initialStartTime).toBeGreaterThanOrEqual(10);
    expect(initialEndTime - initialStartTime).toBeLessThan(100);

    const basicStartTime = Date.now();
    console.time('Parse basic data (<10ms)');
    await basicParser({ title: 'hello' });
    console.timeEnd('Parse basic data (<10ms)');
    const basicEndTime = Date.now();
    expect(basicEndTime - basicStartTime).toBeGreaterThanOrEqual(0);
    expect(basicEndTime - basicStartTime).toBeLessThan(50);

    // The projection is the point of truth so every level resolves regardless of input depth
    expect(asyncCount).toBe(0); // Ensure async function hasn't been called yet
    console.time('Parse no data (~100ms)');
    await rootParser({});
    console.timeEnd('Parse no data (~100ms)');
    expect(asyncCount).toBe(levels); // Ensure async function to be called for each level

    asyncCount = 0; // Reset async count
    console.time('Parse ten levels data (~100ms)');
    await rootParser(tenLevelsData);
    console.timeEnd('Parse ten levels data (~100ms)');
    expect(asyncCount).toBe(levels); // Ensure async function to be called for each level

    asyncCount = 0; // Reset async count
    console.time('Parse half data (~100ms)');
    await rootParser(halfData);
    console.timeEnd('Parse half data (~100ms)');
    expect(asyncCount).toBe(levels); // Ensure async function to be called for each level

    const fullStartTime = Date.now();
    asyncCount = 0; // Reset async count
    console.time('Parse full data (~100ms)');
    const fullResult = await rootParser(fullData);
    console.timeEnd('Parse full data (~100ms)');
    expect(asyncCount).toBe(levels); // Ensure async function to be called for each level
    const fullEndTime = Date.now();

    const duration = fullEndTime - fullStartTime;
    console.log(`Total parsing time for ${levels} levels: ${duration} ms`);
    expect(duration).toBeLessThan(levels / 2); // Ensure parsing completes in a reasonable time

    const asString = JSON.stringify(fullResult);

    expect(asString).toBeDefined();
    expect(asString).toContain(variableTitle);
    expect(asString).toContain('default value');

    console.log('Intialization count:', initializeCount);
    expect(initializeCount).toBe(1); // Ensure parser is initialized only once
  });

  it('should be able to parse async values in parallel', async () => {
    const createAsyncValue =
      (timeout = 10) =>
      async () => {
        await new Promise((resolve) => setTimeout(resolve, timeout)); // Simulate async operation
        return true;
      };

    const basicParser = createParser({
      1: createAsyncValue(1),
      2: createAsyncValue(2),
      3: createAsyncValue(3),
      4: createAsyncValue(4),
      5: createAsyncValue(5),
      6: createAsyncValue(6),
      7: createAsyncValue(7),
      8: createAsyncValue(8),
      9: createAsyncValue(9),
      10: createAsyncValue(10),
      11: createAsyncValue(11),
      12: createAsyncValue(12),
      13: createAsyncValue(13),
      14: createAsyncValue(14),
      15: createAsyncValue(15),
    });

    const fullStartTime = Date.now();
    const result = await basicParser({});
    const fullEndTime = Date.now();
    const duration = fullEndTime - fullStartTime;
    console.log(`Total parsing time for 15 async parsers: ${duration} ms`);
    // Serial execution would take ~120ms; generous budget tolerates test-runner CPU contention
    expect(duration).toBeLessThan(100);

    expect(result[1]).toBeDefined();
    expect(result[5]).toBeDefined();
    expect(result[10]).toBeDefined();
    expect(result[15]).toBeDefined();

    expect(initializeCount).toBe(1); // Ensure parser is initialized only once
  });

  it('should be able to parse nested async values in parallel', async () => {
    const createAsyncValue =
      (timeout = 10) =>
      async () => {
        await new Promise((resolve) => setTimeout(resolve, timeout)); // Simulate async operation
        return true;
      };

    const basicParser = createParser({
      1: createAsyncValue(10),
      2: () => createAsyncValue(10)(),
      3: {
        31: createAsyncValue(10),
        32: createAsyncValue(10),
        33: createAsyncValue(10),
      },
      4: () =>
        createParser({
          41: createAsyncValue(10),
          42: createAsyncValue(10),
          43: createAsyncValue(10),
        })({}),
      5: {
        51: {
          511: createAsyncValue(10),
        },
        52: {
          521: createAsyncValue(10),
        },
        53: {
          531: createAsyncValue(10),
        },
      },
    });

    const fullStartTime = Date.now();
    const result = await basicParser({ 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 });
    const fullEndTime = Date.now();
    const duration = fullEndTime - fullStartTime;
    console.log(`Total parsing time for nested async parsers: ${duration} ms`);
    // Serial execution would take ~110ms; generous budget tolerates test-runner CPU contention
    expect(duration).toBeLessThan(100);

    expect(result[1]).toBeDefined();
    expect(result[2]).toBeDefined();
    expect(result[3]).toBeDefined();
    expect(result[4]).toBeDefined();
    expect(result[5]).toBeDefined();

    expect(initializeCount).toBe(1); // Ensure parser is initialized only once
  });

  it('terminates self-referential parsers via the cycle guard', async () => {
    const nodeParser: ParserFunction<any> = createParser({ name: 'node', child: () => nodeParser });

    const startTime = Date.now();
    const result = await nodeParser({});
    const duration = Date.now() - startTime;

    // One extra level of constants, then the cycle guard stops the recursion
    expect(result).toEqual({ name: 'node', child: { name: 'node' } });
    expect(duration).toBeLessThan(100);

    // With real data the chain follows the data, plus the one constant tail
    const deep = await nodeParser({ child: { child: {} } });
    expect(deep).toEqual({ name: 'node', child: { name: 'node', child: { name: 'node', child: { name: 'node' } } } });
  });

  it('should not use excessive memory for deeply nested objects', async () => {
    const basicParser = createParser({ value: types.string });
    const levels = 1000;
    const parsers: ParserFunction<any>[] = [];
    let fullData: AppObject = {};

    for (let i = 0; i < levels; i++) {
      const previousParser = parsers[i - 1] || basicParser;
      const newParser = createParser({
        childValue: previousParser,
        staticValue: 'constant',
      });
      fullData = i === 0 ? { childValue: { value: '{{variableTitle}}' } } : { childValue: { ...fullData } };
      parsers.push(newParser);
    }
    const rootParser = parsers[parsers.length - 1];

    const heapBefore = process.memoryUsage().heapUsed;
    const result = await rootParser(fullData);
    const heapAfter = process.memoryUsage().heapUsed;

    const heapDelta = heapAfter - heapBefore;
    console.log(`Heap usage delta for ${levels} levels: ${Math.round(heapDelta / 1024 / 1024)}MB (expected: <100MB)`);
    // Context paths hold references to the projections instead of copies so the delta stays small
    expect(heapDelta).toBeLessThan(100 * 1024 * 1024);
    expect(JSON.stringify(result)).toContain(variableTitle);
  });

  it('should be able to validate and return heavy data driven objects in reasonable time', async () => {
    const items = Array.from({ length: 1000 }, (_, i) => ({
      id: `item-${i}`,
      title: `Title for item ${i}`,
      meta: {
        slug: `item-${i}`,
        published: true,
        priority: i,
        author: { name: `Author ${i % 20}`, email: `author-${i % 20}@example.com` },
      },
      tags: [`tag-${i % 10}`, `tag-${i % 7}`, `tag-${i % 3}`],
      content: Array.from({ length: 10 }, (_, p) => ({ type: 'paragraph', text: `Paragraph ${p} of item ${i} with some longer text content` })),
    }));
    const heavyData = { id: 'heavy-root', settings: { locale: 'en', theme: 'dark', flags: { a: true, b: false } }, items };

    // The projection stays vague and only validates the heavy input before returning it
    const parser = createParser({
      id: types.string,
      isValid: ({ data }) => Array.isArray(data['items']) && data['items'].length > 0,
      settings: types.object,
      items: types.array,
    });

    const fullStartTime = Date.now();
    console.time('Parse heavy data driven object (~15ms)');
    const result = await parser(heavyData);
    console.timeEnd('Parse heavy data driven object (~15ms)');
    const fullEndTime = Date.now();
    const duration = fullEndTime - fullStartTime;
    console.log(`Total parsing time for heavy data driven object: ${duration} ms`);
    expect(duration).toBeLessThan(100);

    expect(result.id).toEqual('heavy-root');
    expect(result.isValid).toBe(true);
    expect(result.settings).toEqual(heavyData.settings);
    expect(result.items).toHaveLength(1000);
    expect(result.items?.[999]).toEqual(items[999]);
  });

  it('should be able to resolve projection driven output in reasonable time', async () => {
    const seoParser = createParser({
      title: types.string({ default: 'Untitled' }),
      description: types.string,
      index: true,
    });
    const brandParser = createParser({ brand: 'bou', locale: types.string({ default: 'en' }) });

    const pageParser = createParser({
      title: types.string({ default: 'Untitled page' }),
      slug: types.string,
      seo: seoParser,
      branding: brandParser.flat,
      hero: {
        heading: types.string({ default: 'Welcome' }),
        cta: { label: 'Read more', url: types.string },
        background: types.string,
      },
      footer: {
        copyright: () => '© Bou',
        columns: types.array,
      },
      '@if': [{ when: () => true, then: { generated: true } }],
      '@combine': () => ({ combinedValue: 'combined' }),
    });

    const iterations = 100;
    const fullStartTime = Date.now();
    console.time(`Resolve projection driven output ${iterations} times (~15ms)`);
    const results = [];
    for (let i = 0; i < iterations; i++) {
      results.push(await pageParser({}));
    }
    console.timeEnd(`Resolve projection driven output ${iterations} times (~15ms)`);
    const fullEndTime = Date.now();
    const duration = fullEndTime - fullStartTime;
    console.log(`Total parsing time for ${iterations} projection driven parses: ${duration} ms`);
    expect(duration).toBeLessThan(100);

    expect(results).toHaveLength(iterations);
    expect(results[iterations - 1]).toEqual({
      title: 'Untitled page',
      seo: { title: 'Untitled', index: true },
      brand: 'bou',
      locale: 'en',
      hero: { heading: 'Welcome', cta: { label: 'Read more' } },
      footer: { copyright: '© Bou' },
      generated: true,
      combinedValue: 'combined',
    });
  });
});
