import type { ParserContext } from '../parser-types';
import { string, StringType } from './string';
import { defineType } from '../type-token';

/**
 * `tel` — shape only, explicitly not country-aware: separators (spaces, dashes, dots, parentheses)
 * are stripped, an optional leading `+` is kept, and 7–15 digits are required (E.164 length).
 * `+358 (0)40-123 4567` → `+358040123456`; anything that needs a country plan is out of scope.
 */
export class TelType extends StringType {
  static override readonly family: string = 'tel';

  override async cast(value: unknown, context?: ParserContext): Promise<string | undefined> {
    const text = await super.cast(value, context);
    if (text === undefined) return undefined;
    const trimmed = text.trim();
    const plus = trimmed.startsWith('+') ? '+' : '';
    const digits = trimmed.replace(/[\s().-]/g, '').replace(/^\+/, '');
    if (!/^\d{7,15}$/.test(digits)) throw new Error('Invalid phone number (7–15 digits, optional leading +)');
    return `${plus}${digits}`;
  }

  /** `tel:` link target */
  get href(): StringType {
    return this.derive('href', (value) => `tel:${value}`).to(string);
  }
}

export const tel = /* @__PURE__ */ defineType(TelType);
