import type { ParserContext } from '../parser-types';
import { defineType } from '../type-token';
import { invalid } from './internal';
import { string, StringType } from './string';

const EXTENSION = /\s*(?:ext\.?|extension|x|#)\s*(\d{1,7})$/i;
const MAIN = /^\+?[\d\s().\/-]+$/;

interface TelParts {
  /** The number without its extension, as written */
  main: string;
  /** `+` when the number was written with one */
  plus: string;
  digits: string;
  extension?: string;
}

// Shared by the cast and every accessor so they can never disagree on what a number is
const parseTel = (value: string): TelParts => {
  const trimmed = value.trim();
  const extensionMatch = trimmed.match(EXTENSION);
  let main = extensionMatch ? trimmed.slice(0, extensionMatch.index).trim() : trimmed;
  if (!MAIN.test(main)) throw invalid('tel', 'digits with spaces, dashes, dots, slashes, parentheses, an optional leading + and an optional extension');
  // `+358 (0)40 …`: a parenthesised trunk prefix after a country code is not dialled internationally
  if (main.startsWith('+')) main = main.replace(/\(0\)/, '');
  const digits = main.replace(/\D/g, '');
  if (digits.length < 3 || digits.length > 15) throw invalid('tel', '3–15 digits');
  return { main, plus: main.startsWith('+') ? '+' : '', digits, extension: extensionMatch?.[1] };
};

/** Phone number kept as written (trimmed): 3–15 digits, optional `+` and extension. Not country-aware */
export class TelType extends StringType {
  static override readonly family: string = 'tel';

  override async cast(value: unknown, context?: ParserContext): Promise<string | undefined> {
    const text = await super.cast(value, context);
    if (text === undefined) return undefined;
    parseTel(text);
    return text.trim();
  }

  /** Digits only, `+` kept when written, extension dropped. Still a `tel` */
  get normalized(): this {
    return this.transform('normalized', (value) => {
      const { plus, digits } = parseTel(value);
      return `${plus}${digits}`;
    });
  }

  /** RFC 3966 `tel:` link target, extension as `;ext=` */
  get href(): StringType {
    return this.derive('href', (value) => {
      const { plus, digits, extension } = parseTel(value);
      return `tel:${plus}${digits}${extension ? `;ext=${extension}` : ''}`;
    }).to(string);
  }

  /** The extension digits, missing when the number has none */
  get extension(): StringType {
    return this.derive('extension', (value) => parseTel(value).extension).to(string);
  }
}

export const tel = /* @__PURE__ */ defineType(TelType);
