/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Content types adapt to an established sanitiser instead of implementing one. An adapter loads
 * its peer package lazily (so importing nothing else ever resolves it) and turns a missing peer
 * into an actionable error naming the package to install.
 */
export interface SanitiserAdapter<Options = unknown> {
  readonly name: string;
  /** The npm package the adapter needs */
  readonly package: string;
  /** Load the library (memoised); rejects with an actionable error when the package is missing */
  load(): Promise<unknown>;
  sanitize(library: any, html: string, options?: Options): string | Promise<string>;
}

export interface MarkdownAdapter<Options = unknown> {
  readonly name: string;
  readonly package: string;
  load(): Promise<unknown>;
  render(library: any, markdown: string, options?: Options): string | Promise<string>;
}

export const createLoader = (pkg: string, typeName: string, importer: () => Promise<unknown>): (() => Promise<unknown>) => {
  let promise: Promise<unknown> | undefined;
  return () =>
    (promise ??= importer().catch((error: unknown) => {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`[@bou-co/parsing] The "${typeName}" type needs the "${pkg}" package — install it with \`npm i ${pkg}\` (${reason})`);
    }));
};

/** Strip tags for previews and meta descriptions; entities for the common cases are decoded */
export const toPlainText = (html: string): string =>
  html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr|blockquote|pre)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
