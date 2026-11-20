/* eslint-disable @typescript-eslint/no-explicit-any */

/** Loads its peer package lazily and turns a missing peer into an error naming the package to install */
export interface SanitiserAdapter<Options = unknown> {
  readonly name: string;
  /** The npm package the adapter needs */
  readonly package: string;
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

/** Strip tags for previews and meta descriptions. Common entities are decoded, `&amp;` last so `&amp;lt;` stays `&lt;` */
export const toPlainText = (html: string): string =>
  html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr|blockquote|pre)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
