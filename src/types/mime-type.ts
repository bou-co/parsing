import type { ParserContext } from '../parser-types';
import type { TypeToken } from '../type-token';
import { defineType } from '../type-token';
import { string, StringType } from './string';

const TOKEN = '[a-z0-9][a-z0-9!#$&^_.+-]*';
const MIME = new RegExp(`^(${TOKEN})/([a-z0-9][a-z0-9!#$&^_.-]*?)(?:\\+([a-z0-9][a-z0-9!#$&^_.-]*))?((?:\\s*;\\s*[^;=\\s]+=[^;]*)*)\\s*$`, 'i');

interface Parts {
  type: string;
  subtype: string;
  suffix?: string;
  params: string;
}

const parseMime = (value: string): Parts => {
  const match = MIME.exec(value.trim());
  if (!match) throw new Error('Invalid MIME type');
  const params = match[4]
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [key, ...rest] = part.split('=');
      return `${key.trim().toLowerCase()}=${rest.join('=').trim()}`;
    })
    .join('; ');
  return { type: match[1].toLowerCase(), subtype: match[2].toLowerCase(), suffix: match[3]?.toLowerCase(), params };
};

const essenceOf = ({ type, subtype, suffix }: Parts) => `${type}/${subtype}${suffix ? `+${suffix}` : ''}`;

/**
 * `mimeType` — parses `type/subtype+suffix; params` (an IANA media type), lower-casing the type
 * parts and normalising parameter spacing. Decomposes via `.type`, `.subtype`, `.suffix`,
 * `.essence` (`type/subtype+suffix` without parameters).
 */
export class MimeTypeType extends StringType {
  static override readonly family: string = 'mimeType';

  override async cast(value: unknown, context?: ParserContext): Promise<string | undefined> {
    const text = await super.cast(value, context);
    if (text === undefined) return undefined;
    const parts = parseMime(text);
    return parts.params ? `${essenceOf(parts)}; ${parts.params}` : essenceOf(parts);
  }

  get type(): StringType {
    return this.derive('type', (value) => parseMime(value).type).to(string);
  }

  get subtype(): StringType {
    return this.derive('subtype', (value) => parseMime(value).subtype).to(string);
  }

  /** The structured-syntax suffix (`json` in `application/ld+json`), or `undefined` */
  get suffix(): StringType {
    return this.derive('suffix', (value) => parseMime(value).suffix).to(string);
  }

  get essence(): StringType {
    return this.derive('essence', (value) => essenceOf(parseMime(value))).to(string);
  }
}

export const mimeType = /* @__PURE__ */ defineType(MimeTypeType);
