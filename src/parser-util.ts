/* eslint-disable @typescript-eslint/no-explicit-any */
import { AppObject, ParserCondition, ParserFunction, ParserProjection } from './parser-types';

export const asyncMapObject = async <T>(object: T, callback: (value: any) => any): Promise<T> => {
  if (!object || typeof object !== 'object') return object;
  return Object.entries(object).reduce(async (acc, [key, value]) => {
    const awaited = await acc;
    const result = await callback(value);
    awaited[key] = result;
    return awaited;
  }, Promise.resolve(object) as Promise<AppObject>);
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
