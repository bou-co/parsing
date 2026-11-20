import type { ParserContext } from '../parser-types';
import { defineType } from '../type-token';
import { invalid } from './internal';
import { string, StringType } from './string';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Shape check (`local@domain.tld`), trimmed, case kept as written since the local part is case-sensitive */
export class EmailType extends StringType {
  static override readonly family: string = 'email';

  override async cast(value: unknown, context?: ParserContext): Promise<string | undefined> {
    const text = await super.cast(value, context);
    if (text === undefined) return undefined;
    const trimmed = text.trim();
    if (!EMAIL.test(trimmed)) throw invalid('email');
    return trimmed;
  }

  /** The whole address lower-cased, still an `email` so `.normalized.domain` chains */
  get normalized(): this {
    return this.transform('normalized', (value) => value.toLowerCase());
  }

  /** `mailto:` link target */
  get href(): StringType {
    return this.derive('href', (value) => `mailto:${value}`).to(string);
  }

  /** The part before `@` */
  get local(): StringType {
    return this.derive('local', (value) => value.slice(0, value.indexOf('@'))).to(string);
  }

  /** The part after `@` */
  get domain(): StringType {
    return this.derive('domain', (value) => value.slice(value.indexOf('@') + 1)).to(string);
  }
}

export const email = /* @__PURE__ */ defineType(EmailType);
