import { CacheLike, initializeParser, ParserContext } from '../parser';

class TestCache implements CacheLike {
  generateKey = (parserKey: string, dataHash: string, context: ParserContext) => {
    return `${parserKey}-${dataHash}`;
  };
  values: Record<string, any> = {};
  match = async (key: string) => this.values[key];
  add = async (key: string, value: any) => {
    this.values[key] = value;
  };
  clear = async () => {
    this.values = {};
  };
}

const { createCached } = initializeParser({
  cache: new TestCache(),
});

describe('parsing', () => {
  it('should be able basic variable resolution', async () => {
    const parser = createCached('cache-test-1', {
      title: async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return 'Hello World';
      },
      description: 'string',
    });
    const timeStart = Date.now();
    const data = await parser({ description: 'Lorem ipsum' });
    const timeEnd = Date.now();
    console.log('Time taken:', `${timeEnd - timeStart}ms (expected: ~100ms)`);
    expect(timeEnd - timeStart).toBeGreaterThanOrEqual(100);
    expect(timeEnd - timeStart).toBeLessThan(200);
    expect(data).toBeTruthy();
    expect(data.title).toEqual('Hello World');
    expect(data.description).toEqual('Lorem ipsum');

    const secondTimeStart = Date.now();
    const secondData = await parser({ description: 'Lorem ipsum' });
    const secondTimeEnd = Date.now();
    console.log('Time taken for second call:', `${secondTimeEnd - secondTimeStart}ms (expected: <10ms)`);
    expect(secondTimeEnd - secondTimeStart).toBeLessThan(20);
    expect(secondData).toBeTruthy();
    expect(secondData.title).toEqual('Hello World');
    expect(secondData.description).toEqual('Lorem ipsum');
  });
});
