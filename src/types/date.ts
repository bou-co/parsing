import type { ParserContext } from '../parser-types';
import { CastResult, TypeToken, defineType } from '../type-token';
import { invalid } from './internal';
import { string, StringType } from './string';

/** `date` — `Date` instances, parseable date strings and epoch numbers become a valid `Date`. Calendar fields are UTC */
export class DateType extends TypeToken<Date> {
  static readonly family: string = 'date';

  override cast(value: unknown, _context?: ParserContext): CastResult<Date> {
    if (value instanceof Date) {
      if (!isNaN(value.getTime())) return value;
      throw invalid('date');
    }
    if (typeof value === 'string' || typeof value === 'number') {
      const date = new Date(value);
      if (!isNaN(date.getTime())) return date;
    }
    throw invalid('date');
  }

  // Representations

  /** Full ISO 8601 string (`2024-05-15T12:00:00.000Z`) */
  get iso(): StringType {
    return this.derive('iso', (value) => value.toISOString()).to(string);
  }

  /** The `YYYY-MM-DD` portion (UTC) — what date inputs and date-keyed grouping want */
  get isoDate(): StringType {
    return this.derive('isoDate', (value) => value.toISOString().slice(0, 10)).to(string);
  }

  /** Epoch milliseconds */
  get timestamp(): TypeToken<number> {
    return this.derive('timestamp', (value) => value.getTime());
  }

  // Calendar fields (UTC)

  get year(): TypeToken<number> {
    return this.derive('year', (value) => value.getUTCFullYear());
  }

  /** Month as 1–12, not the zero-indexed JavaScript value */
  get month(): TypeToken<number> {
    return this.derive('month', (value) => value.getUTCMonth() + 1);
  }

  get day(): TypeToken<number> {
    return this.derive('day', (value) => value.getUTCDate());
  }

  get hours(): TypeToken<number> {
    return this.derive('hours', (value) => value.getUTCHours());
  }

  get minutes(): TypeToken<number> {
    return this.derive('minutes', (value) => value.getUTCMinutes());
  }

  get seconds(): TypeToken<number> {
    return this.derive('seconds', (value) => value.getUTCSeconds());
  }
}

export const date = /* @__PURE__ */ defineType(DateType);
