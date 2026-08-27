import type { ParserContext } from '../parser-types';
import { string, StringType } from './string';
import { defineType } from '../type-token';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * `email` — shape validation (`local@domain.tld`), the whole address lower-cased (the local part
 * is technically case-sensitive; universally it is not treated that way). Inherits every `string`
 * accessor.
 */
export class EmailType extends StringType {
  static override readonly family: string = 'email';

  override async cast(value: unknown, context?: ParserContext): Promise<string | undefined> {
    const text = await super.cast(value, context);
    if (text === undefined) return undefined;
    const trimmed = text.trim();
    if (!EMAIL.test(trimmed)) throw new Error('Invalid email');
    return trimmed.toLowerCase();
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
