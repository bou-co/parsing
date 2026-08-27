import type { ParserContext } from '../parser-types';
import { StringType } from './string';
import { defineType } from '../type-token';

/**
 * `text` — `string` plus CMS tidying: trimmed, whitespace collapsed to single spaces, and an
 * empty result treated as missing (so `.default()` fires and the key is otherwise omitted).
 * Inherits every `string` accessor.
 */
export class TextType extends StringType {
  static override readonly family: string = 'text';

  override async cast(value: unknown, context?: ParserContext): Promise<string | undefined> {
    const text = await super.cast(value, context);
    if (text === undefined) return undefined;
    const tidy = text.trim().replace(/\s+/g, ' ');
    return tidy === '' ? undefined : tidy;
  }
}

export const text = /* @__PURE__ */ defineType(TextType);
