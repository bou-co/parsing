import type { ParserContext } from '../../parser-types';
import { number } from '../number';
import { string, StringType } from '../string';
import { contextLocale, digitsOptions, numberFormatter } from './intl';

/**
 * `percent(digits?, locale?)` — a ratio formatted as a percentage (`0.256` → `26%`). `digits`
 * follows Angular's `minInt.minFrac-maxFrac` (`'1.0-2'`) or is a plain maximum fraction count.
 */
export const percent = (digits?: string | number, locale?: string): StringType =>
  number['derive'](
    'percent',
    (value: number, context: ParserContext) => numberFormatter(locale ?? contextLocale(context), { style: 'percent', ...digitsOptions(digits) }).format(value),
    [digits, locale],
  ).to(string);
