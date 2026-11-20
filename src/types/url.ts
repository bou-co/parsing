import type { ParserContext } from '../parser-types';
import type { Carry, TypeToken } from '../type-token';
import { defineType } from '../type-token';
import { invalid } from './internal';
import { string, StringType } from './string';

/** `new URL()` semantics normalised to `href`. Absolute URLs only unless `.base()` is set */
export class UrlType extends StringType {
  static override readonly family: string = 'url';

  override async cast(value: unknown, context?: ParserContext): Promise<string | undefined> {
    const text = await super.cast(value, context);
    if (text === undefined) return undefined;
    const { baseUrl } = this;
    try {
      return new URL(text.trim(), baseUrl).href;
    } catch {
      throw invalid('url', baseUrl ? `relative to ${baseUrl}` : 'absolute URLs only, use .base() for relative links');
    }
  }

  get baseUrl(): string | undefined {
    return this._state.options?.['base'] as string | undefined;
  }

  /** Resolve relative values against `base`, exactly like `new URL(value, base)` */
  base(base: string): this {
    return this.memo(`base:${base}`, () => this.clone({ options: { base }, name: `${this.name}.base(${base})` }));
  }

  get protocol(): Carry<this, StringType> {
    return this.derive('protocol', (value) => new URL(value).protocol, [], string);
  }

  get origin(): Carry<this, StringType> {
    return this.derive('origin', (value) => new URL(value).origin, [], string);
  }

  get host(): Carry<this, StringType> {
    return this.derive('host', (value) => new URL(value).host, [], string);
  }

  get hostname(): Carry<this, StringType> {
    return this.derive('hostname', (value) => new URL(value).hostname, [], string);
  }

  get port(): Carry<this, StringType> {
    return this.derive('port', (value) => new URL(value).port, [], string);
  }

  get pathname(): Carry<this, StringType> {
    return this.derive('pathname', (value) => new URL(value).pathname, [], string);
  }

  /** The query string including the leading `?` (empty when there is none) */
  get search(): Carry<this, StringType> {
    return this.derive('search', (value) => new URL(value).search, [], string);
  }

  /** Search parameters as a plain object, a repeated key keeps its last value */
  get params(): Carry<this, TypeToken<Record<string, string>>> {
    return this.derive('params', (value) => Object.fromEntries(new URL(value).searchParams));
  }

  get hash(): Carry<this, StringType> {
    return this.derive('hash', (value) => new URL(value).hash, [], string);
  }
}

export const url = /* @__PURE__ */ defineType(UrlType);
