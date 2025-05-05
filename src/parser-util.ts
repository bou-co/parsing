/* eslint-disable @typescript-eslint/no-explicit-any */
import { getFromObject } from './internal';
import { AppObject, ParserCondition, ParserContext, ParserFunction, ParserProjection } from './parser-types';

export const asyncMapObject = async <T>(object: T, callback: (value: any) => any): Promise<T> => {
  if (!object || typeof object !== 'object') return object;
  return Object.entries(object).reduce(
    async (acc, [key, value]) => {
      const awaited = await acc;
      const copy: Record<any, any> = Array.isArray(awaited) ? [...awaited] : { ...awaited };
      const result = await callback(value);
      copy[key] = result;
      return copy;
    },
    Promise.resolve(object) as Promise<Record<any, any>>,
  );
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
export const condition = <T extends ParserProjection | ParserFunction<any>>(when: ParserCondition, then: T) => ({ when, then });

export const get = <T>(path: string) => {
  return ({ data }: ParserContext) => getFromObject(data, path) as T;
};
