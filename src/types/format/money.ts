import type { ParserContext } from '../../parser-types';
import { CastResult, TypeToken, defineType } from '../../type-token';
import { invalid } from '../internal';
import { string, StringType } from '../string';

export interface Money {
  amount: number;
  currency: string;
}

const CODE = /^[A-Z]{3}$/;
const TEXT = /^(?:([A-Za-z]{3})\s*(-?\d+(?:[.,]\d+)?)|(-?\d+(?:[.,]\d+)?)\s*([A-Za-z]{3}))$/;

/** An amount plus an ISO 4217 code, never a formatted string: `{ amount, currency }`, `"12.50 EUR"` or `"EUR 12.50"` */
export class MoneyType extends TypeToken<Money> {
  static readonly family: string = 'money';

  override cast(value: unknown, _context?: ParserContext): CastResult<Money> {
    if (typeof value === 'string') {
      const match = TEXT.exec(value.trim());
      if (!match) throw invalid('money', 'expected "12.50 EUR"');
      const [amount, code] = match[1] ? [match[2], match[1]] : [match[3], match[4]];
      return { amount: Number(amount.replace(',', '.')), currency: code.toUpperCase() };
    }
    if (typeof value === 'object' && value !== null && 'amount' in value && 'currency' in value) {
      const raw = (value as { amount: unknown }).amount;
      const amount = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
      const currency = String((value as { currency: unknown }).currency).toUpperCase();
      if (!Number.isFinite(amount) || !CODE.test(currency)) throw invalid('money');
      return { amount, currency };
    }
    throw invalid('money');
  }

  get amount(): TypeToken<number> {
    return this.derive('amount', (value) => value.amount);
  }

  get currency(): StringType {
    return this.derive('currency', (value) => value.currency).to(string);
  }
}

export const money = /* @__PURE__ */ defineType(MoneyType);
