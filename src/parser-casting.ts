// Casting runtime re-exports (the primitive lives in type-token.ts, the built-in families in types/) plus the v2 migration catches
import type { ParserContext } from './parser-types';
import { buildKeyPath, TypeToken } from './type-token';

export { applyCast, buildKeyPath, defineType, isTypeToken, ParserCastError, TypeToken } from './type-token';
export type { ApplyCastOptions, CastFunction, ParserTypeDefaulted, TypeTokenPolicy } from './type-token';
export { types } from './types/namespace';

/** @deprecated use `TypeToken` */
export type ParserTypeToken = TypeToken;

// TODO(v4): remove migration catch (and its call site in parser.ts)
export const legacyTypeKeys = ['string', 'number', 'boolean', 'date', 'object', 'array', 'any', 'unknown', 'undefined'] as const;

export const assertNotLegacyTypeKey = (value: string, context: ParserContext): void => {
  const isArrayKey = /^array<.+>$/i.test(value);
  if (!isArrayKey && !(legacyTypeKeys as readonly string[]).includes(value)) return;
  const hint =
    value === 'undefined' ? 'use the `optional` util or omit the key' : isArrayKey ? 'use `types.array.of(types.x)` instead' : `use \`types.${value}\` instead`;
  throw new Error(
    `[@bou-co/parsing] Legacy type string '${value}' at "${buildKeyPath(context)}" is not supported in v3 — ${hint}. Other string values still work as constants.`,
  );
};
