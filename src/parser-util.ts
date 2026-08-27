/* eslint-disable @typescript-eslint/no-explicit-any */
import { getFromObject } from './internal';
import {
  AppObject,
  GetDefaulted,
  GetOutput,
  GetValue,
  GetValueFunction,
  ParserCondition,
  ParserContext,
  ParserFunction,
  ParserProjection,
} from './parser-types';
import { toHash } from './to-hash';
import { applyCast, isTypeToken, TypeToken } from './type-token';

export const asyncMapObject = async <T>(object: T, callback: (value: any) => any): Promise<T> => {
  if (!object || typeof object !== 'object') return object;
  const entries = Object.entries(object);
  if (!entries.length) return object;
  // Map all entries in parallel and build the result in a single pass
  const results = await Promise.all(entries.map(async ([key, value]) => [key, await callback(value)] as [string, any]));
  if (Array.isArray(object)) return results.map(([, value]) => value) as T;
  return Object.fromEntries(results) as T;
};

export const asDate = (value: string | number): undefined | Date => {
  if (!value) return undefined;
  try {
    return new Date(value);
  } catch {
    return undefined;
  }
};

export const typed = <T>(value: unknown = '_inherit'): T => value as T;
export const optional = <T>(value: unknown = '_inherit'): T | undefined => value as T;
export const filterNill = <T>(obj: T[]) => obj.filter((entry) => entry ?? false) as Exclude<T, undefined | null>[];
export const filterUndefinedEntries = <T extends [string, any][]>(obj: T) =>
  obj.filter((entry) => entry[1] !== undefined) as Exclude<T[number], [string, undefined]>[];
export const condition = <T extends ParserProjection | ParserFunction<any>>(when: ParserCondition, then: T) => ({ when, then });

export function get<T = unknown>(path: string): (context: ParserContext) => Promise<T>;
export function get<T extends TypeToken>(path: string, type: T): GetValueFunction<GetOutput<T>> & GetDefaulted<T>;
export function get<T = unknown>(path: string, from: AppObject): Promise<T>;
export function get<T extends TypeToken>(path: string, from: AppObject, type: T): GetValue<GetOutput<T>> & GetDefaulted<T>;

/**
 * Pick a nested value by dot path — from the current `context.data` (curried form) or from an
 * explicit object. With a type token the value is cast **by the engine**, after transformers and
 * pattern resolution and under the active failure policy, exactly as if the token sat at the
 * projection key: `phoneLink: get('phoneNumber', types.tel.href)` projects a second output from
 * the same raw field. Every returned function hashes by its path (and token) so parsers that differ
 * only in a `get` path stay distinct.
 */
export function get(path: string, fromOrType?: AppObject | TypeToken, maybeType?: TypeToken): any {
  const type = isTypeToken(fromOrType) ? fromOrType : maybeType;
  const from = isTypeToken(fromOrType) ? undefined : fromOrType;
  if (!type) {
    if (from) return getFromObject(from, path);
    const reader = ({ data }: ParserContext) => getFromObject(data, path);
    Object.defineProperty(reader, 'toString', { value: () => `__get:${path}__` });
    return reader;
  }
  // Engine contract: return the raw value and carry the token as `_cast` — the parser casts it like a token at the key
  const reader = ((context?: ParserContext) => getFromObject(from ?? context?.data ?? {}, path)) as unknown as GetValue<unknown>;
  let hash: string | undefined;
  Object.defineProperties(reader, {
    _cast: { value: type },
    toString: { value: () => (hash ??= `__get:${path}:${type.id}${from ? `:${toHash(from)}` : ''}__`) },
  });
  if (from) {
    // Awaited standalone: cast against a root context, throwing on failure like `.cast()`
    let standalone: Promise<unknown> | undefined;
    const run = () => (standalone ??= getFromObject(from, path).then((raw) => applyCast(raw, type)));
    Object.defineProperty(reader, 'then', {
      value: (onfulfilled?: ((value: unknown) => unknown) | null, onrejected?: ((reason: unknown) => unknown) | null) => run().then(onfulfilled, onrejected),
    });
  }
  return reader;
}

/**
 * Merges multiple objects into one.
 * It combines the properties of the objects, handling arrays and nested objects.
 * @param base - The base object to merge into.
 * @param objects - The objects to merge with the base schema.
 * @returns A new object that combines the base object with the provided objects.
 */
const isPlainObject = (value: unknown): value is AppObject => {
  if (typeof value !== 'object' || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

export const mergeObjects = <T = AppObject>(...objects: (AppObject | undefined)[]): T => {
  return objects
    .filter((obj) => obj !== undefined)
    .reduce((acc, object) => {
      Object.entries(object).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          if (!Array.isArray(acc[key])) acc[key] = [];
          acc[key] = [...acc[key], ...value];
        } else if (isPlainObject(value)) {
          acc[key] = mergeObjects(acc[key] || {}, value);
        } else {
          // Class instances (type tokens, Date, URL, ...) are atomic — recursing would strip their prototype
          acc[key] = value;
        }
      });
      return acc;
    }, {} as AppObject);
};
