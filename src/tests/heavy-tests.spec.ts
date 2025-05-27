import { AppObject, initializeParser, ParserFunction } from '../parser';
const variableTitle = 'variable title';

let initializeCount = 0;

const { createParser } = initializeParser(async () => {
  await new Promise((resolve) => setTimeout(resolve, 10));
  initializeCount++;
  return { variableTitle };
});

describe('parsing', () => {
  it('should be able to parse deeply nested objects in reasonable time', async () => {
    const basicParser = createParser({ value: 'string' });
    const levels = 1000;
    const parsers: ParserFunction<any>[] = [];
    let fullData: AppObject = {};
    let halfData: AppObject = {};
    let tenLevelsData: AppObject = {};

    let asyncCount = 0;

    for (let i = 0; i < levels; i++) {
      const previousParser = parsers[i - 1] || basicParser;
      const newParser = createParser({
        childValue: previousParser,
        anotherChildValue: previousParser,
        andAnotherChildValue: previousParser,
        evenMoreChildValue: previousParser,
        yetAnotherChildValue: previousParser,
        andYetAnotherChildValue: previousParser,
        andAnotherOne: previousParser,
        andAnotherOneMore: previousParser,
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
    expect(initialEndTime - initialStartTime).toBeLessThan(20);

    const basicStartTime = Date.now();
    console.time('Parse basic data (<10ms)');
    await basicParser({ title: 'hello' });
    console.timeEnd('Parse basic data (<10ms)');
    const basicEndTime = Date.now();
    expect(basicEndTime - basicStartTime).toBeGreaterThanOrEqual(0);
    expect(basicEndTime - basicStartTime).toBeLessThan(5);

    expect(asyncCount).toBe(0); // Ensure async function hasn't been called yet
    console.time('Parse no data');
    await rootParser({});
    console.timeEnd('Parse no data');
    expect(asyncCount).toBe(1); // Ensure async function to be called once for the root parser

    asyncCount = 0; // Reset async count
    console.time('Parse ten levels data');
    await rootParser(tenLevelsData);
    console.timeEnd('Parse ten levels data');
    expect(asyncCount).toBe(11); // Ensure async function to be called for each level

    asyncCount = 0; // Reset async count
    console.time('Parse half data');
    await rootParser(halfData);
    console.timeEnd('Parse half data');
    expect(asyncCount).toBe(levels / 2 + 1); // Ensure async function to be called for each level up to half

    const fullStartTime = Date.now();
    asyncCount = 0; // Reset async count
    console.time('Parse full data');
    const fullResult = await rootParser(fullData);
    console.timeEnd('Parse full data');
    expect(asyncCount).toBe(levels); // Ensure async function to be called for each level
    const fullEndTime = Date.now();

    const duration = fullEndTime - fullStartTime;
    console.log(`Total parsing time for ${levels} levels: ${duration} ms`);
    expect(duration).toBeLessThan(levels / 4); // Ensure parsing completes in a reasonable time

    const asString = JSON.stringify(fullResult);

    expect(asString).toBeDefined();
    expect(asString).toContain(variableTitle);
    expect(asString).toContain('default value');

    console.log('Intialization count:', initializeCount);
    expect(initializeCount).toBe(1); // Ensure parser is initialized only once
  });
});
