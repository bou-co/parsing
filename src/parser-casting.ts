/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  DefaultParserTypes,
  ParserContext,
  ParserType,
  ParserTypeDefinition,
  ParserTypeFunction,
  ParserTypeObject,
  ParserTypeWithDefault,
} from './parser-types';
import { toHash } from './to-hash';

export interface ParserTypeToken {
  (...args: unknown[]): unknown;
  _type: string;
  _id: string;
  _name?: string;
  _fn?: ParserTypeFunction;
  _typeItem?: ParserTypeToken;
  _default?: unknown;
  strict?: boolean;
}

export const isTypeToken = (value: unknown): value is ParserTypeToken => value instanceof Function && '_type' in value;

const describeToken = (token: ParserTypeToken): string => {
  if (token._typeItem) return `${token._type}<${describeToken(token._typeItem)}>`;
  return token._name || token._type;
};

export const buildKeyPath = (context: Partial<ParserContext>): string => {
  const keys: PropertyKey[] = [];
  let current: Partial<ParserContext> | undefined = context;
  while (current) {
    if (current.key !== undefined) keys.unshift(current.key);
    current = current.parent;
  }
  return keys.map(String).join('.') || '<root>';
};

const arrayTokenCache = new WeakMap<ParserTypeToken, ParserTypeToken>();

interface TypeTokenOptions {
  fn: ParserTypeFunction;
  itemType?: ParserTypeToken;
  strict?: boolean;
  name?: string;
  default?: unknown;
}

const createTypeToken = (name: string, options: TypeTokenOptions): ParserTypeToken => {
  const token = ((arg?: unknown) => {
    if (isTypeToken(arg)) {
      if (name !== 'array') throw new Error(`Parser type "${name}" does not accept arguments`);
      let derived = arrayTokenCache.get(arg);
      if (!derived) arrayTokenCache.set(arg, (derived = createTypeToken('array', { fn: options.fn, itemType: arg })));
      return derived;
    }
    if (arg && typeof arg === 'object' && 'default' in arg) {
      return createTypeToken(name, { ...options, default: (arg as { default: unknown }).default });
    }
    if (name === 'array') throw new Error('types.array(...) expects a type token or an options object');
    throw new Error(`Parser type "${name}" does not accept arguments`);
  }) as ParserTypeToken;
  Object.defineProperty(token, '_type', { value: name });
  Object.defineProperty(token, '_fn', { value: options.fn });
  if (options.itemType) Object.defineProperty(token, '_typeItem', { value: options.itemType });
  if (options.strict !== undefined) Object.defineProperty(token, 'strict', { value: options.strict });
  if (options.name) Object.defineProperty(token, '_name', { value: options.name });
  if (options.default !== undefined) Object.defineProperty(token, '_default', { value: options.default });

  // Content-derived identity: deterministic across restarts (persistent cache keys stay stable) and sensitive to implementation changes (edited custom types invalidate old cache entries)
  const { itemType, fn, strict } = options;
  const baseId = itemType ? `array<${itemType._id}>` : name === 'custom' ? `custom:${options.name ?? ''}:${strict ? 'strict' : ''}:${fn.toString()}` : name;
  const id = options.default !== undefined ? `${baseId}{default:${toHash(options.default)}}` : baseId;

  Object.defineProperty(token, '_id', { value: id });

  // toHash stringifies functions via toString — tokens must hash by their identity, not factory source
  Object.defineProperty(token, 'toString', { value: () => `__parserType:${id}__` });
  return token;
};

export const types: DefaultParserTypes = Object.freeze({
  string: createTypeToken('string', {
    fn: (value) => {
      if (typeof value === 'string') return value;
      if (typeof value === 'number' && Number.isFinite(value)) return String(value);
      if (typeof value === 'boolean') return String(value);
      if (value instanceof Date && !isNaN(value.getTime())) return value.toISOString();
      throw new Error('Invalid string');
    },
  }),
  number: createTypeToken('number', {
    fn: (value) => {
      if (typeof value === 'number') return value;
      if (typeof value === 'boolean') return value ? 1 : 0;
      if (value instanceof Date) {
        const time = value.getTime();
        if (!Number.isNaN(time)) return time;
        throw new Error('Invalid number');
      }
      if (typeof value === 'string') {
        const trimmed = value.trim();
        const parsed = Number(trimmed);
        if (trimmed !== '' && !Number.isNaN(parsed)) return parsed;
      }
      throw new Error('Invalid number');
    },
  }),
  boolean: createTypeToken('boolean', {
    fn: (value) => {
      if (typeof value === 'boolean') return value;
      if (value === 1) return true;
      if (value === 0) return false;
      if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true') return true;
        if (normalized === 'false') return false;
      }
      throw new Error('Invalid boolean');
    },
  }),
  date: createTypeToken('date', {
    fn: (value) => {
      if (value instanceof Date) {
        if (!isNaN(value.getTime())) return value;
        throw new Error('Invalid date');
      }
      if (typeof value === 'string' || typeof value === 'number') {
        const date = new Date(value);
        if (!isNaN(date.getTime())) return date;
      }
      throw new Error('Invalid date');
    },
  }),
  object: createTypeToken('object', {
    fn: (value) => {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) return value;
      throw new Error('Invalid object');
    },
  }),
  array: createTypeToken('array', {
    fn: (value) => {
      if (Array.isArray(value)) return value;
      throw new Error('Invalid array');
    },
  }),
  any: createTypeToken('any', { fn: (value) => value }),
  unknown: createTypeToken('unknown', { fn: (value) => value }),
}) as unknown as DefaultParserTypes;

