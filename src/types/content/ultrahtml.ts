import type { SanitizeOptions } from 'ultrahtml/transformers/sanitize';
import { createLoader, type SanitiserAdapter } from './adapters';

export const DEFAULT_DROP_ELEMENTS = [
  'script',
  'style',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'applet',
  'link',
  'meta',
  'base',
  'form',
  'input',
  'textarea',
  'select',
  'button',
  'noscript',
  'template',
  'svg',
  'math',
];

const URL_ATTRIBUTES = new Set(['href', 'src', 'xlink:href', 'action', 'formaction', 'srcdoc', 'srcset', 'poster', 'background', 'ping']);
const UNSAFE_URL = /^\s*(javascript|vbscript|data):/i;

/** Adapter for `ultrahtml`. Adds what its sanitiser lacks: `on*` handlers and `javascript:`/`vbscript:`/`data:` URLs are always dropped, and a default element drop-list applies unless `allowElements` is given */
export const ultrahtmlAdapter = (options?: SanitizeOptions): SanitiserAdapter<SanitizeOptions> => ({
  name: 'ultrahtml',
  package: 'ultrahtml',
  load: createLoader('ultrahtml', 'html', () => Promise.all([import('ultrahtml'), import('ultrahtml/transformers/sanitize')])),
  sanitize: async (library, html, extra) => {
    const [core, sanitizer] = library as [typeof import('ultrahtml'), typeof import('ultrahtml/transformers/sanitize')];
    const merged: SanitizeOptions = { ...options, ...extra };
    if (!merged.allowElements?.length) merged.dropElements = [...DEFAULT_DROP_ELEMENTS, ...(merged.dropElements ?? [])];
    const stripUnsafeAttributes = (doc: unknown) => {
      core.walkSync(doc as Parameters<typeof core.walkSync>[0], (node) => {
        if (node.type !== core.ELEMENT_NODE) return;
        for (const name of Object.keys(node.attributes)) {
          const lower = name.toLowerCase();
          if (lower.startsWith('on') || (URL_ATTRIBUTES.has(lower) && UNSAFE_URL.test(String(node.attributes[name])))) delete node.attributes[name];
        }
      });
      return doc;
    };
    return core.transform(html, [sanitizer.default(merged), stripUnsafeAttributes as never]);
  },
});
