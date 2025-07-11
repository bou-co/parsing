import { StorageLike, CachingParserContext, initializeParser, ParserContext } from '../parser';
import { toHash } from '../to-hash';

declare module '../expandable-types' {
  export interface ParserCachingOptions {
    name?: string;
    globalPrefix?: string;
  }
}

class TestCache implements StorageLike {
  generateKey = ({ data, projection, cache: cachingOptions }: CachingParserContext) => {
    if (!cachingOptions.globalPrefix) throw new Error('Caching options must have a global prefix defined');
    if (!cachingOptions.name) throw new Error('Caching options must have a name defined');
    const projectionHash = toHash(projection);
    const dataHash = toHash(data);
    return `${cachingOptions.name}-${projectionHash}-${dataHash}`;
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

const { createParser } = initializeParser({
  storage: new TestCache(),
  cache: {
    enabled: true,
    globalPrefix: 'global-prefix',
  },
});

describe('parsing', () => {
  it('should be able basic variable resolution', async () => {
    const parser = createParser(
      {
        title: async () => {
          await new Promise((resolve) => setTimeout(resolve, 100));
          return 'Hello World';
        },
        description: 'string',
      },
      {
        cache: { name: 'test-cache' },
      },
    );
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

  it('should fail if caching options are not defined', async () => {
    const parser = createParser({
      description: 'string',
    });

    await expect(parser({ description: 'Lorem ipsum' })).rejects.toThrow('Caching options must have a name defined');
  });

  it('should be able to disable/enable caching for specific parsers or instances', async () => {
    const parser = createParser(
      {
        title: async () => {
          await new Promise((resolve) => setTimeout(resolve, 100));
          return 'Hello World';
        },
        description: 'string',
      },
      {
        cache: { enabled: false, name: 'test-cache' },
      },
    );
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
    console.log('Time taken for second call:', `${secondTimeEnd - secondTimeStart}ms (expected: ~100ms)`);
    expect(secondTimeEnd - secondTimeStart).toBeGreaterThanOrEqual(100);
    expect(secondTimeEnd - secondTimeStart).toBeLessThan(200);
    expect(secondData).toBeTruthy();
    expect(secondData.title).toEqual('Hello World');
    expect(secondData.description).toEqual('Lorem ipsum');

    const thirdTimeStart = Date.now();
    const thirdData = await parser({ description: 'Lorem ipsum' }, { cache: { enabled: true } });
    const thirdTimeEnd = Date.now();
    console.log('Time taken for third call:', `${thirdTimeEnd - thirdTimeStart}ms (expected: <10ms)`);
    expect(thirdTimeEnd - thirdTimeStart).toBeLessThan(20);
    expect(thirdData).toBeTruthy();
    expect(thirdData.title).toEqual('Hello World');
    expect(thirdData.description).toEqual('Lorem ipsum');
  });
});
