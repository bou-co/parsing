import type { ParserContext } from '../parser-types';
import type { TypeToken } from '../type-token';
import { StringType } from './string';

/**
 * Regex match — the escape hatch for everything unnamed. The value passes through unchanged on a
 * match. When the expression has named capture groups the output is the group map instead; give
 * the group shape as a type argument: `types.pattern<{ year: string }>(/(?<year>\d{4})/)`.
 */
export class PatternType extends StringType {
  static override readonly family: string = 'pattern';

  get regex(): RegExp {
    return this._state.options?.['regex'] as RegExp;
  }

  override async cast(value: unknown, context?: ParserContext): Promise<string | undefined> {
    const text = await super.cast(value, context);
    if (text === undefined) return undefined;
    const { regex } = this;
    regex.lastIndex = 0;
    const match = regex.exec(text);
    if (!match) throw new Error(`Does not match ${regex}`);
    return (match.groups ? { ...match.groups } : text) as string;
  }
}

const createPattern = (regex: RegExp): PatternType => {
  const token = new PatternType({ name: `pattern(${regex})` });
  Object.assign(token._state, { options: { regex } });
  return token;
};

export function pattern(regex: RegExp | string, flags?: string): PatternType;
export function pattern<Groups extends Record<string, string>>(regex: RegExp | string, flags?: string): TypeToken<Groups>;
export function pattern(regex: RegExp | string, flags?: string): TypeToken {
  return createPattern(typeof regex === 'string' ? new RegExp(regex, flags) : flags ? new RegExp(regex.source, flags) : regex);
}
