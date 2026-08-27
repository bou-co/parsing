/* eslint-disable @typescript-eslint/no-explicit-any */
import type { CastFunction } from '../type-token';
import { installMembers, isTypeToken, TypeToken, UNIVERSAL_MEMBERS } from '../type-token';
import { any } from './any';
import { array } from './array';
import { boolean } from './boolean';
import { date } from './date';
import { number } from './number';
import { object } from './object';
import { string } from './string';
import { unknown } from './unknown';
import { text } from './text';
import { email } from './email';
import { url } from './url';
import { slug } from './slug';
import { color } from './color';
import { tel } from './tel';
import { mimeType } from './mime-type';
import { json } from './json';
import { unique } from './unique';
import { oneOf } from './one-of';
import { pattern } from './pattern';
import { notAPipe, type ParserTypeFactory } from './namespace-marker';

export { notAPipe, type ParserTypeFactory };

const builtInTypes = { string, number, boolean, date, object, array, any, unknown, text, email, url, slug, color, tel, mimeType, json, unique, oneOf, pattern };

// TODO(v4): remove migration catch — non-enumerable so spreads and enumeration never trigger it
Object.defineProperty(builtInTypes, 'undefined', {
  enumerable: false,
  get: () => {
    throw new Error('[@bou-co/parsing] There is no types.undefined in v3 — use the `optional` util or omit the key');
  },
});

/** The tier-1 namespace: every built-in token, no registration, no dependencies */
export const types = Object.freeze(builtInTypes);

export type DefaultParserTypes = typeof types;

// ---- Registration

/** Accessors added onto an existing family: `{ date: { relative: (value: Date) => string } }` */
export type ParserTypeAccessorMap = Record<string, CastFunction<any, any>>;

/** Per-name: a token or factory to register (replacing a same-named one), or an accessor map extending the existing family */
export type ParserTypesConfig = Record<string, TypeToken | ParserTypeFactory | ParserTypeAccessorMap>;

/** The merged namespace available on a context: tokens and factories only */
export type ParserTypesNamespace = Record<string, TypeToken | ParserTypeFactory>;

type AccessorResults<A> = { [P in keyof A]: A[P] extends (...args: any) => infer R ? Awaited<R> : never };

