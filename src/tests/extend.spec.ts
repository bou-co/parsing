import { initializeParser } from '../parser';

describe('parsing', () => {
  it('should be able to extend a parser projection', async () => {
    const { createParser } = initializeParser();
    const original = createParser({ value: 'number' });
    const extended = original.extend({ additional: 'string' });
    expect(original).toBeTruthy();
    expect(extended).toBeTruthy();

    const originalRes = await original({ value: 123 });
    expect(originalRes).toBeTruthy();
    expect(originalRes).toEqual({ value: 123 });

    const extendedRes = await extended({ value: 456, additional: 'test' });
    expect(extendedRes).toBeTruthy();
    expect(extendedRes).toEqual({ value: 456, additional: 'test' });
  });

  it('should throw error when extending a function projection', async () => {
    const { createParser } = initializeParser();
    const original = createParser(() => ({ value: 'number' }));

    expect(() => {
      original.extend({ additional: 'string' });
    }).toThrow('Cannot extend a projection that is a function');
  });

  it('should allow extending a parser projection with projction that overrides existing keys', async () => {
    const { createParser } = initializeParser();
    const original = createParser({ value: 'number', metadata: 'original' });
    const extended = original.extend({ metadata: 'extended' });
    expect(original).toBeTruthy();
    expect(extended).toBeTruthy();

    const originalRes = await original({ value: 123 });
    expect(originalRes).toBeTruthy();
    expect(originalRes).toEqual({ value: 123, metadata: 'original' });

    const extendedRes = await extended({ value: 456 });
    expect(extendedRes).toBeTruthy();
    expect(extendedRes).toEqual({ value: 456, metadata: 'extended' });
  });
});
