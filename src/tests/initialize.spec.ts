import { initializeParser } from '../parser';

const variableTitle = 'variable title';

describe('parsing', () => {
  it('should work with parser initialized with nothing, function and object', async () => {
    const { createParser: createParserFromNothing } = initializeParser();

    const parser1 = createParserFromNothing({ value: '{{variableTitle}}' });
    expect(parser1).toBeTruthy();
    const data1 = await parser1({});
    expect(data1).toBeTruthy();
    expect(data1.value).toEqual(undefined);

    const { createParser: createParserFromFunction } = initializeParser(async () => {
      return { variables: { variableTitle } };
    });
    const parser2 = createParserFromFunction({ value: '{{variableTitle}}' });
    expect(parser2).toBeTruthy();
    const data2 = await parser2({});
    expect(data2).toBeTruthy();
    expect(data2.value).toEqual(variableTitle);

    const { createParser: createParserFromObject } = initializeParser({ variables: { variableTitle } });
    const parser3 = createParserFromObject({ value: '{{variableTitle}}' });
    expect(parser3).toBeTruthy();
    const data3 = await parser3({});
    expect(data3).toBeTruthy();
    expect(data3.value).toEqual(variableTitle);
  });

  it('should work with parser initialized with function that only runs once #1', async () => {
    let initializeCount = 0;
    const { createParser: createParserFromFunction } = initializeParser(async () => {
      initializeCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { variables: { variableTitle } };
    });
    const parser = createParserFromFunction({ value: '{{variableTitle}}' });
    expect(parser).toBeTruthy();
    const data = await Promise.all([await parser({}), await parser({}), await parser({}), await parser({}), await parser({})]);

    expect(data).toBeTruthy();
    expect(data.length).toEqual(5);
    expect(data.every((d) => d.value)).toBeTruthy();

    expect(initializeCount).toEqual(1);
  });

  it('should work with parser initialized with function that only runs once #2', async () => {
    let initializeCount = 0;
    const { createParser: createParserFromFunction } = initializeParser(async () => {
      initializeCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { variables: { variableTitle } };
    });
    const parser = createParserFromFunction({ value: '{{variableTitle}}' });
    expect(parser).toBeTruthy();

    await parser({});
    await parser({});
    await parser({});
    await parser({});
    await parser({});

    expect(initializeCount).toEqual(1);
  });

  it('should work with parser initialized with function that only runs once #3', async () => {
    let initializeCount = 0;
    const { createParser: createParserFromFunction } = initializeParser(async () => {
      initializeCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { variables: { variableTitle } };
    });
    const parser = createParserFromFunction({ value: '{{variableTitle}}' });
    expect(parser).toBeTruthy();

    parser({});
    parser({});
    parser({});
    parser({});
    parser({});

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(initializeCount).toEqual(1);
  });
});

describe('function-form global context failures', () => {
  const timeout = () => new Promise<string>((resolve) => setTimeout(() => resolve('HANG'), 500));

  it('does not hang later parses when the function throws', async () => {
    const { createParser } = initializeParser(async () => {
      throw new Error('boom');
    });
    const parser = createParser({ a: 'x' });
    await expect(parser({})).rejects.toThrow('boom');
    const second = await Promise.race([
      parser({}).then(
        () => 'resolved',
        (error) => (error as Error).message,
      ),
      timeout(),
    ]);
    expect(second).toEqual('boom');
  });

  it('retries the function on the next parse', async () => {
    let calls = 0;
    const { createParser } = initializeParser(async () => {
      if (++calls === 1) throw new Error('boom');
      return { variables: { v: 'ready' } };
    });
    const parser = createParser({ a: '{{v}}' });
    await expect(parser({})).rejects.toThrow('boom');
    expect(await Promise.race([parser({}), timeout()])).toEqual({ a: 'ready' });
    expect(calls).toEqual(2);
  });
});
