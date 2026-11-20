import type { ParserContext } from '../../parser-types';
import { Carry, CastResult, TypeToken, defineType } from '../../type-token';
import { invalid } from '../internal';

export interface Coords {
  lat: number;
  lng: number;
}

const finite = (value: unknown): number | undefined => {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
};

/** Latitude/longitude as `{ lat, lng }` from `{ lat, lng }`, `{ latitude, longitude }`, `[lat, lng]` or `"60.16, 24.93"`. Ranges validated */
export class CoordsType extends TypeToken<Coords> {
  static readonly family: string = 'coords';

  override cast(value: unknown, _context?: ParserContext): CastResult<Coords> {
    let lat: number | undefined;
    let lng: number | undefined;
    if (typeof value === 'string') {
      const parts = value.split(/[,;\s]+/).filter(Boolean);
      if (parts.length === 2) [lat, lng] = parts.map(finite);
    } else if (Array.isArray(value)) [lat, lng] = value.map(finite);
    else if (typeof value === 'object' && value !== null) {
      const source = value as Record<string, unknown>;
      lat = finite(source['lat'] ?? source['latitude']);
      lng = finite(source['lng'] ?? source['lon'] ?? source['long'] ?? source['longitude']);
    }
    if (lat === undefined || lng === undefined) throw invalid('coords');
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) throw invalid('coords', 'out of range');
    return { lat, lng };
  }

  get lat(): Carry<this, TypeToken<number>> {
    return this.derive('lat', (value) => value.lat);
  }

  get lng(): Carry<this, TypeToken<number>> {
    return this.derive('lng', (value) => value.lng);
  }
}

export const coords = /* @__PURE__ */ defineType(CoordsType);
