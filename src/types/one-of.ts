import type { ParserContext } from '../parser-types';
import { CastResult, TypeToken } from '../type-token';

type Literal = string | number | boolean;

/** Membership check against a fixed set of literals; the output type is their union */
export class OneOfType<V extends Literal = Literal> extends TypeToken<V> {
  static readonly family: string = 'oneOf';

  get values(): readonly V[] {
    return (this._state.options?.['values'] ?? []) as readonly V[];
  }

  override cast(value: unknown, _context?: ParserContext): CastResult<V> {
    const { values } = this;
    if ((values as readonly unknown[]).includes(value)) return value as V;
    // Strings from a CMS may carry a numeric or boolean member
    if (typeof value === 'string') {
      const match = values.find((candidate) => typeof candidate !== 'string' && String(candidate) === value.trim());
      if (match !== undefined) return match;
    }
    throw new Error(`Expected one of ${values.map((candidate) => JSON.stringify(candidate)).join(', ')}`);
  }
}

const createOneOf = (values: readonly Literal[]): OneOfType => {
  const token = new OneOfType({ name: `oneOf(${values.map((value) => JSON.stringify(value)).join('|')})` });
  Object.assign(token._state, { options: { values: [...values] } });
  return token;
};

/** `oneOf('draft', 'published')` — the value must be one of the given literals */
export const oneOf = <const V extends readonly Literal[]>(...values: V): OneOfType<V[number]> => createOneOf(values) as OneOfType<V[number]>;
