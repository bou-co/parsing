import type { ParserContext } from '../../parser-types';
import { applyCast, CastResult, TypeToken, defineType } from '../../type-token';
import type { ParserTypeDefaulted } from '../../type-token';

/** `record.of(value)` — a dictionary with unknown keys and cast values: about output shape (compare `json`, which is about input encoding) */
export class RecordType<Value = unknown> extends TypeToken<Record<string, Value>> {
  static readonly family: string = 'record';

  override cast(value: unknown, context?: ParserContext): CastResult<Record<string, Value>> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Invalid record');
    const item = this._state.item;
    if (!item) return value as Record<string, Value>;
    const entries = Object.entries(value);
    return Promise.all(
      entries.map(async ([key, entry]) => [key, await applyCast(entry, item, { ...context, key, value: entry, parent: context } as ParserContext)] as const),
    ).then((resolved) => Object.fromEntries(resolved.filter(([, entry]) => entry !== undefined)) as Record<string, Value>);
  }

  /** Cast every value with `value`; a default/required set before `.of()` is kept in the type */
  of<T>(value: TypeToken<T>): this extends ParserTypeDefaulted ? RecordType<T> & ParserTypeDefaulted : RecordType<T> {
    return this.memo(`of:${value.id}`, () => this.clone({ item: value, name: `${this.name}<${value.name}>` })) as never;
  }
}

export const record = /* @__PURE__ */ defineType(RecordType);
