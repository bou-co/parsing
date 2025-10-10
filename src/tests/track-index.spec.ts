import { initializeParser } from '../parser';

describe('parsing', () => {
  it('should be able to get index of current item in array', async () => {
    const { createParser } = initializeParser();

    const parser = createParser({
      rootValue: 'number',
      items: {
        '@array': true,
        title: 'string',
        value: 'number',
        indexTimesThree: ({ index }) => {
          return index !== undefined ? index * 3 : undefined;
        },
      },
    });

    expect(parser).toBeTruthy();

    const originalData = {
      rootValue: 123,
      items: [
        { title: 'hello', value: 10 },
        { title: 'world', value: 20 },
        { title: '!', value: 30 },
      ],
    };
    const res = await parser(originalData);
    expect(res).toBeTruthy();
    expect(res.rootValue).toEqual(123);
    if (!res.items || !Array.isArray(res.items)) throw new Error('Items is not an array');
    const [firstItem, secondItem, thirdItem] = res.items;
    expect(firstItem).toBeTruthy();
    expect(firstItem.title).toEqual('hello');
    expect(firstItem.value).toEqual(10);
    expect(firstItem.indexTimesThree).toEqual(0);

    expect(secondItem).toBeTruthy();
    expect(secondItem.title).toEqual('world');
    expect(secondItem.value).toEqual(20);
    expect(secondItem.indexTimesThree).toEqual(3);

    expect(thirdItem).toBeTruthy();
    expect(thirdItem.title).toEqual('!');
    expect(thirdItem.value).toEqual(30);
    expect(thirdItem.indexTimesThree).toEqual(6);
  });
  it('should be able to get index of parent item in array', async () => {
    const { createParser } = initializeParser();

    const parser = createParser({
      rootValue: 'number',
      items: {
        '@array': true,
        title: 'string',
        metadata: {
          indexTimesThree: ({ index }) => {
            return index !== undefined ? index * 3 : undefined;
          },
        },
      },
    });

    expect(parser).toBeTruthy();

    const originalData = {
      rootValue: 123,
      items: [
        { title: 'hello', metadata: {} },
        { title: 'world', metadata: {} },
        { title: '!', metadata: {} },
      ],
    };
    const res = await parser(originalData);
    expect(res).toBeTruthy();
    expect(res.rootValue).toEqual(123);
    if (!res.items || !Array.isArray(res.items)) throw new Error('Items is not an array');
    const [firstItem, secondItem, thirdItem] = res.items;
    expect(firstItem).toBeTruthy();
    expect(firstItem.title).toEqual('hello');
    expect(firstItem.metadata?.indexTimesThree).toEqual(0);

    expect(secondItem).toBeTruthy();
    expect(secondItem.title).toEqual('world');
    expect(secondItem.metadata?.indexTimesThree).toEqual(3);

    expect(thirdItem).toBeTruthy();
    expect(thirdItem.title).toEqual('!');
    expect(thirdItem.metadata?.indexTimesThree).toEqual(6);
  });
  it('should be able to able to override index in nested array', async () => {
    const { createParser } = initializeParser();

    const parser = createParser({
      rootValue: 'number',
      items: {
        '@array': true,
        title: 'string',
        metadata: {
          '@array': true,
          indexTimesThree: ({ index }) => {
            return index !== undefined ? index * 3 : undefined;
          },
        },
      },
    });

    expect(parser).toBeTruthy();

    const originalData = {
      rootValue: 123,
      items: [
        { title: 'hello', metadata: [{}, {}] },
        { title: 'world', metadata: [{}, {}] },
        { title: '!', metadata: [{}, {}] },
      ],
    };
    const res = await parser(originalData);
    expect(res).toBeTruthy();
    expect(res.rootValue).toEqual(123);
    if (!res.items || !Array.isArray(res.items)) throw new Error('Items is not an array');
    const [firstItem, secondItem, thirdItem] = res.items;
    expect(firstItem).toBeTruthy();
    expect(firstItem.title).toEqual('hello');
    expect(firstItem.metadata?.[0]?.indexTimesThree).toEqual(0);
    expect(firstItem.metadata?.[1]?.indexTimesThree).toEqual(3);

    expect(secondItem).toBeTruthy();
    expect(secondItem.title).toEqual('world');
    expect(secondItem.metadata?.[0]?.indexTimesThree).toEqual(0);
    expect(secondItem.metadata?.[1]?.indexTimesThree).toEqual(3);

    expect(thirdItem).toBeTruthy();
    expect(thirdItem.title).toEqual('!');
    expect(thirdItem.metadata?.[0]?.indexTimesThree).toEqual(0);
    expect(thirdItem.metadata?.[1]?.indexTimesThree).toEqual(3);
  });
});
