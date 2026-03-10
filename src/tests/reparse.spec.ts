import { initializeParser, ParserContext } from '../parser';

describe('parsing', () => {
  it('should be able to parse data that was already parsed', async () => {
    const { createParser } = initializeParser();

    const parser = createParser({ value: 'number', text: 'string' });
    expect(parser).toBeTruthy();
    const secondParser = createParser({ value: ({ data: { value } }) => value * 2 });

    const originalData = { value: 123, text: 'hello' };
    const res = await parser(originalData);
    expect(res).toBeTruthy();
    expect(res.value).toEqual(123);
    expect(res.text).toEqual('hello');

    const res2 = await secondParser(res);
    expect(res2).toBeTruthy();
    expect(res2.value).toEqual(246);

    const newData = { value: 456, text: 'world' };
    const res3 = await parser(newData);
    expect(res3).toBeTruthy();
    expect(res3.value).toEqual(456);
    expect(res3.text).toEqual('world');

    const res4 = await secondParser(res3);
    expect(res4).toBeTruthy();
    expect(res4.value).toEqual(912);
  });

  it('should be able to reparse data that was already parsed with a function', async () => {
    const { createParser } = initializeParser();

    const handleItems = ({ data }: ParserContext<any>) => {
      if (!data.items || !Array.isArray(data.items)) return [];
      return data.items.map((item: any) => item * 2);
    };

    const parser = createParser({ items: 'array' });
    expect(parser).toBeTruthy();
    const secondParser = createParser({ items: handleItems });

    const res = await parser({ items: [1, 2, 3] });
    expect(res).toBeTruthy();
    expect(res.items).toEqual([1, 2, 3]);

    const res2 = await secondParser(res);
    expect(res2).toBeTruthy();
    expect(res2.items).toEqual([2, 4, 6]);
  });

  it('should be able to reparse data that has been nested', async () => {
    const { createParser } = initializeParser();

    const nestedData = { inner: { value: 100 } };
    const parser = createParser({ inner: { value: 'number' } });
    expect(parser).toBeTruthy();
    const secondParser = createParser({ inner: { value: ({ data: { value } }) => value * 3 } });

    const res = await parser(nestedData);
    expect(res).toBeTruthy();
    expect(res.inner?.value).toEqual(100);

    const res2 = await secondParser(res);
    expect(res2).toBeTruthy();
    expect(res2.inner?.value).toEqual(300);

    const newNestedData = { inner: { value: 200 } };
    const res3 = await parser(newNestedData);
    expect(res3).toBeTruthy();
    expect(res3.inner?.value).toEqual(200);

    const res4 = await secondParser(res3);
    expect(res4).toBeTruthy();
    expect(res4.inner?.value).toEqual(600);
  });

  it('should be able to reparse data that has been nested and parsed within a function', async () => {
    const { createParser } = initializeParser();

    const nestedData = { inner: { deeper: { value: 100 } } };

    const deeperParser = createParser({ value: ({ data: { value } }) => value * 3 });

    const handleInner = ({ data }: ParserContext<any>) => {
      if (!data.inner) return null;
      return deeperParser(data.inner.deeper);
    };

    const parser = createParser({ inner: ({ data }) => data['inner'] });
    expect(parser).toBeTruthy();

    const res = await parser(nestedData);
    expect(res).toBeTruthy();
    expect(res.inner?.deeper?.value).toEqual(100);

    const secondParser = createParser({ inner: handleInner });

    const res2 = await secondParser(res);
    expect(res2).toBeTruthy();
    expect(res2.inner?.value).toEqual(300);
  });
});
