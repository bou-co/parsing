/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ParserContext } from '../parser-types';
import { TypeToken, defineType } from '../type-token';

/** Pure pass-through, typed `any` */
export class AnyType extends TypeToken<any> {
  static readonly family: string = 'any';

  override cast(value: unknown, _context?: ParserContext): any {
    return value;
  }
}

export const any = /* @__PURE__ */ defineType(AnyType);
