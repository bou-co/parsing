import type { ParserContext } from '../../parser-types';
import { CastResult, TypeToken, defineType } from '../../type-token';
import { string, StringType } from '../string';

const ISO = /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i;
const CLOCK = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/;

/**
 * `duration` — media lengths: ISO 8601 (`PT1H30M`, `P1DT2H`), `h:mm:ss` / `m:ss`, or a number of
 * seconds (numeric strings included). Output: total seconds as a number; `.iso` renders `PT…`.
 */
export class DurationType extends TypeToken<number> {
  static readonly family: string = 'duration';

  override cast(value: unknown, _context?: ParserContext): CastResult<number> {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
    if (typeof value !== 'string') throw new Error('Invalid duration');
    const text = value.trim();
    if (/^\d+(\.\d+)?$/.test(text)) return Number(text);
    const clock = CLOCK.exec(text);
    if (clock) return Number(clock[1] ?? 0) * 3600 + Number(clock[2]) * 60 + Number(clock[3]);
    const iso = ISO.exec(text);
    if (iso && text.length > 1) return Number(iso[1] ?? 0) * 86400 + Number(iso[2] ?? 0) * 3600 + Number(iso[3] ?? 0) * 60 + Number(iso[4] ?? 0);
    throw new Error('Invalid duration');
  }

  /** ISO 8601 (`PT1H30M`) */
  get iso(): StringType {
    return this.derive('iso', (seconds) => {
      const days = Math.floor(seconds / 86400);
      const hours = Math.floor((seconds % 86400) / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const rest = Math.round((seconds % 60) * 1000) / 1000;
      const time = `${hours ? `${hours}H` : ''}${minutes ? `${minutes}M` : ''}${rest || (!days && !hours && !minutes) ? `${rest}S` : ''}`;
      return `P${days ? `${days}D` : ''}${time ? `T${time}` : ''}`;
    }).to(string);
  }
}

export const duration = /* @__PURE__ */ defineType(DurationType);
