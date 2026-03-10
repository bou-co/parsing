import { initializeParser } from '../parser';

describe('parsing', () => {
  it('should work with basic projection as input for create parser', async () => {
    const { createParser } = initializeParser();
    const parser = createParser({ value: 'number' });
    expect(parser).toBeTruthy();

    const res = await parser({ value: 123 });
    expect(res).toBeTruthy();
    expect(res.value).toEqual(123);
  });

  it('should work with syncronous function that returns a projection as input for create parser', async () => {
    const { createParser } = initializeParser();
    const parser = createParser(() => {
      return { value: 'number' };
    });
    expect(parser).toBeTruthy();

    const res = await parser({ value: 123 });
    expect(res).toBeTruthy();
    expect(res.value).toEqual(123);
  });

  it('should work with asyncronous function that returns a projection as input for create parser', async () => {
    const { createParser } = initializeParser();
    const parser = createParser(async () => {
      return { value: 'number' };
    });
    expect(parser).toBeTruthy();

    const res = await parser({ value: 123 });
    expect(res).toBeTruthy();
    expect(res.value).toEqual(123);
  });

  it('should work with function that returns a projection based on data provided', async () => {
    const { createParser } = initializeParser();
    const parser = createParser(({ data }) => {
      if (data['addMetadata']) {
        return { value: 'number', metadata: 'added' };
      }
      return { value: 'number' };
    });
    expect(parser).toBeTruthy();

    const res = await parser({ value: 123 });
    expect(res).toBeTruthy();
    expect(res.value).toEqual(123);
    expect(res.metadata).toBeUndefined();

    const withMetadata = await parser({ value: 123, addMetadata: true });
    expect(withMetadata).toBeTruthy();
    expect(withMetadata.value).toEqual(123);
    expect(withMetadata.metadata).toEqual('added');
  });
});
