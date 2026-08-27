import type { ParserContext } from '../parser-types';
import { CastResult, TypeToken, defineType } from '../type-token';
import { invalid } from './internal';

/** `boolean` — booleans pass through; `1`/`0` and `'true'`/`'false'` (case-insensitive) are coerced */
export class BooleanType extends TypeToken<boolean> {
  static readonly family: string = 'boolean';

  override cast(value: unknown, _context?: ParserContext): CastResult<boolean> {
    if (typeof value === 'boolean') return value;
    if (value === 1) return true;
    if (value === 0) return false;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true') return true;
      if (normalized === 'false') return false;
    }
    throw invalid('boolean');
  }
}

export const boolean = /* @__PURE__ */ defineType(BooleanType);
