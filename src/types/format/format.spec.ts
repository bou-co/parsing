import { initializeParser } from '../../parser';
import { currency, duration, formatTypes, money, percent, time } from '../format';

const { createParser, types } = initializeParser({ types: formatTypes, variables: { price: 12.5, ratio: 0.2567 } });
// Intl uses no-break spaces as separators — compare on plain spaces
const plain = (value: unknown) => String(value).replace(/[\u00a0\u202f]/g, ' ');

describe('format types', () => {
  it('currency formats with Intl, as a type and a pipe', async () => {
    expect(await currency().cast(12.5)).toEqual('€12.50');
    expect(await currency('USD').cast('12.5')).toEqual('$12.50');
    expect(plain(await currency('EUR', 'fi-FI').cast(1234.5))).toEqual('1 234,50 €');
    const parser = createParser({ a: types.currency('EUR', 'fi-FI'), b: types.string, c: types.string });
    const formatted = await parser({ a: 12.5, b: '{{ price | currency:"USD" }}', c: '{{ price | currency:"EUR":"fi-FI" }}' });
    expect({ a: plain(formatted.a), b: formatted.b, c: plain(formatted.c) }).toEqual({ a: '12,50 €', b: '$12.50', c: '12,50 €' });
    await expect(async () => currency().cast('abc')).rejects.toThrow('Invalid number');
  });

  it('percent formats ratios with Angular-style digits info', async () => {
    expect(await percent().cast(0.2567)).toEqual('26%');
    expect(await percent('1.0-2').cast(0.2567)).toEqual('25.67%');
    expect(await percent(1).cast('0.2567')).toEqual('25.7%');
    expect(plain(await percent('1.2-2', 'fi-FI').cast(0.5))).toEqual('50,00 %');
    const parser = createParser({ a: types.string });
    expect(await parser({ a: '{{ ratio | percent:"1.0-1" }}' })).toEqual({ a: '25.7%' });
    expect(() => percent('x.y')).not.toThrow();
    await expect(async () => percent('x.y').cast(1)).rejects.toThrow('Invalid digits info');
  });

  it('time normalises clock times to 24h', async () => {
    for (const [input, expected] of [
      ['9:05', '09:05'],
      ['09.05.30', '09:05:30'],
      ['9 pm', '21:00'],
      ['12:30 AM', '00:30'],
      ['12:30 p.m.', '12:30'],
      ['21:05', '21:05'],
      [new Date('2024-01-01T07:08:09.000Z'), '07:08:09'],
    ] as const)
      expect(await time.cast(input)).toEqual(expected);
    for (const bad of ['24:00', '9:60', '13 pm', 'noon', 12]) await expect(async () => time.cast(bad)).rejects.toThrow('Invalid time');
  });

  it('duration accepts ISO 8601, clock and seconds, outputs seconds with an iso accessor', async () => {
    expect(await duration.cast('PT1H30M')).toEqual(5400);
    expect(await duration.cast('P1DT2H')).toEqual(93600);
    expect(await duration.cast('1:30:00')).toEqual(5400);
    expect(await duration.cast('3:45')).toEqual(225);
    expect(await duration.cast('90')).toEqual(90);
    expect(await duration.cast(12.5)).toEqual(12.5);
    expect(await duration.iso.cast(5400)).toEqual('PT1H30M');
    expect(await duration.iso.cast('P1DT2H')).toEqual('P1DT2H');
    expect(await duration.iso.cast(0)).toEqual('PT0S');
    expect(await duration.iso.cast(90.5)).toEqual('PT1M30.5S');
    for (const bad of ['P', 'later', -1, '1:2:3:4']) await expect(async () => duration.cast(bad)).rejects.toThrow('Invalid duration');
  });

  it('money parses amounts with a currency code, never a formatted string', async () => {
    expect(await money.cast('12.50 EUR')).toEqual({ amount: 12.5, currency: 'EUR' });
    expect(await money.cast('eur 12,50')).toEqual({ amount: 12.5, currency: 'EUR' });
    expect(await money.cast({ amount: '7', currency: 'usd' })).toEqual({ amount: 7, currency: 'USD' });
    expect(await money.amount.cast('12.50 EUR')).toEqual(12.5);
    expect(await money.currency.cast('12.50 EUR')).toEqual('EUR');
    for (const bad of ['€12.50', '12.50', { amount: 'x', currency: 'EUR' }, 12]) await expect(async () => money.cast(bad)).rejects.toThrow('Invalid money');
    const parser = createParser({ a: types.money.amount, b: types.string });
    expect(await parser({ a: '12.50 EUR', b: '{{ price | money.currency || "n/a" }}' })).toEqual({ a: 12.5, b: 'n/a' });
  });
});
