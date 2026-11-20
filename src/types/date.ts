import type { ParserContext } from '../parser-types';
import { Carry, CastResult, TypeToken, defineType } from '../type-token';
import { invalid } from './internal';
import { string, StringType } from './string';

/** `Date` instances, parseable date strings and epoch numbers become a valid `Date`. Calendar fields are UTC */
export class DateType extends TypeToken<Date> {
  static readonly family: string = 'date';

  override cast(value: unknown, _context?: ParserContext): CastResult<Date> {
    if (value instanceof Date) {
      if (!Number.isNaN(value.getTime())) return value;
      throw invalid('date');
    }
    if (typeof value === 'string' || typeof value === 'number') {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) return date;
    }
    throw invalid('date');
  }

  /** Full ISO 8601 string (`2024-05-15T12:00:00.000Z`) */
  get iso(): Carry<this, StringType> {
    return this.derive('iso', (value) => value.toISOString(), [], string);
  }

  /** The `YYYY-MM-DD` portion (UTC) */
  get isoDate(): Carry<this, StringType> {
    return this.derive('isoDate', (value) => value.toISOString().slice(0, 10), [], string);
  }

  /** Epoch milliseconds */
  get timestamp(): Carry<this, TypeToken<number>> {
    return this.derive('timestamp', (value) => value.getTime());
  }

  get year(): Carry<this, TypeToken<number>> {
    return this.derive('year', (value) => value.getUTCFullYear());
  }

  /** Month as 1–12, not the zero-indexed JavaScript value */
  get month(): Carry<this, TypeToken<number>> {
    return this.derive('month', (value) => value.getUTCMonth() + 1);
  }

  get day(): Carry<this, TypeToken<number>> {
    return this.derive('day', (value) => value.getUTCDate());
  }

  get hours(): Carry<this, TypeToken<number>> {
    return this.derive('hours', (value) => value.getUTCHours());
  }

  get minutes(): Carry<this, TypeToken<number>> {
    return this.derive('minutes', (value) => value.getUTCMinutes());
  }

  get seconds(): Carry<this, TypeToken<number>> {
    return this.derive('seconds', (value) => value.getUTCSeconds());
  }
}

export const date = /* @__PURE__ */ defineType(DateType);
