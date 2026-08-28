import type { ParserContext } from '../parser-types';
import { StringType } from './string';
import { defineType } from '../type-token';

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

/**
 * `slug` — normalises any string to an ASCII, URL-safe slug (`[a-z0-9-]`, single `-` between
 * words, none at the ends) in the most script-neutral way possible **without locale data**:
 *
 * 1. trim;
 * 2. transliterate the Latin letters NFKD cannot decompose (`ß` → `ss`, `æ` → `ae`, `ø` → `o`,
 *    `ł` → `l`, `đ` → `d`, `þ` → `th`, ...);
 * 3. NFKD normalisation and removal of every combining mark, so `Hyvää yötä` → `hyvaa yota`,
 *    `Łódź` → `lodz`, `crème brûlée` → `creme brulee`;
 * 4. lower-case;
 * 5. every run of anything outside `a-z0-9` becomes one `-`; leading/trailing `-` removed;
 * 6. nothing left → `Invalid slug`.
 *
 * Deliberate limits: non-Latin scripts (Cyrillic, Greek, CJK, Arabic, ...) have no ASCII form
 * and are dropped — a value made only of them **fails** rather than turning into `-`; and locale
 * conventions (`ä` → `ae` in German, `&` → `and`, a Cyrillic romanisation) are not applied. Those
 * are a pre-step composed in front: `types.string.replace(/ä/g, 'ae').to(types.slug)` or
 * `types.string.extend(transliterate).to(types.slug)` keeps the `slug` family; `types.slug.extend(fn)`
 * post-processes; `types.pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)` only validates.
 */
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
    if (!slug) throw new Error('Invalid slug (no URL-safe characters left — non-Latin scripts need a transliteration step)');
    return slug;
  }
}

export const slug = /* @__PURE__ */ defineType(SlugType);
