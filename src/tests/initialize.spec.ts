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
      return { variableTitle };
    });
    const parser2 = createParserFromFunction({ value: '{{variableTitle}}' });
    expect(parser2).toBeTruthy();
    const data2 = await parser2({});
    expect(data2).toBeTruthy();
    expect(data2.value).toEqual(variableTitle);

    const { createParser: createParserFromObject } = initializeParser({ variableTitle });
    const parser3 = createParserFromObject({ value: '{{variableTitle}}' });
    expect(parser3).toBeTruthy();
    const data3 = await parser3({});
    expect(data3).toBeTruthy();
    expect(data3.value).toEqual(variableTitle);
  });
});
