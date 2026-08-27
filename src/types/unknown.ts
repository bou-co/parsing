import type { ParserContext } from '../parser-types';
import { TypeToken, defineType } from '../type-token';

/** `unknown` — pure pass-through, typed `unknown` */
export class UnknownType extends TypeToken<unknown> {
  static readonly family: string = 'unknown';

  override cast(value: unknown, _context?: ParserContext): unknown {
    return value;
  }
}

export const unknown = /* @__PURE__ */ defineType(UnknownType);
