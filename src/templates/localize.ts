import { ParserCondition, ParserContext, ParserContextTransformer } from '../parser-types';
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

export const localize: (matching: Matching) => ParserContextTransformer = (matching = 'every') => ({
  when:
    typeof matching === 'function'
      ? matching
      : ({ data, locales = [] }) => (data && typeof data === 'object' ? Object.keys(data)[matching]((key) => locales.includes(key)) : false),
  then: async (context) => {
    if (typeof context.data !== 'object' || !context.data) return context.data;
    const { defaultLocale, currentLocale, resolveCurrentLocale } = context;
    if (currentLocale) return get(currentLocale, context.data);
    if (resolveCurrentLocale) {
      const locale = await resolveCurrentLocale(context);
      return get(locale, context.data);
    }
    return get(defaultLocale, context.data);
  },
});
