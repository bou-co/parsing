import { ParserCondition, ParserContext, ParserContextTransformer, ParserFunction } from '../parser-types';
import { get } from '../parser-util';

declare module '../expandable-types' {
  export interface GlobalContext {
    locales: string[];
    defaultLocale: string;
    resolveCurrentLocale?: (context: ParserContext<unknown>) => string | Promise<string>;
  }
  export interface InstanceContext {
    currentLocale?: string;
  }
}

type Matching = 'every' | 'some' | ParserCondition<unknown>;

type FallbackFunction = (context: ParserContext<unknown>) => string | Promise<string>;

interface LocalizeOptions {
  matching?: Matching;
  fallback?: boolean | FallbackFunction;
}

export const localize: (options: LocalizeOptions) => ParserContextTransformer = ({ matching = 'every', fallback = true }) => {
  const when: ParserCondition<unknown> =
    typeof matching === 'function'
      ? matching
      : ({ data, locales = [] }) => (data && typeof data === 'object' ? Object.keys(data)[matching]((key) => locales.includes(key)) : false);

  return {
    when,
    then: async (context) => {
      if (typeof context.data !== 'object' || !context.data) return context.data;
      const { data, defaultLocale, currentLocale, resolveCurrentLocale } = context;
      let match = undefined;
      if (currentLocale) match = await get(currentLocale, data);
      else if (resolveCurrentLocale) {
        const locale = await resolveCurrentLocale(context);
        match = await get(locale, data);
      }
      if (!match && fallback) {
        if (typeof fallback === 'function') return fallback(context);
        match = await get(defaultLocale, data);
      }
      return match;
    },
  };
};
