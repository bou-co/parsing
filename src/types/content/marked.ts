import type { MarkedOptions } from 'marked';
import { createLoader, type MarkdownAdapter } from './adapters';

/** Adapter for `marked`. Its output is not sanitised, the `markdown` type always does that */
export const markedAdapter = (options?: MarkedOptions): MarkdownAdapter<MarkedOptions> => ({
  name: 'marked',
  package: 'marked',
  load: createLoader('marked', 'markdown', () => import('marked')),
  render: async (library, markdown, extra) => {
    const { marked } = library as typeof import('marked');
    return marked.parse(markdown, { ...options, ...extra, async: false }) as string;
  },
});
