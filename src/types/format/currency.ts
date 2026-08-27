import type { ParserContext } from '../../parser-types';
import { number } from '../number';
import { string, StringType } from '../string';
import { contextLocale, numberFormatter } from './intl';

/** `currency(code = 'EUR', locale?, options?)` — a number formatted as a currency amount with `Intl.NumberFormat` (`12.5` → `€12.50` / `12,50 €`) */
export const currency = (code = 'EUR', locale?: string, options?: Intl.NumberFormatOptions): StringType =>
  number['derive'](
    'currency',
    (value: number, context: ParserContext) =>
      numberFormatter(locale ?? contextLocale(context), { style: 'currency', currency: code, ...options }).format(value),
    [code, locale, options],
  ).to(string);
