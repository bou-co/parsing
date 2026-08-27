/* eslint-disable @typescript-eslint/no-explicit-any */
import { getFromObject } from './internal';
import { AppObject, ParserCondition, ParserContext, ParserFunction, ParserProjection } from './parser-types';

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

export function get<T = unknown>(path: string, from: AppObject): Promise<T>;
export function get<T = unknown>(path: string): (context: ParserContext) => Promise<T>;

export function get<T = unknown>(path: string, from?: AppObject) {
  if (from) return getFromObject(from, path) as Promise<T>;
  return ({ data }: ParserContext) => getFromObject(data, path) as Promise<T>;
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
