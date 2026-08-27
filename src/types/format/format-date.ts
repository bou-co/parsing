import type { ParserContext } from '../../parser-types';
import { date } from '../date';
import { string, StringType } from '../string';

/**
 * `formatDate(format?, timezone?, locale?)` — Angular `DatePipe`-compatible formatting on top of
 * `Intl.DateTimeFormat`: every locale the runtime knows works with no locale data shipped.
 * Presets (`short`, `mediumDate`, `longTime`, ...) map to `dateStyle`/`timeStyle`; tokens follow
 * Angular (`y`, `MMMM`, `LLLL` standalone, `EEEE`, `HH:mm`, `a`, `z`, `Z`, `O`, `w`, `W`, `Y`, `S`),
 * with `'quoted'` literal segments. Timezone accepts IANA names (recommended, DST-correct) and
 * fixed offsets (`+0430`). Default format: `mediumDate`, default locale: the context's
 * `currentLocale`/`defaultLocale`, then `en-US`.
 */

type Styles = { dateStyle?: Intl.DateTimeFormatOptions['dateStyle']; timeStyle?: Intl.DateTimeFormatOptions['timeStyle'] };

const PRESETS: Record<string, Styles> = {
  short: { dateStyle: 'short', timeStyle: 'short' },
  medium: { dateStyle: 'medium', timeStyle: 'medium' },
  long: { dateStyle: 'long', timeStyle: 'long' },
  full: { dateStyle: 'full', timeStyle: 'full' },
  shortDate: { dateStyle: 'short' },
  mediumDate: { dateStyle: 'medium' },
  longDate: { dateStyle: 'long' },
  fullDate: { dateStyle: 'full' },
  shortTime: { timeStyle: 'short' },
  mediumTime: { timeStyle: 'medium' },
  longTime: { timeStyle: 'long' },
  fullTime: { timeStyle: 'full' },
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();
const formatter = (locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat => {
  const key = `${locale}|${JSON.stringify(options)}`;
  let cached = formatterCache.get(key);
  if (!cached) formatterCache.set(key, (cached = new Intl.DateTimeFormat(locale, options)));
  return cached;
};

const part = (locale: string, options: Intl.DateTimeFormatOptions, value: Date, type: Intl.DateTimeFormatPartTypes): string =>
  formatter(locale, options)
    .formatToParts(value)
    .filter((item) => item.type === type)
    .map((item) => item.value)
    .join('');

interface Zone {
  /** IANA name for Intl, or 'UTC' when a fixed offset is applied by shifting the instant */
  timeZone: string;
  /** Fixed offset in minutes when the timezone was given as `+hhmm` */
  offset?: number;
}

const OFFSET = /^([+-])(\d{2}):?(\d{2})$/;

const resolveZone = (timezone: string | undefined): Zone => {
  if (!timezone) return { timeZone: 'UTC' };
  const match = OFFSET.exec(timezone);
  if (match) return { timeZone: 'UTC', offset: (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3])) };
  return { timeZone: timezone };
};

interface Fields {
  year: number;
  month: number;
  day: number;
  weekday: number;
  hours: number;
  minutes: number;
  seconds: number;
  milliseconds: number;
  offsetMinutes: number;
}

