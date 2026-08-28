import type { ParserContext } from '../parser-types';
import { applyCast, CastResult, TypeToken, defineType } from '../type-token';
import type { ParserTypeDefaulted } from '../type-token';
import { invalid } from './internal';
import { string, StringType } from './string';

/** `array` — arrays pass through; `.of(item)` casts every item (each failure follows the usual policy, with the item index in the error path) */
export class ArrayType<Item = unknown> extends TypeToken<Item[]> {
  static readonly family: string = 'array';

  override cast(value: unknown, context?: ParserContext): CastResult<Item[]> {
    if (!Array.isArray(value)) throw invalid('array');
    const item = this._state.item;
    if (!item) return value as Item[];
    return Promise.all(
      value.map((entry, index) => applyCast(entry, item, { ...context, key: index, index, value: entry, parent: context } as ParserContext)),
    ) as Promise<Item[]>;
  }

  /** Cast every item with `item`. A default/required set before `.of()` is kept, so `array({ default: [] }).of(x)` types like `array.of(x).default([])` */
  of<T>(item: TypeToken<T>): this extends ParserTypeDefaulted ? ArrayType<T> & ParserTypeDefaulted : ArrayType<T> {
    return this.memo(`of:${item.id}`, () => this.clone({ item, name: `${this.name}<${item.name}>` })) as never;
  }

  // Transforms

  /** Deduplicate like a `Set` (SameValueZero), keep order, return a plain array */
  get unique(): this {
    return this.transform('unique', (value) => [...new Set(value)]);
  }

  /** Drop `null` and `undefined` items */
  get compact(): this {
    return this.transform('compact', (value) => value.filter((item) => item !== null && item !== undefined));
  }

  get reverse(): this {
    return this.transform('reverse', (value) => [...value].reverse());
  }

  // Derivations

  get first(): TypeToken<Item> {
    return this.derive('first', (value) => value[0]) as unknown as TypeToken<Item>;
  }

  get last(): TypeToken<Item> {
    return this.derive('last', (value) => value[value.length - 1]) as unknown as TypeToken<Item>;
  }

  override get length(): TypeToken<number> {
    return this.derive('length', (value) => value.length);
  }

  join(separator = ','): StringType {
    return this.derive('join', (value) => value.join(separator), [separator]).to(string);
  }
}

export const array = /* @__PURE__ */ defineType(ArrayType);
