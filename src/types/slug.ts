import type { ParserContext } from '../parser-types';
import { StringType } from './string';
import { defineType } from '../type-token';

/** `slug` — normalised to a URL-safe form: diacritics stripped, lower-cased, runs of anything else become `-`. Fails when nothing is left */
export class SlugType extends StringType {
  static override readonly family: string = 'slug';

  override async cast(value: unknown, context?: ParserContext): Promise<string | undefined> {
    const text = await super.cast(value, context);
    if (text === undefined) return undefined;
    const slug = text
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (!slug) throw new Error('Invalid slug (no URL-safe characters)');
    return slug;
  }
}

export const slug = /* @__PURE__ */ defineType(SlugType);
