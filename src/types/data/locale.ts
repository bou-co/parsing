import type { ParserContext } from '../../parser-types';
import { CastResult, TypeToken, defineType } from '../../type-token';
import { invalid } from '../internal';
import { string, StringType } from '../string';

/** A BCP 47 tag canonicalised through `Intl` (`en_us` → `en-US`) */
export class LocaleType extends TypeToken<string> {
  static readonly family: string = 'locale';

  override cast(value: unknown, _context?: ParserContext): CastResult<string> {
    if (typeof value !== 'string') throw invalid('locale');
    try {
      return new Intl.Locale(value.trim().replace(/_/g, '-')).toString();
    } catch {
      throw invalid('locale');
    }
  }

  get language(): StringType {
    return this.derive('language', (value) => new Intl.Locale(value).language).to(string);
  }

  /** Missing when the tag has no region */
  get region(): StringType {
    return this.derive('region', (value) => new Intl.Locale(value).region).to(string);
  }
}

export const locale = /* @__PURE__ */ defineType(LocaleType);
