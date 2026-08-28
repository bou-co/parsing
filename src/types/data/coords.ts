import type { ParserContext } from '../../parser-types';
import { CastResult, TypeToken, defineType } from '../../type-token';

export interface Coords {
  lat: number;
  lng: number;
}

const finite = (value: unknown): number | undefined => {
  const n = typeof value === 'string' ? Number(value.trim()) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
};

/**
 * `coords` — latitude/longitude for maps and store locators: `{ lat, lng }`, `{ latitude, longitude }`,
 * `[lat, lng]` or `"60.16, 24.93"`. Output `{ lat, lng }`, ranges validated.
 */
export class CoordsType extends TypeToken<Coords> {
  static readonly family: string = 'coords';

  override cast(value: unknown, _context?: ParserContext): CastResult<Coords> {
    let lat: number | undefined;
    let lng: number | undefined;
    if (typeof value === 'string')
      [lat, lng] = value
        .split(/[,;\s]+/)
        .filter(Boolean)
        .map(finite);
    else if (Array.isArray(value)) [lat, lng] = value.map(finite);
    else if (typeof value === 'object' && value !== null) {
      const source = value as Record<string, unknown>;
      lat = finite(source['lat'] ?? source['latitude']);
      lng = finite(source['lng'] ?? source['lon'] ?? source['long'] ?? source['longitude']);
    }
    if (lat === undefined || lng === undefined) throw new Error('Invalid coordinates');
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) throw new Error('Coordinates out of range');
    return { lat, lng };
  }

  get lat(): TypeToken<number> {
    return this.derive('lat', (value) => value.lat);
  }

  get lng(): TypeToken<number> {
    return this.derive('lng', (value) => value.lng);
  }
}

export const coords = /* @__PURE__ */ defineType(CoordsType);
