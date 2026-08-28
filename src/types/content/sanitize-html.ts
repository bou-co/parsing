import type { IOptions } from 'sanitize-html';
import { createLoader, type SanitiserAdapter } from './adapters';

/**
 * The hardened server-side option: `sanitize-html` (htmlparser2-based, no DOM, richly
 * configurable — `transformTags`, `exclusiveFilter`, allow-listed inline `style` properties).
 * Its own defaults are safe; `options` pass straight through and merge over them.
 */
export const sanitizeHtmlAdapter = (options?: IOptions): SanitiserAdapter<IOptions> => ({
  name: 'sanitize-html',
  package: 'sanitize-html',
  load: createLoader('sanitize-html', 'html', () => import('sanitize-html')),
  sanitize: (library, html, extra) => {
    const sanitize = (library.default ?? library) as typeof import('sanitize-html');
    return sanitize(html, options || extra ? { ...options, ...extra } : undefined);
  },
});
