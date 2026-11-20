import { parseExpression, parseLiteral } from '../parser-expression';

describe('expression grammar', () => {
  it('splits alternatives, pipes and params', () => {
    expect(parseExpression('a || b | up | pad:2:"x" || "c"')).toEqual({
      alternatives: [
        { candidate: 'a', pipes: [] },
        {
          candidate: 'b',
          pipes: [
            { name: 'up', params: [] },
            { name: 'pad', params: ['2', '"x"'] },
          ],
        },
        { candidate: '"c"', pipes: [] },
      ],
    });
  });

  it('keeps quoted literals intact — colons, pipes and single quotes inside', () => {
    expect(parseExpression(`when | formatDate:"MMM d 'at' HH:mm":"Europe/Helsinki" || "a || b | c"`)).toEqual({
      alternatives: [
        { candidate: 'when', pipes: [{ name: 'formatDate', params: [`"MMM d 'at' HH:mm"`, '"Europe/Helsinki"'] }] },
        { candidate: '"a || b | c"', pipes: [] },
      ],
    });
  });

  it('supports escaped quotes and the empty string', () => {
    expect(parseExpression('tags | join:""')).toEqual({ alternatives: [{ candidate: 'tags', pipes: [{ name: 'join', params: ['""'] }] }] });
    expect(parseLiteral('""')).toEqual({ literal: true, value: '' });
    expect(parseLiteral('"say \\"hi\\""')).toEqual({ literal: true, value: 'say "hi"' });
  });

  it('parses number, boolean, null and undefined literals', () => {
    expect(parseLiteral('42')).toEqual({ literal: true, value: 42 });
    expect(parseLiteral('-1.5')).toEqual({ literal: true, value: -1.5 });
    expect(parseLiteral('true')).toEqual({ literal: true, value: true });
    expect(parseLiteral('null')).toEqual({ literal: true, value: null });
    expect(parseLiteral('undefined')).toEqual({ literal: true, value: undefined });
    expect(parseLiteral('user.name')).toEqual({ literal: false });
    expect(parseLiteral('1.5.2')).toEqual({ literal: false });
  });
});
