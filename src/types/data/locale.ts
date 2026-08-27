import type { ParserContext } from '../../parser-types';
import { CastResult, TypeToken, defineType } from '../../type-token';
import { string, StringType } from '../string';

/** `locale` — a BCP 47 tag canonicalised through `Intl` (`en_us` → `en-US`); `.language`, `.region` decompose it */
export class LocaleType extends TypeToken<string> {
  static readonly family: string = 'locale';

  override cast(value: unknown, _context?: ParserContext): CastResult<string> {
    if (typeof value !== 'string' || !value.trim()) throw new Error('Invalid locale');
    try {
      return new Intl.Locale(value.trim().replace(/_/g, '-')).toString();
    } catch {
      throw new Error('Invalid locale');
    }
  }

  get language(): StringType {
    return this.derive('language', (value) => new Intl.Locale(value).language).to(string);
  }

  get region(): TypeToken<string | undefined> {
    return this.derive('region', (value) => new Intl.Locale(value).region);
  }
}

export const locale = /* @__PURE__ */ defineType(LocaleType);
