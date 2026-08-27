// `@bou-co/parsing/types/format` — presentation helpers and locale opinions. Register with `initializeParser({ types: { ...formatTypes } })`
import { currency } from './format/currency';
import { duration, DurationType } from './format/duration';
import { formatDate, formatDateValue } from './format/format-date';
import { money, MoneyType, type Money } from './format/money';
import { percent } from './format/percent';
import { time, TimeType } from './format/time';

export { currency, duration, DurationType, formatDate, formatDateValue, money, MoneyType, percent, time, TimeType };
export type { Money };

export const formatTypes = { formatDate, currency, percent, time, duration, money };
