/* eslint-disable @typescript-eslint/no-explicit-any */
import { getFromObject, isPlainObject } from './internal';
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
import { evaluateVariableExpression } from './parser-patterns';
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

// The reader returns the raw value and carries the token as `_cast`, so the parser casts it like a token at the key
const withCast = <F extends (context: ParserContext) => unknown>(reader: F, type: TypeToken, hashBase: string, hashSuffix?: () => string) => {
  let hash: string | undefined;
  Object.defineProperties(reader, {
    _cast: { value: type },
    toString: { value: () => (hash ??= `${hashBase}:${type.id}${hashSuffix?.() ?? ''}__`) },
  });
  return reader;
};

export function get<T = unknown>(path: string): (context: ParserContext) => Promise<T>;
export function get<T extends TypeToken>(path: string, type: T): GetValueFunction<GetOutput<T>> & GetDefaulted<T>;
export function get<T = unknown>(path: string, from: AppObject): Promise<T>;
export function get<T extends TypeToken>(path: string, from: AppObject, type: T): GetValue<GetOutput<T>> & GetDefaulted<T>;

/** Pick a nested value by dot path from `context.data` or an explicit object; with a type token the engine casts it like a token at the key */
export function get(path: string, fromOrType?: AppObject | TypeToken, maybeType?: TypeToken): any {
  const type = isTypeToken(fromOrType) ? fromOrType : maybeType;
  const from = isTypeToken(fromOrType) ? undefined : fromOrType;
  if (!type) {
    if (from) return getFromObject(from, path);
    const reader = ({ data }: ParserContext) => getFromObject(data, path);
    Object.defineProperty(reader, 'toString', { value: () => `__get:${path}__` });
    return reader;
  }
  const reader = withCast(
    (context?: ParserContext) => getFromObject(from ?? context?.data ?? {}, path),
    type,
    `__get:${path}`,
    () => (from ? `:${toHash(from)}` : ''),
  );
  if (from) {
    // Awaited standalone it throws on failure like `.cast()`
    let standalone: Promise<unknown> | undefined;
    const run = () => (standalone ??= getFromObject(from, path).then((raw) => applyCast(raw, type)));
    Object.defineProperty(reader, 'then', {
      value: (onfulfilled?: ((value: unknown) => unknown) | null, onrejected?: ((reason: unknown) => unknown) | null) => run().then(onfulfilled, onrejected),
    });
  }
  return reader;
}

/** Cast any projection value through a type token in the engine: `title: value('{{myVariable}}', types.string.required)` */
export function value<T extends TypeToken>(input: unknown, type: T): GetValueFunction<GetOutput<T>> & GetDefaulted<T> {
  const callable = typeof input === 'function' && !isTypeToken(input) && !('_parser' in input);
  const reader = async (context: ParserContext) => (callable ? (input as (context: ParserContext) => unknown)(context) : input);
  return withCast(reader, type, `__value:${toHash(input)}`) as unknown as GetValueFunction<GetOutput<T>> & GetDefaulted<T>;
}

export function variable<T extends TypeToken>(expression: string, type: T): GetValueFunction<GetOutput<T>> & GetDefaulted<T>;
export function variable<T = unknown>(expression: string): (context: ParserContext) => Promise<T>;

/** Resolve what goes inside the variable delimiters (`'user.name || "Anonymous" | upperCase'`), optionally cast like `value` */
export function variable(expression: string, type?: TypeToken): any {
  const reader = (context: ParserContext) => evaluateVariableExpression(expression, context);
  if (type) return withCast(reader, type, `__variable:${expression}`);
  Object.defineProperty(reader, 'toString', { value: () => `__variable:${expression}__` });
  return reader;
}

/**
 * Merges multiple objects into one.
 * It combines the properties of the objects, handling arrays and nested objects.
 * @param base - The base object to merge into.
 * @param objects - The objects to merge with the base schema.
 * @returns A new object that combines the base object with the provided objects.
 */
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
          // Recursing into class instances (type tokens, Date, URL, ...) would strip their prototype
          acc[key] = value;
        }
      });
      return acc;
    }, {} as AppObject);
};
