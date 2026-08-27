import type { AppObject, ParserContext } from '../parser-types';
import { CastResult, TypeToken, defineType } from '../type-token';
import { invalid } from './internal';

/** `object` — any non-array object passes through */
export class ObjectType extends TypeToken<AppObject> {
  static readonly family: string = 'object';

  override cast(value: unknown, _context?: ParserContext): CastResult<AppObject> {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) return value as AppObject;
    throw invalid('object');
  }
}

export const object = /* @__PURE__ */ defineType(ObjectType);
