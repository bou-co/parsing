import type { MarkedOptions } from 'marked';
import { createLoader, type MarkdownAdapter } from './adapters';

/** `marked` — the smallest, fastest mainstream Markdown parser, pure JavaScript, edge-friendly. Output must still be sanitised; the `markdown` type always does */
export const markedAdapter = (options?: MarkedOptions): MarkdownAdapter<MarkedOptions> => ({
  name: 'marked',
  package: 'marked',
  load: createLoader('marked', 'markdown', () => import('marked')),
  render: async (library, markdown, extra) => {
    const { marked } = library as typeof import('marked');
    return marked.parse(markdown, { ...options, ...extra, async: false }) as string;
  },
});
