import { initializeParser } from '../../parser';
import { formatDate, formatDateValue } from './format-date';

// Angular DatePipe documentation examples (dateObj = 2015-06-15 09:43:11 in the London timezone)
const angularDate = new Date('2015-06-15T09:43:11.010Z');
const london = (format: string) => formatDateValue(angularDate, format, 'Europe/London');

describe('formatDate', () => {
  it('matches Angular presets for en-US', () => {
    expect(london('short')).toEqual('6/15/15, 10:43 AM');
    expect(london('medium')).toEqual('Jun 15, 2015, 10:43:11 AM');
    expect(london('long')).toEqual('June 15, 2015 at 10:43:11 AM GMT+1');
    expect(london('full')).toEqual('Monday, June 15, 2015 at 10:43:11 AM British Summer Time');
    expect(london('shortDate')).toEqual('6/15/15');
    expect(london('mediumDate')).toEqual('Jun 15, 2015');
    expect(london('longDate')).toEqual('June 15, 2015');
    expect(london('fullDate')).toEqual('Monday, June 15, 2015');
    expect(london('shortTime')).toEqual('10:43 AM');
    expect(london('mediumTime')).toEqual('10:43:11 AM');
    expect(london('longTime')).toEqual('10:43:11 AM GMT+1');
    expect(london('fullTime')).toEqual('10:43:11 AM British Summer Time');
  });

  it('matches Angular custom patterns for en-US', () => {
    expect(london('MMM d, y, h:mm:ss a')).toEqual('Jun 15, 2015, 10:43:11 AM');
    expect(london("EEEE, MMMM d, y 'at' HH:mm:ss.SSS z")).toEqual('Monday, June 15, 2015 at 10:43:11.010 GMT+1');
    expect(london('Z ZZZZ ZZZZZ O OOOO')).toEqual('+0100 GMT+01:00 +01:00 GMT+1 GMT+01:00');
    expect(london('zzzz')).toEqual('British Summer Time');
    expect(formatDateValue(angularDate, 'yy-MM-dd E EEEEEE EEEEE a aaaaa G GGGG GGGGG', 'UTC')).toEqual('15-06-15 Mon Mo M AM a AD Anno Domini A');
    expect(formatDateValue(angularDate, 'w ww W Y YY yyyy yyy y', 'UTC')).toEqual('25 25 3 2015 15 2015 2015 2015');
    expect(formatDateValue(angularDate, "h 'o''clock' h:mm a", 'UTC')).toEqual("9 o'clock 9:43 AM");
    expect(formatDateValue(new Date('2021-01-03T00:00:00.000Z'), 'w Y d', 'UTC')).toEqual('53 2020 3');
    expect(formatDateValue(new Date('2024-12-30T00:00:00.000Z'), 'w Y', 'UTC')).toEqual('1 2025');
  });

  it('supports numeric offsets like Angular, applied as a fixed shift', () => {
    expect(formatDateValue(angularDate, 'HH:mm z ZZZZZ', '+0430')).toEqual('14:13 GMT+4:30 +04:30');
    expect(formatDateValue(angularDate, 'HH:mm zzzz Z', '-0800')).toEqual('01:43 GMT-08:00 -0800');
    expect(formatDateValue(angularDate, 'long', '+0430')).toEqual('June 15, 2015 at 2:13:11 PM GMT+4:30');
  });

  it('gets Finnish standalone versus format month and weekday forms right', () => {
    const fi = new Date('2024-01-02T08:05:09.000Z');
    const helsinki = (format: string) => formatDateValue(fi, format, 'Europe/Helsinki', 'fi-FI');
    expect(helsinki('d. MMMM y')).toEqual('2. tammikuuta 2024');
    expect(helsinki('LLLL y')).toEqual('tammikuu 2024');
    expect(helsinki('MMM')).toEqual('tammi');
    expect(helsinki('EEEE d.M.y')).toEqual('tiistai 2.1.2024');
    expect(helsinki('cccc')).toEqual('tiistai');
    expect(helsinki('EEE ccc')).toEqual('ti ti');
    expect(helsinki('medium')).toEqual('2.1.2024 klo 10.05.09');
    expect(helsinki('HH:mm')).toEqual('10:05');
  });

  it('works as a type and as a pipe, taking the locale from the context', async () => {
    const localeContext = { defaultLocale: 'fi-FI' };
    const { createParser, types } = initializeParser({ types: { formatDate }, variables: { when: '2015-06-15T09:43:11.010Z' }, ...localeContext });
    const parser = createParser({
      a: types.formatDate(),
      b: types.formatDate('yyyy-MM-dd', 'Europe/Helsinki'),
      c: types.string,
      d: types.string,
      e: types.formatDate('longDate', undefined, 'en-US'),
    });
    const data = await parser({
      a: '2015-06-15T09:43:11.010Z',
      b: '2015-06-15T22:43:11.010Z',
      c: '{{ when | formatDate:"MMM d \'at\' HH:mm":"Europe/Helsinki":"en-US" }}',
      d: '{{ when | formatDate }}',
      e: 1434361391010,
    });
    expect(data).toEqual({ a: '15.6.2015', b: '2015-06-16', c: 'Jun 15 at 12:43', d: '15.6.2015', e: 'June 15, 2015' });
    await expect(parser({ a: 'nope' })).rejects.toThrow('Invalid date');
    expect(String(types.formatDate('short'))).not.toEqual(String(types.formatDate('medium')));
  });
});
