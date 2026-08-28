import type { ParserContext } from '../../parser-types';
import { string, StringType } from '../string';
import { toPlainText, type SanitiserAdapter } from './adapters';

/**
 * `html(adapter, options?)` — a rich-text HTML string sanitised against the adapter's allow-list.
 * Zero-config behaviour is the safe one; `options` reach the underlying sanitiser untouched.
 * `.plain` strips to text for previews and meta descriptions.
 */
export class HtmlType<Options = unknown> extends StringType {
  static override readonly family: string = 'html';

  get adapter(): SanitiserAdapter<Options> {
    return this._state.options?.['adapter'] as SanitiserAdapter<Options>;
  }

  override async cast(value: unknown, context?: ParserContext): Promise<string | undefined> {
    const text = await super.cast(value, context);
    if (text === undefined) return undefined;
    const { adapter } = this;
    const library = await adapter.load();
    return adapter.sanitize(library, text, this._state.options?.['sanitizeOptions'] as Options | undefined);
  }

  /** The sanitised content as plain text */
  get plain(): StringType {
    return this.derive('plain', (value) => toPlainText(value)).to(string);
  }
}

export const html = <Options>(adapter: SanitiserAdapter<Options>, options?: Options): HtmlType<Options> => {
  if (!adapter || typeof adapter.load !== 'function')
    throw new Error('[@bou-co/parsing] html(): a sanitiser adapter is required (sanitizeHtmlAdapter() or ultrahtmlAdapter())');
  const token = new HtmlType<Options>({ name: `html(${adapter.name})` });
  Object.assign(token._state, { options: { adapter, sanitizeOptions: options } });
  // Surface a missing peer as early as possible; the rejection is kept and rethrown at the first cast
  adapter.load().catch(() => undefined);
  return token;
};
