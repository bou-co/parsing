import type { ParserContext } from '../../parser-types';
import { CastResult, TypeToken, defineType } from '../../type-token';

export interface Money {
  amount: number;
  currency: string;
}

const CODE = /^[A-Z]{3}$/;
const TEXT = /^(?:([A-Za-z]{3})\s*(-?\d+(?:[.,]\d+)?)|(-?\d+(?:[.,]\d+)?)\s*([A-Za-z]{3}))$/;

/**
 * `money` — an amount plus an ISO 4217 code, never a formatted string: `{ amount, currency }`,
 * `"12.50 EUR"` or `"EUR 12.50"`. Output `{ amount: number, currency: 'EUR' }`; format for display
 * with `currency()`.
 */
export class MoneyType extends TypeToken<Money> {
  static readonly family: string = 'money';

  override cast(value: unknown, _context?: ParserContext): CastResult<Money> {
    if (typeof value === 'string') {
      const match = TEXT.exec(value.trim());
      if (!match) throw new Error('Invalid money (expected "12.50 EUR")');
      const [amount, code] = match[1] ? [match[2], match[1]] : [match[3], match[4]];
      return { amount: Number(amount.replace(',', '.')), currency: code.toUpperCase() };
    }
    if (typeof value === 'object' && value !== null && 'amount' in value && 'currency' in value) {
      const amount = Number((value as { amount: unknown }).amount);
      const currency = String((value as { currency: unknown }).currency).toUpperCase();
      if (!Number.isFinite(amount) || !CODE.test(currency)) throw new Error('Invalid money');
      return { amount, currency };
    }
    throw new Error('Invalid money');
  }

  get amount(): TypeToken<number> {
    return this.derive('amount', (value) => value.amount);
  }

  get currency(): TypeToken<string> {
    return this.derive('currency', (value) => value.currency);
  }
}

export const money = /* @__PURE__ */ defineType(MoneyType);
