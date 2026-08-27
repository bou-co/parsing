import type { ParserContext } from '../../parser-types';
import { string, StringType } from '../string';
import { toPlainText, type MarkdownAdapter, type SanitiserAdapter } from './adapters';

/**
 * `markdown(parser, sanitiser, options?)` — Markdown rendered to HTML and **always** sanitised on the
 * way out (Markdown permits raw HTML, so an unsanitised render is an XSS hole). `.plain` strips to
 * text for meta descriptions and previews.
 */
export class MarkdownType<ParserOptions = unknown, SanitiseOptions = unknown> extends StringType {
  static override readonly family: string = 'markdown';

  override async cast(value: unknown, context?: ParserContext): Promise<string | undefined> {
    const text = await super.cast(value, context);
    if (text === undefined) return undefined;
    const { parser, sanitiser, parserOptions, sanitiseOptions } = this._state.options as {
      parser: MarkdownAdapter<ParserOptions>;
      sanitiser: SanitiserAdapter<SanitiseOptions>;
      parserOptions?: ParserOptions;
      sanitiseOptions?: SanitiseOptions;
    };
    const [parserLibrary, sanitiserLibrary] = await Promise.all([parser.load(), sanitiser.load()]);
    const rendered = await parser.render(parserLibrary, text, parserOptions);
    return sanitiser.sanitize(sanitiserLibrary, rendered, sanitiseOptions);
  }

  get plain(): StringType {
    return this.derive('plain', (value) => toPlainText(value)).to(string);
  }
}

export interface MarkdownOptions<ParserOptions, SanitiseOptions> {
  parser?: ParserOptions;
  sanitiser?: SanitiseOptions;
}

export const markdown = <ParserOptions, SanitiseOptions>(
  parser: MarkdownAdapter<ParserOptions>,
  sanitiser: SanitiserAdapter<SanitiseOptions>,
  options?: MarkdownOptions<ParserOptions, SanitiseOptions>,
): MarkdownType<ParserOptions, SanitiseOptions> => {
  if (!parser || typeof parser.load !== 'function') throw new Error('[@bou-co/parsing] markdown(): a Markdown adapter is required (markedAdapter())');
  if (!sanitiser || typeof sanitiser.load !== 'function')
    throw new Error('[@bou-co/parsing] markdown(): a sanitiser adapter is required — Markdown output is always sanitised');
  const token = new MarkdownType<ParserOptions, SanitiseOptions>({ name: `markdown(${parser.name}, ${sanitiser.name})` });
  Object.assign(token._state, { options: { parser, sanitiser, parserOptions: options?.parser, sanitiseOptions: options?.sanitiser } });
  parser.load().catch(() => undefined);
  sanitiser.load().catch(() => undefined);
  return token;
};
