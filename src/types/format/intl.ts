import type { ParserContext } from '../../parser-types';

const cache = new Map<string, Intl.NumberFormat>();

export const numberFormatter = (locale: string | undefined, options: Intl.NumberFormatOptions): Intl.NumberFormat => {
  const key = `${locale ?? 'en-US'}|${JSON.stringify(options)}`;
  let cached = cache.get(key);
  if (!cached) cache.set(key, (cached = new Intl.NumberFormat(locale ?? 'en-US', options)));
  return cached;
};

/** Locale from the localize template's context fields when present */
export const contextLocale = (context: ParserContext): string | undefined => {
  const { currentLocale, defaultLocale } = context as { currentLocale?: unknown; defaultLocale?: unknown };
  return typeof currentLocale === 'string' ? currentLocale : typeof defaultLocale === 'string' ? defaultLocale : undefined;
};

/** Angular-style `minInt.minFrac-maxFrac` digits info, or a plain maximum fraction digit count */
export const digitsOptions = (digits?: string | number): Intl.NumberFormatOptions => {
  if (digits === undefined) return {};
  if (typeof digits === 'number') return { maximumFractionDigits: digits };
  const match = /^(\d+)?(?:\.(\d+)(?:-(\d+))?)?$/.exec(digits);
  if (!match) throw new Error(`Invalid digits info "${digits}" — expected "minInt.minFrac-maxFrac"`);
  const options: Intl.NumberFormatOptions = {};
  if (match[1]) options.minimumIntegerDigits = Number(match[1]);
  if (match[2]) options.minimumFractionDigits = Number(match[2]);
  if (match[3]) options.maximumFractionDigits = Math.max(Number(match[3]), Number(match[2] ?? 0));
  else if (match[2]) options.maximumFractionDigits = Math.max(Number(match[2]), 3);
  return options;
};
