import type { ParserContext } from '../parser-types';
import { CastResult, TypeToken, defineType } from '../type-token';
import type { ArrayType } from './array';
import { array } from './array';
import { capitalizeWord, invalid, splitWords } from './internal';

/**
 * `string` — strings pass through; finite numbers, booleans and valid dates (ISO) are coerced.
 * Every string-based type (`text`, `email`, `slug`, ... and anything built on `string`) inherits
 * the whole accessor surface below.
 */
export class StringType extends TypeToken<string> {
  static readonly family: string = 'string';

  override cast(value: unknown, _context?: ParserContext): CastResult<string> {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    if (typeof value === 'boolean') return String(value);
    if (value instanceof Date && !isNaN(value.getTime())) return value.toISOString();
    throw invalid('string');
  }

  // Transforms — same type, different form

  get upperCase(): this {
    return this.transform('upperCase', (value) => value.toUpperCase());
  }

  get lowerCase(): this {
    return this.transform('lowerCase', (value) => value.toLowerCase());
  }

  /** First character upper-cased, the rest untouched */
  get capitalize(): this {
    return this.transform('capitalize', (value) => capitalizeWord(value));
  }

  /** First character of every word upper-cased, the rest untouched */
  get titleCase(): this {
    return this.transform('titleCase', (value) => value.replace(/\S+/g, capitalizeWord));
  }

  get camel(): this {
    return this.transform('camel', (value) =>
      splitWords(value)
        .map((word, index) => (index ? capitalizeWord(word.toLowerCase()) : word.toLowerCase()))
        .join(''),
    );
  }

  get pascal(): this {
    return this.transform('pascal', (value) =>
      splitWords(value)
        .map((word) => capitalizeWord(word.toLowerCase()))
        .join(''),
    );
  }

  get kebab(): this {
    return this.transform('kebab', (value) =>
      splitWords(value)
        .map((word) => word.toLowerCase())
        .join('-'),
    );
  }

  get snake(): this {
    return this.transform('snake', (value) =>
      splitWords(value)
        .map((word) => word.toLowerCase())
        .join('_'),
    );
  }

  get trim(): this {
    return this.transform('trim', (value) => value.trim());
  }

  /** Cut to `length` characters. With `ellipsis` (default) the result ends in `…` and stays within `length` */
  truncate(length: number, ellipsis = true): this {
    return this.transform(
      'truncate',
      (value) => (value.length > length ? (ellipsis ? `${value.slice(0, Math.max(0, length - 1))}…` : value.slice(0, length)) : value),
      [length, ellipsis],
    );
  }

  replace(search: string | RegExp, replacement: string): this {
    return this.transform('replace', (value) => value.replace(search, replacement), [search, replacement]);
  }

  // Derivations — a different type

  override get length(): TypeToken<number> {
    return this.derive('length', (value) => value.length);
  }

  split(separator: string | RegExp): ArrayType<string> {
    return this.derive('split', (value) => value.split(separator), [separator]).to(array.of(string));
  }
}

export const string = /* @__PURE__ */ defineType(StringType);