export function defineType<Out>(definition: ParserTypeObject<Out> & { default: Out }): ParserTypeWithDefault<Out>;
export function defineType<Out>(definition: ParserTypeDefinition<Out>): ParserType<Out>;
export function defineType<Out>(definition: ParserTypeDefinition<Out>): ParserType<Out> {
  const def = typeof definition === 'function' ? { fn: definition } : definition;
  return createTypeToken('custom', { fn: def.fn as ParserTypeFunction, strict: def.strict, name: def.name, default: def.default }) as unknown as ParserType<Out>;
}

export class ParserCastError extends Error {
  readonly type: string;
  readonly key?: PropertyKey;
  readonly path: string;
  readonly received: unknown;
  readonly cause?: unknown;

  constructor(cause: unknown, received: unknown, token: ParserTypeToken, context: ParserContext) {
    const type = describeToken(token);
    const path = buildKeyPath(context);
    const causeMessage = cause instanceof Error ? cause.message : undefined;
    super(`Parser cast error at "${path}": cannot cast value to "${type}"${causeMessage ? ` — ${causeMessage}` : ''}`);
    this.name = 'ParserCastError';
    this.type = type;
    this.key = context.key;
    this.path = path;
    this.received = received;
    this.cause = cause;
  }
}

const handleFailure = (error: unknown, value: unknown, token: ParserTypeToken, context: ParserContext, strict: boolean) => {
  const castError = new ParserCastError(error, value, token, context);
  context.onCastError?.(castError, context);
  if (strict) throw castError;
  const loose = context.looseCasting ?? false;
  if (loose === 'undefined') return token._default;
  if (loose === true) {
    if (!context.onCastError) {
      console.warn(`[@bou-co/parsing] Cast to "${describeToken(token)}" failed at "${buildKeyPath(context)}" — passing original value`, value);
    }
    return value;
  }
  throw castError;
};

const runCast = async (value: unknown, def: ParserTypeObject, token: ParserTypeToken, context: ParserContext) => {
  try {
    return await def.fn(value, context);
  } catch (error) {
    return handleFailure(error, value, token, context, def.strict === true);
  }
};

export const applyCast = async (value: unknown, token: ParserTypeToken, context: ParserContext): Promise<unknown> => {
  // Missing values skip casting so fields stay optional — unless the token carries a default
  if (value === undefined || value === null) return token._default;

  // Array tokens are structural: validate + optionally cast each item
  if (token._type === 'array') {
    if (!Array.isArray(value)) return handleFailure(new Error('Invalid array'), value, token, context, token.strict === true);
    const itemType = token._typeItem;
    if (!itemType) return value;
    return Promise.all(value.map((item, index) => applyCast(item, itemType, { ...context, key: index, index, parent: context })));
  }

  if (!token._fn) throw new Error(`Parser type "${describeToken(token)}" is missing an implementation`);
  return runCast(value, { fn: token._fn, strict: token.strict }, token, context);
};

export const legacyTypeKeys = ['string', 'number', 'boolean', 'date', 'object', 'array', 'any', 'unknown', 'undefined'] as const;

export const assertNotLegacyTypeKey = (value: string, context: ParserContext): void => {
  const isArrayKey = /^array<.+>$/i.test(value);
  if (!isArrayKey && !(legacyTypeKeys as readonly string[]).includes(value)) return;
  const hint =
    value === 'undefined' ? 'use the `optional` util or omit the key' : isArrayKey ? 'use `types.array(types.x)` instead' : `use \`types.${value}\` instead`;
  throw new Error(
    `[@bou-co/parsing] Legacy type string '${value}' at "${buildKeyPath(context)}" is not supported in v3 — ${hint}. Other string values still work as constants.`,
  );
};