/** Namespace type after registering `T` on top of `Base` */
export type RegisteredTypes<Base, T> = Omit<Base, keyof T> & {
  readonly [K in keyof T]: T[K] extends TypeToken | ParserTypeFactory
    ? T[K]
    : K extends keyof Base
      ? Base[K] & { readonly [P in keyof AccessorResults<T[K]>]: TypeToken<AccessorResults<T[K]>[P]> }
      : never;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

// Same family, same identity, extra accessors — used for `{ date: { relative } }` registrations
const extendedCache = new WeakMap<TypeToken, WeakMap<object, TypeToken>>();
const withAccessors = (token: TypeToken, accessors: ParserTypeAccessorMap): TypeToken => {
  let perToken = extendedCache.get(token);
  if (!perToken) extendedCache.set(token, (perToken = new WeakMap()));
  let extended = perToken.get(accessors);
  if (!extended) {
    const Extended = class extends (token.constructor as typeof TypeToken) {};
    installMembers(Extended.prototype, accessors);
    extended = Object.create(Extended.prototype) as TypeToken;
    Object.defineProperty(extended, '_state', { value: { ...token._state }, writable: true, configurable: true, enumerable: false });
    perToken.set(accessors, extended);
  }
  return extended;
};

const warnedLayers = new WeakSet<object>();

const mergeLayer = (base: ParserTypesNamespace, layer: ParserTypesConfig): ParserTypesNamespace => {
  const result: ParserTypesNamespace = { ...base };
  const warn = !warnedLayers.has(layer);
  for (const [name, entry] of Object.entries(layer)) {
    if (entry === undefined) continue;
    if (isTypeToken(entry) || typeof entry === 'function') {
      if (warn && name in types && (types as Record<string, unknown>)[name] !== entry) {
        console.warn(`[@bou-co/parsing] Type "${name}" overrides the built-in type of the same name`);
      }
      result[name] = entry;
      continue;
    }
    if (!isPlainObject(entry)) throw new Error(`[@bou-co/parsing] types.${name}: expected a type token, a factory function or an accessor map`);
    const existing = result[name];
    if (!isTypeToken(existing)) {
      throw new Error(`[@bou-co/parsing] types.${name}: an accessor map extends an existing type — register a token (defineType) to add a new type`);
    }
    result[name] = withAccessors(existing, entry as ParserTypeAccessorMap);
  }
  warnedLayers.add(layer);
  return result;
};

// Merges are memoised by (base, layer) identity so per-level parses never rebuild a namespace
const mergeCache = new WeakMap<object, WeakMap<object, ParserTypesNamespace>>();
const mergeOne = (base: ParserTypesNamespace, layer: ParserTypesConfig | ParserTypesNamespace): ParserTypesNamespace => {
  if (layer === base) return base;
  let perBase = mergeCache.get(base);
  if (!perBase) mergeCache.set(base, (perBase = new WeakMap()));
  let merged = perBase.get(layer);
  if (!merged) perBase.set(layer, (merged = mergeLayer(base, layer)));
  return merged;
};

/** Layer registrations onto a namespace: tokens and factories replace, accessor maps extend. Returns `base` by reference when nothing is layered */
export const mergeTypes = (base: ParserTypesNamespace, ...layers: (ParserTypesConfig | ParserTypesNamespace | undefined)[]): ParserTypesNamespace => {
  let result = base;
  for (const layer of layers) if (layer) result = mergeOne(result, layer);
  return result;
};

// ---- Pipe resolution

interface RootEntry {
  token: TypeToken;
  proto: object;
}

// Universal members reachable from a pipe chain (`email.loose`, `email.default:"x"`); the rest are implementation
const WALKABLE_UNIVERSAL = new Set(['strict', 'loose', 'default', 'required']);
const NON_WALKABLE = new Set([...UNIVERSAL_MEMBERS].filter((member) => !WALKABLE_UNIVERSAL.has(member)));

// Prototypes of the built-in families — collisions purely among these (string/array `length`) are by design and stay silent
const builtInProtos = new Set<object>();
for (const token of Object.values(types)) {
  let proto = Object.getPrototypeOf(token);
  while (proto && proto !== TypeToken.prototype) {
    builtInProtos.add(proto);
    proto = Object.getPrototypeOf(proto);
  }
}

const findDescriptor = (target: object, member: string): PropertyDescriptor | undefined => {
  let current: object | null = target;
  while (current && current !== Object.prototype) {
    const descriptor = Object.getOwnPropertyDescriptor(current, member);
    if (descriptor) return descriptor;
    current = Object.getPrototypeOf(current);
  }
  return undefined;
};

const protoDepth = (token: TypeToken): number => {
  let depth = 0;
  let proto = Object.getPrototypeOf(token);
  while (proto && proto !== TypeToken.prototype) {
    depth++;
    proto = Object.getPrototypeOf(proto);
  }
  return depth;
};

// Accessor name → owning base token, built from prototype descriptors without invoking any getter.
// A name declared by two different families gets no root form (qualified names still work).
const buildRootIndex = (namespace: ParserTypesNamespace): Map<string, RootEntry> => {
  const index = new Map<string, RootEntry>();
  const collisions = new Map<string, boolean>();
  const tokens = Object.values(namespace)
    .filter(isTypeToken)
    .sort((a, b) => protoDepth(a) - protoDepth(b));
  for (const token of tokens) {
    let proto = Object.getPrototypeOf(token);
    while (proto && proto !== TypeToken.prototype) {
      for (const member of Object.getOwnPropertyNames(proto)) {
        if (member === 'constructor' || member.startsWith('_') || NON_WALKABLE.has(member)) continue;
        const existing = index.get(member);
        if (!existing) index.set(member, { token, proto });
        else if (existing.proto !== proto)
          collisions.set(member, (collisions.get(member) ?? false) || !builtInProtos.has(proto) || !builtInProtos.has(existing.proto));
      }
      proto = Object.getPrototypeOf(proto);
    }
  }
  for (const [member, registered] of collisions) {
    index.delete(member);
    if (registered)
      console.warn(`[@bou-co/parsing] Accessor "${member}" is declared by more than one type — use the qualified pipe name (e.g. "string.${member}")`);
  }
  return index;
};

const rootIndexCache = new WeakMap<ParserTypesNamespace, Map<string, RootEntry>>();
const getRootIndex = (namespace: ParserTypesNamespace): Map<string, RootEntry> => {
  let index = rootIndexCache.get(namespace);
  if (!index) rootIndexCache.set(namespace, (index = buildRootIndex(namespace)));
  return index;
};

/**
 * Resolve a pipe name against the type namespace: `email`, `oneOf:"a":"b"` (factory), `date.iso`,
 * `url.base:"https://x"` (qualified, params go to the last member) or the root accessor form
 * `upperCase` (= `string.upperCase`). Returns undefined when the name is not a type.
 */
export const resolveTypePipe = (name: string, params: unknown[], namespace: ParserTypesNamespace | undefined): TypeToken | undefined => {
  if (!namespace) return undefined;
  const [head, ...rest] = name.split('.');
  let entry: unknown = Object.hasOwn(namespace, head) ? namespace[head] : undefined;
  let members = rest;
  // Token-taking factories (`unique(item)`) cannot take template literals — their name may still be a root accessor (`array.unique`)
  const tokenFactory = typeof entry === 'function' && !isTypeToken(entry) && (entry as { _pipe?: boolean })._pipe === false;
  if (typeof entry === 'function' && !isTypeToken(entry) && !tokenFactory) {
    if (members.length) throw new Error(`[@bou-co/parsing] Type "${head}" is parameterised — call it before accessing members ("${head}:params")`);
    return (entry as ParserTypeFactory)(...params);
  }
  if (entry === undefined || tokenFactory) {
    const root = getRootIndex(namespace).get(head);
    if (!root) {
      if (tokenFactory) throw new Error(`[@bou-co/parsing] Type "${head}" takes type tokens as parameters and cannot be used as a pipe`);
      return undefined;
    }
    entry = root.token;
    members = [head, ...rest];
  }
  let current: unknown = entry;
  members.forEach((member, index) => {
    if (!isTypeToken(current)) throw new Error(`[@bou-co/parsing] Type pipe "${name}": "${member}" cannot be read from a non-type value`);
    if (member.startsWith('_') || NON_WALKABLE.has(member)) throw new Error(`[@bou-co/parsing] Type pipe "${name}": "${member}" is not an accessor`);
    const descriptor = findDescriptor(current, member);
    if (!descriptor) throw new Error(`[@bou-co/parsing] Type pipe "${name}": "${current.name}" has no accessor "${member}"`);
    const last = index === members.length - 1;
    if (typeof descriptor.value === 'function') {
      current = (current as any)[member](...(last ? params : []));
    } else {
      if (last && params.length) throw new Error(`[@bou-co/parsing] Type pipe "${name}": "${member}" takes no parameters`);
      current = (current as any)[member];
    }
  });
  return isTypeToken(current) ? current : undefined;
};
