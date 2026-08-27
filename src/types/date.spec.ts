import { initializeParser } from '../parser';
import { DateType, TypeToken } from './index';

const { createParser, types } = initializeParser();

describe('date type', () => {
  const iso = '2024-05-15T13:45:30.250Z';

  it('casts like before', async () => {
    const parser = createParser({ a: types.date, b: types.date });
    const data = await parser({ a: iso, b: 0 });
    expect(data.a).toBeInstanceOf(Date);
    expect(data.a?.toISOString()).toEqual(iso);
    expect(data.b?.getTime()).toEqual(0);
    await expect(parser({ a: 'nope' })).rejects.toThrow('Invalid date');
  });

  it('exposes representations and UTC calendar fields', async () => {
    const parser = createParser({
      iso: types.date.iso,
      isoDate: types.date.isoDate,
      timestamp: types.date.timestamp,
      year: types.date.year,
      month: types.date.month,
      day: types.date.day,
      hours: types.date.hours,
      minutes: types.date.minutes,
      seconds: types.date.seconds,
    });
    const input = Object.fromEntries(Object.keys(parser.projection).map((key) => [key, iso]));
    expect(await parser(input)).toEqual({
      iso,
      isoDate: '2024-05-15',
      timestamp: Date.parse(iso),
      year: 2024,
      month: 5,
      day: 15,
      hours: 13,
      minutes: 45,
      seconds: 30,
    });
    expect(types.date.year).toBeInstanceOf(TypeToken);
    expect(types.date.year).not.toBeInstanceOf(DateType);
  });

  it('accessors fail at the date cast', async () => {
    const parser = createParser({ year: types.date.year });
    await expect(parser({ year: 'nope' })).rejects.toThrow('cannot cast value to "date.year" — Invalid date');
  });
});
