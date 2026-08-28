import type { ParserContext } from '../parser-types';
import type { TypeToken } from '../type-token';
import { defineType } from '../type-token';
import { string, StringType } from './string';

/**
 * `url` — `new URL()` semantics, normalised to `href`. Absolute URLs only: `/about` fails like it
 * does on the platform. For relative link fields use `.base('https://site.com')`, which mirrors
 * `new URL(value, base)`. Parts use the platform's names (`pathname`, not `path`).
 */
export class UrlType extends StringType {
  static override readonly family: string = 'url';

  override async cast(value: unknown, context?: ParserContext): Promise<string | undefined> {
    const text = await super.cast(value, context);
    if (text === undefined) return undefined;
    const base = this._state.options?.['base'] as string | undefined;
    try {
      return new URL(text.trim(), base).href;
    } catch {
      throw new Error(base ? `Invalid URL (relative to ${base})` : 'Invalid URL (absolute URLs only — use .base() for relative links)');
    }
  }

  /** Resolve relative values against `base`, exactly like `new URL(value, base)` */
  base(base: string): this {
    return this.memo(`base:${base}`, () => this.clone({ options: { base }, name: `${this.name}.base(${base})` }));
  }

  get protocol(): StringType {
    return this.derive('protocol', (value) => new URL(value).protocol).to(string);
  }

  get origin(): StringType {
    return this.derive('origin', (value) => new URL(value).origin).to(string);
  }

  get host(): StringType {
    return this.derive('host', (value) => new URL(value).host).to(string);
  }

  get hostname(): StringType {
    return this.derive('hostname', (value) => new URL(value).hostname).to(string);
  }

  get port(): StringType {
    return this.derive('port', (value) => new URL(value).port).to(string);
  }

  get pathname(): StringType {
    return this.derive('pathname', (value) => new URL(value).pathname).to(string);
  }

  /** The query string including the leading `?` (empty when there is none) */
  get search(): StringType {
    return this.derive('search', (value) => new URL(value).search).to(string);
  }

  /** Search parameters as a plain object — a repeated key keeps its last value */
  get params(): TypeToken<Record<string, string>> {
    return this.derive('params', (value) => Object.fromEntries(new URL(value).searchParams));
  }

  get hash(): StringType {
    return this.derive('hash', (value) => new URL(value).hash).to(string);
  }
}

export const url = /* @__PURE__ */ defineType(UrlType);
