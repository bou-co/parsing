import type { ParserContext } from '../../parser-types';
import { number } from '../number';
import { string, StringType } from '../string';
import { contextLocale, digitsOptions, numberFormatter } from './intl';

/** A ratio formatted as a percentage (`0.256` → `26%`). `digits` is Angular's `minInt.minFrac-maxFrac` or a maximum fraction count */
export const percent = (digits?: string | number, locale?: string): StringType =>
  number['derive'](
    'percent',
    (value: number, context: ParserContext) => numberFormatter(locale ?? contextLocale(context), { style: 'percent', ...digitsOptions(digits) }).format(value),
    [digits, locale],
  ).to(string);
