import type { ParserContext } from '../parser-types';
import { defineType } from '../type-token';
import { invalid } from './internal';
import { StringType } from './string';

// Latin letters that NFKD cannot decompose into a base letter + combining mark
const TRANSLITERATIONS: Record<string, string> = {
  ß: 'ss',
  ẞ: 'ss',
  æ: 'ae',
  Æ: 'ae',
  œ: 'oe',
  Œ: 'oe',
  ø: 'o',
  Ø: 'o',
  đ: 'd',
  Đ: 'd',
  ð: 'd',
  Ð: 'd',
  þ: 'th',
  Þ: 'th',
  ł: 'l',
  Ł: 'l',
  ħ: 'h',
  Ħ: 'h',
  ŧ: 't',
  Ŧ: 't',
  ŋ: 'n',
  Ŋ: 'n',
  ı: 'i',
  ĸ: 'k',
};

const TRANSLITERABLE = new RegExp(`[${Object.keys(TRANSLITERATIONS).join('')}]`, 'g');

/** ASCII URL-safe slug (`[a-z0-9-]`) without locale data. Non-Latin scripts have no ASCII form, so a value made only of them fails */
export class SlugType extends StringType {
  static override readonly family: string = 'slug';

  override async cast(value: unknown, context?: ParserContext): Promise<string | undefined> {
    const text = await super.cast(value, context);
    if (text === undefined) return undefined;
    const slug = text
      .trim()
      .replace(TRANSLITERABLE, (letter) => TRANSLITERATIONS[letter])
      .normalize('NFKD')
      .replace(/\p{M}+/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (!slug) throw invalid('slug', 'no URL-safe characters left, non-Latin scripts need a transliteration step');
    return slug;
  }
}

export const slug = /* @__PURE__ */ defineType(SlugType);
