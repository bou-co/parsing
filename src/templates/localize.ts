import { ParserContextTransformer } from '../parser-types';
import { get } from '../parser-util';

declare module '../expandable-types' {
  export interface GlobalContext {
    locales: string[];
    defaultLocale: string;
  }
  export interface InstanceContext {
    currentLocale?: string;
  }
}

export const localize: ParserContextTransformer = {
  when: ({ data, locales = [] }) => (data && typeof data === 'object' ? Object.keys(data).every((key) => locales.includes(key)) : false),
  then: ({ data, defaultLocale, currentLocale = defaultLocale }) => {
    if (typeof data !== 'object' || !data) return data;
    return get(currentLocale, data);
  },
};
