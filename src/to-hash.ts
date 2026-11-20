import { hashReplacer, toAlphabeticName, toPhash } from './internal';

/**
 * Create unique hash string from any value
 */
export const toHash = (value: unknown): string => {
  if (!value) return toHash('undefined');
  const asString = JSON.stringify(value, hashReplacer);
  const numericHash = toPhash(5381, JSON.stringify(asString)) >>> 0;
  return toAlphabeticName(numericHash);
};
