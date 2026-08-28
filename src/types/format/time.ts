import type { ParserContext } from '../../parser-types';
import { CastResult, TypeToken, defineType } from '../../type-token';

const TIME = /^(\d{1,2})(?:[:.](\d{1,2}))?(?:[:.](\d{1,2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/i;

/**
 * `time` — a clock time separate from any date (opening hours): `9:05`, `09.05.30`, `9 pm`,
 * `Date` (its UTC time). Normalised to 24-hour `HH:mm` (`HH:mm:ss` when seconds were given).
 */
export class TimeType extends TypeToken<string> {
  static readonly family: string = 'time';

  override cast(value: unknown, _context?: ParserContext): CastResult<string> {
    if (value instanceof Date && !isNaN(value.getTime())) return value.toISOString().slice(11, 19);
    if (typeof value !== 'string') throw new Error('Invalid time');
    const match = TIME.exec(value.trim());
    if (!match) throw new Error('Invalid time');
    let hours = Number(match[1]);
    const minutes = Number(match[2] ?? 0);
    const seconds = match[3] === undefined ? undefined : Number(match[3]);
    const period = match[4]?.replace(/\./g, '').toLowerCase();
    if (period) {
      if (hours < 1 || hours > 12) throw new Error('Invalid time');
      hours = (hours % 12) + (period === 'pm' ? 12 : 0);
    }
    if (hours > 23 || minutes > 59 || (seconds !== undefined && seconds > 59)) throw new Error('Invalid time');
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(hours)}:${pad(minutes)}${seconds === undefined ? '' : `:${pad(seconds)}`}`;
  }
}

export const time = /* @__PURE__ */ defineType(TimeType);
