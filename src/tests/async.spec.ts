import { initializeParser } from '../parser';

describe('parsing', () => {
  it('should work with syncronous data as input', async () => {
    const { createParser, types } = initializeParser();
    const parser = createParser({ value: types.number });
    expect(parser).toBeTruthy();

    const res = await parser({ value: 123 });
    expect(res).toBeTruthy();
    expect(res.value).toEqual(123);
  });

  it('should work with promise data as input', async () => {
    const { createParser, types } = initializeParser();
    const parser = createParser({ value: types.number });
    expect(parser).toBeTruthy();
    const data = Promise.resolve({ value: 456 });
    const res = await parser(data);
    expect(res).toBeTruthy();
    expect(res.value).toEqual(456);
  });

  it('should work with promise data as variable', async () => {
    const variableValue = Promise.resolve(789);
    const { createParser, types } = initializeParser({ variables: { variableValue } });
    const parser = createParser({ value: types.number });
    expect(parser).toBeTruthy();
    const data = Promise.resolve({ value: '{{variableValue}}' });
    const res = await parser(data);
    expect(res).toBeTruthy();
    expect(res.value).toEqual(789);
  });

  it('should work with nested promise data as input', async () => {
    const { createParser, types } = initializeParser();
    const parser = createParser({ nested: { value: types.number } });
    expect(parser).toBeTruthy();
    const nested = Promise.resolve({ value: 456 });
    const data = Promise.resolve({ nested });
    const res = await parser(data);
    expect(res).toBeTruthy();
    expect(res.nested?.value).toEqual(456);
  });

  it('should work with nested promise data as input when root is syncronous', async () => {
    const { createParser, types } = initializeParser();
    const parser = createParser({ nested: { value: types.number } });
    expect(parser).toBeTruthy();
    const nested = Promise.resolve({ value: 456 });
    const data = { nested };
    const res = await parser(data);
    expect(res).toBeTruthy();
    expect(res.nested?.value).toEqual(456);
  });

  it('should work with nested promise data as variable', async () => {
    const variableValue = Promise.resolve({ value: 789 });
    const { createParser, types } = initializeParser({ variables: { variableValue } });
    const parser = createParser({ nested: { value: types.number } });
    expect(parser).toBeTruthy();
    const data = Promise.resolve({ nested: '{{variableValue}}' });
    const res = await parser(data);
    expect(res).toBeTruthy();
    expect(res.nested?.value).toEqual(789);
  });
});
