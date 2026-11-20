import type { ParserContext } from '../../parser-types';
import { applyCast, CastResult, TypeToken, defineType } from '../../type-token';
import type { ParserTypeDefaulted } from '../../type-token';
import { invalid } from '../internal';

/** A dictionary with unknown keys. `.of(value)` casts every value and drops entries that cast to missing */
export class RecordType<Value = unknown> extends TypeToken<Record<string, Value>> {
  static readonly family: string = 'record';

  override cast(value: unknown, context?: ParserContext): CastResult<Record<string, Value>> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw invalid('record');
    const item = this._state.item;
    if (!item) return value as Record<string, Value>;
    const entries = Object.entries(value);
    return Promise.all(
      entries.map(async ([key, entry]) => [key, await applyCast(entry, item, { ...context, key, value: entry, parent: context } as ParserContext)] as const),
    ).then((resolved) => Object.fromEntries(resolved.filter(([, entry]) => entry !== undefined)) as Record<string, Value>);
  }

  /** Cast every value with `value`. A default/required set before `.of()` is kept */
  of<T>(value: TypeToken<T>): this extends ParserTypeDefaulted ? RecordType<T> & ParserTypeDefaulted : RecordType<T> {
    return this.memo(`of:${value.id}`, () => this.clone({ item: value, name: `${this.name}<${value.name}>` })) as never;
  }
}

export const record = /* @__PURE__ */ defineType(RecordType);
