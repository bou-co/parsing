import type { ParserContext } from '../parser-types';
import { CastResult, TypeToken, defineType } from '../type-token';
import { invalid } from './internal';

/** A string is `JSON.parse`d, anything else passes through. Compose an inner type with `.of(inner)` for a real output type */
export class JsonType extends TypeToken<unknown> {
  static readonly family: string = 'json';

  override cast(value: unknown, _context?: ParserContext): CastResult<unknown> {
    if (typeof value !== 'string') return value;
    try {
      return JSON.parse(value);
    } catch {
      throw invalid('json');
    }
  }

  /** Decode, then cast with `inner`. The result keeps `inner`'s family and accessors */
  of<T extends TypeToken>(inner: T): T {
    return this.to(inner);
  }
}

export const json = /* @__PURE__ */ defineType(JsonType);
