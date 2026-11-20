import type { ParserContext } from '../parser-types';
import { CastResult, TypeToken, defineType } from '../type-token';
import { invalid } from './internal';

// Shifts the decimal point through the exponent so rounding stays decimal-safe (`1.005` → `1.01`)
const shift = (value: number, by: number): number => {
  const [mantissa, exponent = '0'] = String(value).split('e');
  return Number(`${mantissa}e${Number(exponent) + by}`);
};

const roundTo = (value: number, decimals: number): number => {
  const shifted = shift(value, decimals);
  return shift(Math.sign(shifted) * Math.round(Math.abs(shifted)), -decimals);
};

/** Finite numbers pass through. Booleans (`1`/`0`), dates (epoch ms) and numeric strings are coerced */
export class NumberType extends TypeToken<number> {
  static readonly family: string = 'number';

  override cast(value: unknown, _context?: ParserContext): CastResult<number> {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (value instanceof Date) {
      const time = value.getTime();
      if (!Number.isNaN(time)) return time;
      throw invalid('number');
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      const parsed = Number(trimmed);
      if (trimmed !== '' && Number.isFinite(parsed)) return parsed;
    }
    throw invalid('number');
  }

  /** Round to `decimals` places (default 0). Half away from zero, decimal-safe (`1.005` → `1.01`) */
  round(decimals = 0): this {
    return this.transform('round', (value) => roundTo(value, decimals), [decimals]);
  }

  get floor(): this {
    return this.transform('floor', (value) => Math.floor(value));
  }

  get ceil(): this {
    return this.transform('ceil', (value) => Math.ceil(value));
  }

  get abs(): this {
    return this.transform('abs', (value) => Math.abs(value));
  }

  /** Bound the value to `[min, max]`: a transform, never a rejection */
  clamp(min: number, max: number): this {
    return this.transform('clamp', (value) => Math.min(max, Math.max(min, value)), [min, max]);
  }
}

export const number = /* @__PURE__ */ defineType(NumberType);
