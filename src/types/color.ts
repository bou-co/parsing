import type { ParserContext } from '../parser-types';
import type { TypeToken } from '../type-token';
import { defineType } from '../type-token';
import { StringType } from './string';

export interface ColorChannels {
  r: number;
  g: number;
  b: number;
}

interface Parsed extends ColorChannels {
  a: number;
}

const clamp = (value: number, max: number) => Math.min(max, Math.max(0, value));
const channel = (raw: string): number => (raw.endsWith('%') ? Math.round((clamp(parseFloat(raw), 100) / 100) * 255) : clamp(Math.round(parseFloat(raw)), 255));
const alpha = (raw: string | undefined): number => (raw === undefined ? 1 : raw.endsWith('%') ? clamp(parseFloat(raw), 100) / 100 : clamp(parseFloat(raw), 1));

const hslToRgb = (h: number, s: number, l: number): ColorChannels => {
  const hue = (((h % 360) + 360) % 360) / 360;
  const sat = clamp(s, 100) / 100;
  const light = clamp(l, 100) / 100;
  const q = light < 0.5 ? light * (1 + sat) : light + sat - light * sat;
  const p = 2 * light - q;
  const convert = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return { r: Math.round(convert(hue + 1 / 3) * 255), g: Math.round(convert(hue) * 255), b: Math.round(convert(hue - 1 / 3) * 255) };
};

const rgbToHsl = ({ r, g, b }: ColorChannels): [number, number, number] => {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const light = (max + min) / 2;
  if (max === min) return [0, 0, Math.round(light * 100)];
  const delta = max - min;
  const sat = light > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue: number;
  if (max === red) hue = (green - blue) / delta + (green < blue ? 6 : 0);
  else if (max === green) hue = (blue - red) / delta + 2;
  else hue = (red - green) / delta + 4;
  return [Math.round(hue * 60), Math.round(sat * 100), Math.round(light * 100)];
};

const HEX = /^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNCTIONAL = /^(rgba?|hsla?)\(\s*([^)]*?)\s*\)$/i;

const parseColor = (input: string): Parsed => {
  const text = input.trim();
  const hex = HEX.exec(text);
  if (hex) {
    let digits = hex[1];
    if (digits.length <= 4) digits = [...digits].map((d) => d + d).join('');
    const [r, g, b, a] = [0, 2, 4, 6].map((i) => (digits.length > i ? parseInt(digits.slice(i, i + 2), 16) : undefined));
    return { r: r as number, g: g as number, b: b as number, a: a === undefined ? 1 : a / 255 };
  }
  const fn = FUNCTIONAL.exec(text);
  if (fn) {
    const kind = fn[1].toLowerCase();
    const [main, slashAlpha] = fn[2].split('/').map((part) => part.trim());
    const parts = main.split(/[\s,]+/).filter(Boolean);
    if (parts.length < 3) throw new Error('Invalid color');
    const a = alpha(slashAlpha ?? parts[3]);
    if (kind.startsWith('rgb')) return { r: channel(parts[0]), g: channel(parts[1]), b: channel(parts[2]), a };
    return { ...hslToRgb(parseFloat(parts[0]), parseFloat(parts[1]), parseFloat(parts[2])), a };
  }
  throw new Error('Invalid color');
};

const toHex = ({ r, g, b, a }: Parsed): string => {
  const hex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}${a < 1 ? hex(Math.round(a * 255)) : ''}`;
};

/**
 * `color` — accepts hex (`#abc`, `#aabbcc`, `#aabbccdd`), `rgb()`/`rgba()` and `hsl()`/`hsla()`;
 * normalised to lower-case hex (`#rrggbb`, or `#rrggbbaa` when translucent). Notations: `.hex`,
 * `.rgb`, `.hsl`; components: `.channels`, `.alpha`.
 */
export class ColorType extends StringType {
  static override readonly family: string = 'color';

  override async cast(value: unknown, context?: ParserContext): Promise<string | undefined> {
    const text = await super.cast(value, context);
    if (text === undefined) return undefined;
    return toHex(parseColor(text));
  }

  get hex(): TypeToken<string> {
    return this.derive('hex', (value) => value);
  }

  get rgb(): TypeToken<string> {
    return this.derive('rgb', (value) => {
      const { r, g, b, a } = parseColor(value);
      return a < 1 ? `rgba(${r}, ${g}, ${b}, ${Math.round(a * 100) / 100})` : `rgb(${r}, ${g}, ${b})`;
    });
  }

  get hsl(): TypeToken<string> {
    return this.derive('hsl', (value) => {
      const parsed = parseColor(value);
      const [h, s, l] = rgbToHsl(parsed);
      return parsed.a < 1 ? `hsla(${h}, ${s}%, ${l}%, ${Math.round(parsed.a * 100) / 100})` : `hsl(${h}, ${s}%, ${l}%)`;
    });
  }

  /** `{ r, g, b }` as 0–255 numbers */
  get channels(): TypeToken<ColorChannels> {
    return this.derive('channels', (value) => {
      const { r, g, b } = parseColor(value);
      return { r, g, b };
    });
  }

  /** Opacity 0–1 (`1` when opaque) */
  get alpha(): TypeToken<number> {
    return this.derive('alpha', (value) => Math.round(parseColor(value).a * 1000) / 1000);
  }
}

export const color = /* @__PURE__ */ defineType(ColorType);