// Calendar fields of the instant as seen in the zone — one formatter call, numeric parts only
const zonedFields = (value: Date, zone: Zone): Fields => {
  const parts = formatter('en-US', {
    timeZone: zone.timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    weekday: 'short',
  }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  const fields: Fields = {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    weekday,
    hours: Number(get('hour')) % 24,
    minutes: Number(get('minute')),
    seconds: Number(get('second')),
    milliseconds: value.getUTCMilliseconds(),
    offsetMinutes: 0,
  };
  if (zone.offset !== undefined) fields.offsetMinutes = zone.offset;
  else {
    // Offset = zone wall-clock minus UTC wall-clock, in minutes
    const asUtc = Date.UTC(fields.year, fields.month - 1, fields.day, fields.hours, fields.minutes, fields.seconds);
    fields.offsetMinutes = Math.round((asUtc - (value.getTime() - fields.milliseconds)) / 60000);
  }
  return fields;
};

const pad = (value: number, size: number) => String(Math.abs(value)).padStart(size, '0');

const formatOffset = (minutes: number, style: 'basic' | 'extended' | 'gmt-short' | 'gmt-long'): string => {
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  const hours = Math.floor(abs / 60);
  const mins = abs % 60;
  switch (style) {
    case 'basic':
      return `${sign}${pad(hours, 2)}${pad(mins, 2)}`;
    case 'extended':
      return `${sign}${pad(hours, 2)}:${pad(mins, 2)}`;
    case 'gmt-short':
      return minutes === 0 ? 'GMT' : `GMT${sign}${hours}${mins ? `:${pad(mins, 2)}` : ''}`;
    case 'gmt-long':
      return `GMT${sign}${pad(hours, 2)}:${pad(mins, 2)}`;
  }
};

// ISO week helpers on UTC-constructed dates so the host timezone never leaks in
const utcDate = (year: number, month: number, day: number) => new Date(Date.UTC(year, month - 1, day));
const thursdayOfIsoWeek = (fields: Fields) => utcDate(fields.year, fields.month, fields.day + 4 - (fields.weekday || 7));
const firstThursdayOfYear = (year: number) => {
  const firstDay = utcDate(year, 1, 1).getUTCDay();
  return utcDate(year, 1, 1 + (firstDay <= 4 ? 4 : 11) - firstDay);
};
const isoWeek = (fields: Fields) => {
  const thursday = thursdayOfIsoWeek(fields);
  return 1 + Math.round((thursday.getTime() - firstThursdayOfYear(thursday.getUTCFullYear()).getTime()) / 6.048e8);
};
const weekOfMonth = (fields: Fields) => 1 + Math.floor((fields.day + utcDate(fields.year, fields.month, 1).getUTCDay() - 1) / 7);

type Width = 'narrow' | 'short' | 'long';
const widthOf = (length: number): Width => (length <= 3 ? 'short' : length === 4 ? 'long' : 'narrow');

interface FormatInput {
  value: Date;
  shifted: Date;
  fields: Fields;
  zone: Zone;
  locale: string;
}

const formatToken = (token: string, input: FormatInput): string => {
  const { fields, locale, shifted, zone } = input;
  const tz = { timeZone: zone.timeZone };
  const letter = token[0];
  const length = token.length;
  switch (letter) {
    case 'G':
      return part(locale, { ...tz, era: widthOf(length), year: 'numeric' }, shifted, 'era');
    case 'y':
      return length === 2 ? pad(fields.year % 100, 2) : pad(fields.year, length === 1 ? 1 : length);
    case 'Y': {
      const year = thursdayOfIsoWeek(fields).getUTCFullYear();
      return length === 2 ? pad(year % 100, 2) : pad(year, length === 1 ? 1 : length);
    }
    case 'M': {
      if (length <= 2) return pad(fields.month, length);
      // Format form: the month as it appears inside a full date (genitive in Finnish and friends); some locales
      // render short months numerically inside dates, in which case the standalone name is the useful answer
      const inDate = part(locale, { ...tz, month: widthOf(length), day: 'numeric' }, shifted, 'month');
      return /\d/.test(inDate) ? part(locale, { ...tz, month: widthOf(length) }, shifted, 'month') : inDate;
    }
    case 'L':
      if (length <= 2) return pad(fields.month, length);
      // Standalone form: the month on its own
      return part(locale, { ...tz, month: widthOf(length) }, shifted, 'month');
    case 'd':
      return pad(fields.day, length);
    case 'E':
    case 'c': {
      // EEEEEE is Angular's two-letter "short" form, which Intl lacks — cut the abbreviated name
      const width: Width = length === 6 ? 'short' : widthOf(length);
      const options: Intl.DateTimeFormatOptions = letter === 'E' ? { ...tz, weekday: width, day: 'numeric', month: 'long' } : { ...tz, weekday: width };
      const name = part(locale, options, shifted, 'weekday');
      return length === 6 ? name.slice(0, 2) : name;
    }
    case 'a': {
      const period = part(locale, { ...tz, hour: 'numeric', hour12: true }, shifted, 'dayPeriod');
      return length === 5 ? period.charAt(0).toLowerCase() : period;
    }
    case 'h':
      return pad(fields.hours % 12 || 12, length);
    case 'H':
      return pad(fields.hours, length);
    case 'm':
      return pad(fields.minutes, length);
    case 's':
      return pad(fields.seconds, length);
    case 'S':
      return pad(fields.milliseconds, 3).slice(0, length);
    case 'z':
      if (zone.offset !== undefined) return formatOffset(fields.offsetMinutes, length === 4 ? 'gmt-long' : 'gmt-short');
      return part(locale, { ...tz, timeZoneName: length === 4 ? 'long' : 'short' }, shifted, 'timeZoneName');
    case 'Z':
      return formatOffset(fields.offsetMinutes, length <= 3 ? 'basic' : length === 4 ? 'gmt-long' : 'extended');
    case 'O':
      return formatOffset(fields.offsetMinutes, length === 4 ? 'gmt-long' : 'gmt-short');
    case 'w':
      return pad(isoWeek(fields), length);
    case 'W':
      return String(weekOfMonth(fields));
    default:
      return token;
  }
};

// Pattern → literal and token segments; 'quoted' text passes through, '' is a single quote
const tokenize = (pattern: string): { literal: boolean; text: string }[] => {
  const segments: { literal: boolean; text: string }[] = [];
  let i = 0;
  while (i < pattern.length) {
    const char = pattern[i];
    if (char === "'") {
      if (pattern[i + 1] === "'") {
        segments.push({ literal: true, text: "'" });
        i += 2;
        continue;
      }
      // Quoted literal: runs to the closing quote, with '' inside standing for one quote
      let text = '';
      let j = i + 1;
      while (j < pattern.length) {
        if (pattern[j] === "'") {
          if (pattern[j + 1] === "'") {
            text += "'";
            j += 2;
            continue;
          }
          break;
        }
        text += pattern[j++];
      }
      segments.push({ literal: true, text });
      i = j + 1;
      continue;
    }
    if (/[A-Za-z]/.test(char)) {
      let j = i;
      while (pattern[j] === char) j++;
      segments.push({ literal: false, text: pattern.slice(i, j) });
      i = j;
      continue;
    }
    segments.push({ literal: true, text: char });
    i++;
  }
  return segments;
};

const patternCache = new Map<string, ReturnType<typeof tokenize>>();

export const formatDateValue = (value: Date, format = 'mediumDate', timezone?: string, locale = 'en-US'): string => {
  const zone = resolveZone(timezone);
  const shifted = zone.offset !== undefined ? new Date(value.getTime() + zone.offset * 60000) : value;
  const preset = PRESETS[format];
  if (preset) {
    const text = formatter(locale, { ...preset, timeZone: zone.timeZone }).format(shifted);
    // Presets with a time in a fixed-offset zone would print "UTC" — substitute the real offset
    return zone.offset !== undefined && preset.timeStyle && (preset.timeStyle === 'long' || preset.timeStyle === 'full')
      ? text.replace(/\bUTC\b|\bGMT\b|Coordinated Universal Time/g, formatOffset(zone.offset, preset.timeStyle === 'full' ? 'gmt-long' : 'gmt-short'))
      : text;
  }
  let segments = patternCache.get(format);
  if (!segments) patternCache.set(format, (segments = tokenize(format)));
  const input: FormatInput = { value, shifted, fields: zonedFields(shifted, zone), zone, locale };
  return segments.map((segment) => (segment.literal ? segment.text : formatToken(segment.text, input))).join('');
};

const contextLocale = (context: ParserContext): string | undefined => {
  const { currentLocale, defaultLocale } = context as { currentLocale?: unknown; defaultLocale?: unknown };
  return typeof currentLocale === 'string' ? currentLocale : typeof defaultLocale === 'string' ? defaultLocale : undefined;
};

export const formatDate = (format = 'mediumDate', timezone?: string, locale?: string): StringType =>
  date['derive']('formatDate', (value: Date, context: ParserContext) => formatDateValue(value, format, timezone, locale ?? contextLocale(context) ?? 'en-US'), [
    format,
    timezone,
    locale,
  ]).to(string);
