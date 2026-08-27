/* eslint-disable @typescript-eslint/no-explicit-any */
import { PARSER_TYPE_DEFAULTED, PARSER_TYPE_OUTPUT } from './parser-types';
import type { ParserContext, ParserTypeFunction } from './parser-types';
import { toHash } from './to-hash';

/**
 * The casting primitive. A token is an instance of `TypeToken` or one of its subclasses (the
 * "families": `StringType`, `NumberType`, ...) carried by a function object, so a token can be
 * configured either by chaining (`types.string.default('x')`) or by calling it with an options
 * object (`types.string({ default: 'x' })`) — both produce the same token. Every token carries its
 * casting behaviour (`cast`), an output type at the type level (the `PARSER_TYPE_OUTPUT` phantom),
 * a content-derived `id` used for cache keys, and the universal chain: `default`, `required`,
 * `strict`, `loose`, `extend`, `to`.
 *
 * Missing data is normal: `undefined`, `null` and `''` (never `false` or `0`) skip the cast and
 * leave the key out (or take the default). Only a present value that does not fit fails, unless
 * the token is `required`.
 *
 * Accessor rules for families (from the casting spec): accessors are nouns describing the output,
 * predictable without docs, shipped as whole families, and inherited uniformly by every subclass.
 * No-parameter accessors are getters (`types.date.iso`); parameterised ones are methods that are
 * always called (`types.number.round(2)`). A transform keeps the family (`this`), a derivation
 * returns a base `TypeToken` of the new output.
 */

export type CastFunction<In = unknown, Out = unknown> = (value: In, context: ParserContext) => Out | Promise<Out>;

/** What a `cast` may return: the value, or `undefined` meaning "treat as missing" (the token default then applies) */
export type CastResult<Out> = Out | undefined | Promise<Out | undefined>;

export type TypeTokenPolicy = 'strict' | 'loose';

/** Type-level marker carried by tokens with a default (or marked required) — makes the projected field non-optional */
export interface ParserTypeDefaulted {
  readonly [PARSER_TYPE_DEFAULTED]: true;
}

export type ParserTypeRequired = ParserTypeDefaulted;

/** Options accepted when calling a token: `types.string({ default: 'x', required: true })` */
export interface TypeTokenOptions<Out = any> {
  /** Value used whenever the cast pipeline yields `undefined` — makes the field non-optional */
  default?: Out;
  /** Fail when the value is missing (`undefined`, `null`, `''`) instead of omitting the key */
  required?: boolean;
  /** Always throw on failure */
  strict?: boolean;
  /** Never throw on failure: the value becomes `undefined` (then the default), silently */
  loose?: boolean;
}

type NonOptionalOptions<Out> = TypeTokenOptions<Out> & ({ default: Out } | { required: true });

/** `undefined`, `null` and the empty string count as missing — `false` and `0` are values */
export const isMissing = (value: unknown): boolean => value === undefined || value === null || value === '';

export interface TypeTokenInit {
  /** Family brand (`'string'`, `'custom'`, ...) — defaults to the nearest built-in family or `'custom'` */
  type?: string;
  /** Display name used in cast errors */
  name?: string;
  /** Casting implementation for tokens that do not override `cast` */
  fn?: CastFunction<any, any>;
}

interface DerivedInfo {
  parent: TypeToken;
  key: string;
  params: unknown[];
  source: string;
}

export interface TypeTokenState {
  type: string;
  name: string;
  /** Explicit base id (built-in families use their name) */
  base?: string;
  fn?: CastFunction<any, any>;
  default?: unknown;
  required?: boolean;
  policy?: TypeTokenPolicy;
  derived?: DerivedInfo;
  /** Item token of parameterised arrays */
  item?: TypeToken;
  /** Family-specific configuration (`url.base`, `oneOf` values, ...) — part of the identity */
  options?: Record<string, unknown>;
  id?: string;
}

const FAMILY_KEY = 'family';

const ROOT_CONTEXT = {} as ParserContext;

const defineHidden = (target: object, key: string, value: unknown) => {
  Object.defineProperty(target, key, { value, writable: true, configurable: true, enumerable: false });
};

const ownFamily = (ctor: unknown): string | undefined =>
  typeof ctor === 'function' && Object.hasOwn(ctor, FAMILY_KEY) ? String((ctor as unknown as { family: string }).family) : undefined;

// Nearest built-in family up the constructor chain
const familyOf = (ctor: unknown): string | undefined => {
  let current: any = ctor;
  while (current && current !== Function.prototype) {
    const family = ownFamily(current);
    if (family) return family;
    current = Object.getPrototypeOf(current);
  }
  return undefined;
};

export const isTypeToken = (value: unknown): value is TypeToken =>
  value instanceof TypeToken ||
  // Structural fallback for tokens created by another copy of the library (dual package builds)
  ((typeof value === 'object' || typeof value === 'function') &&
    value !== null &&
    '_type' in value &&
    typeof (value as { cast?: unknown }).cast === 'function');

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

// The function object that carries a token: calling it applies an options object. Its own
// `name`/`length` are removed so the prototype getters win
const createCarrier = <T extends TypeToken>(proto: object): T => {
  const carrier = ((options?: unknown) => configure(carrier, options)) as unknown as T;
  Object.setPrototypeOf(carrier, proto);
  delete (carrier as { name?: unknown }).name;
  delete (carrier as { length?: unknown }).length;
  return carrier;
};

const configure = (token: TypeToken, options: unknown): TypeToken => {
  if (isTypeToken(options))
    throw new Error(`[@bou-co/parsing] ${token.name}(...): types are not parameters — use .of(${options.name}) or .to(${options.name})`);
  if (options !== null && typeof options === 'object' && 'parser' in options) {
    throw new Error(
      `[@bou-co/parsing] Type "${token.name}" was called as a value function or pipe — register types under \`types\`, not \`variables\` or \`pipes\``,
    );
  }
  if (options === undefined) return token;
  if (!isPlainObject(options)) throw new Error(`[@bou-co/parsing] ${token.name}(...): expected an options object ({ default, required, strict, loose })`);
  const { default: defaultValue, required, strict, loose } = options as TypeTokenOptions;
  if (strict && loose) throw new Error(`[@bou-co/parsing] ${token.name}(...): a type cannot be both strict and loose`);
  const patch: Partial<TypeTokenState> = {};
  if (defaultValue !== undefined) patch.default = defaultValue;
  if (required !== undefined) patch.required = required;
  if (strict) patch.policy = 'strict';
  if (loose) patch.policy = 'loose';
  return token['clone'](patch);
};

// Call signatures live on the merged interface: an options object configures the token in place of the chain
export interface TypeToken<Out = any> {
  (options: NonOptionalOptions<Out>): this & ParserTypeDefaulted;
  (options?: TypeTokenOptions<Out>): this;
}

export class TypeToken<Out = any> {
  /** Type-level phantom carrying the output type — never present at runtime */
  declare readonly [PARSER_TYPE_OUTPUT]: Out;
  /** @internal */
  declare readonly _state: TypeTokenState;
  /** @internal */
  declare readonly _memo?: Map<string, TypeToken>;

  constructor(init: TypeTokenInit = {}) {
    const ctor = new.target;
    const builtIn = ownFamily(ctor);
    const type = init.type ?? familyOf(ctor) ?? 'custom';
    const name = init.name ?? (builtIn ? builtIn : ctor.name || type);
    const state: TypeTokenState = { type, name, fn: init.fn };
    if (builtIn) state.base = builtIn;
    // The instance is a function object so the token is callable — `this` inside subclass constructors is this carrier
    const token = createCarrier<this>(ctor.prototype);
    defineHidden(token, '_state', state);
    return token;
  }

  /** Family brand — kept so `'_type' in value` guards keep working */
  get _type(): string {
    return this._state.type;
  }

  /** Display name, shown in `ParserCastError` */
  get name(): string {
    return this._state.name;
  }

  /** Content-derived identity: stable across restarts, sensitive to implementation changes */
  get id(): string {
    return (this._state.id ??= computeId(this));
  }

  /** The current default value, if any */
  get defaultValue(): Out | undefined {
    return this._state.default as Out | undefined;
  }

  /** Whether a missing value (`undefined`, `null`, `''`) fails instead of being omitted */
  get isRequired(): boolean {
    return this._state.required === true;
  }

  /** Failure policy pinned on this token (`strict` / `loose`), if any */
  get policy(): TypeTokenPolicy | undefined {
    return this._state.policy;
  }

  /**
   * Cast a value. Standalone use throws on failure; inside a parse the engine applies the
   * failure policy around it. Subclasses override this and call `super.cast` for the parent's
   * coercion.
   */
  cast(value: unknown, context?: ParserContext): CastResult<Out> {
    const { fn } = this._state;
    return fn ? fn(value, context ?? ROOT_CONTEXT) : (value as Out);
  }

  /** Value used whenever the cast pipeline yields `undefined` (missing input, or a failed cast under a non-throwing policy). Makes the field non-optional */
  default(value: Out): this & ParserTypeDefaulted {
    return this.clone({ default: value }) as this & ParserTypeDefaulted;
  }

  /** Fail on a missing value (`undefined`, `null`, `''`) instead of omitting the key. Makes the field non-optional */
  get required(): this & ParserTypeDefaulted {
    return this.memo('required', () => this.clone({ required: true })) as this & ParserTypeDefaulted;
  }

  /** Always throw on failure, whatever the context policy says */
  get strict(): this {
    return this.memo('strict', () => this.clone({ policy: 'strict' }));
  }

  /** Never throw on failure: the value becomes `undefined` (then the default, if any), silently. `onCastError` still fires */
  get loose(): this {
    return this.memo('loose', () => this.clone({ policy: 'loose' }));
  }

  /** Same family, more processing: `fn` receives this token's output and returns the same type */
  extend(fn: CastFunction<Out, Out>): this {
    return deriveTransform(this, 'extend', fn, []) as this;
  }

  /** Derive a new output — from a function (`to((v) => v.length)`), or by composing another token whose family the result keeps (`json.to(types.array.of(types.number))`) */
  to<T extends TypeToken>(next: T): T;
  to<R>(fn: CastFunction<Out, R>): TypeToken<Awaited<R>>;
  to(next: TypeToken | CastFunction<Out, unknown>): TypeToken {
    if (isTypeToken(next)) return this.memo(`to:${next.id}`, () => composeTokens(this, next));
    return deriveValue(this, 'to', next, []);
  }

  toJSON(): string {
    return this.toString();
  }

  toString(): string {
    // toHash stringifies via JSON/toString — tokens hash by their identity, not their source
    return `__parserType:${this.id}__`;
  }

  /** Same-family accessor helper: memoised per member + params, id includes the implementation */
  protected transform(key: string, fn: CastFunction<Out, Out>, params: unknown[] = []): this {
    return this.memo(memoKey(key, params), () => deriveTransform(this, key, fn, params)) as this;
  }

  /** New-output accessor helper: memoised per member + params, id includes the implementation */
  protected derive<R>(key: string, fn: CastFunction<Out, R>, params: unknown[] = []): TypeToken<Awaited<R>> {
    return this.memo(memoKey(key, params), () => deriveValue(this, key, fn, params)) as TypeToken<Awaited<R>>;
  }

  /** Copy of this token (same class, same state) with a state patch */
  protected clone(patch: Partial<TypeTokenState>): this {
    const copy = createCarrier<this>(Object.getPrototypeOf(this));
    defineHidden(copy, '_state', { ...this._state, id: undefined, ...patch });
    return copy;
  }

  protected memo<T extends TypeToken>(key: string, create: () => T): T {
    let map = this._memo;
    if (!map) defineHidden(this, '_memo', (map = new Map()));
    let token = map.get(key);
    if (!token) map.set(key, (token = create()));
    return token as T;
  }
}

/** Members every token has — excluded from accessor discovery (root pipe names) */
export const UNIVERSAL_MEMBERS: ReadonlySet<string> = new Set(Object.getOwnPropertyNames(TypeToken.prototype));

const memoKey = (key: string, params: unknown[]) => (params.length ? `${key}(${toHash(params)})` : key);

// Prototypes between the token and its nearest built-in family that override cast — part of the identity of user subclasses
const collectCastOverrides = (token: TypeToken): string[] => {
  const sources: string[] = [];
  let proto = Object.getPrototypeOf(token);
  while (proto && proto !== TypeToken.prototype) {
    if (ownFamily(proto.constructor)) break;
    if (Object.hasOwn(proto, 'cast')) sources.push(String(proto.cast));
    proto = Object.getPrototypeOf(proto);
  }
  return sources;
};

const computeId = (token: TypeToken): string => {
  const state = token._state;
  let id: string;
  if (state.derived) {
    const { parent, key, params, source } = state.derived;
    id = `${parent.id}.${key}${params.length ? `(${toHash(params)})` : ''}#${toHash(source)}`;
  } else if (state.base) {
    id = state.base;
  } else {
    id = `custom:${state.name}:${toHash([state.fn ? String(state.fn) : '', ...collectCastOverrides(token)])}`;
  }
  if (state.item) id += `<${state.item.id}>`;
  if (state.options) id += `(${toHash(state.options)})`;
  if (state.default !== undefined) id += `{default:${toHash(state.default)}}`;
  if (state.required) id += ':required';
  if (state.policy) id += `:${state.policy}`;
  return id;
};

type TokenClass = typeof TypeToken;

const createDerived = (proto: object, parent: TypeToken, key: string, params: unknown[], source: string, patch: Partial<TypeTokenState> = {}): TypeToken => {
  const token = createCarrier<TypeToken>(proto);
  const derived: DerivedInfo = { parent, key, params, source };
  defineHidden(token, '_state', {
    ...parent._state,
    id: undefined,
    default: undefined,
    name: `${parent.name}.${key}`,
    derived,
    ...patch,
  } satisfies TypeTokenState);
  return token;
};

// Same family: an anonymous subclass whose cast refines the parent's
const deriveTransform = (parent: TypeToken, key: string, fn: CastFunction<any, any>, params: unknown[]): TypeToken => {
  const Derived = class extends (parent.constructor as TokenClass) {
    override async cast(value: unknown, context?: ParserContext) {
      const base = await super.cast(value, context);
      if (base === undefined) return undefined;
      return fn(base, context ?? ROOT_CONTEXT);
    }
  };
  return createDerived(Derived.prototype, parent, key, params, String(fn));
};

// New output: a base token whose cast runs the parent's cast first
const deriveValue = (parent: TypeToken, key: string, fn: CastFunction<any, any>, params: unknown[]): TypeToken => {
  const cast: CastFunction = async (value, context) => {
    const base = await parent.cast(value, context);
    if (base === undefined) return undefined;
    return fn(base, context);
  };
  return createDerived(TypeToken.prototype, parent, key, params, String(fn), { type: 'custom', fn: cast, item: undefined });
};

// Composition: the target's family with the parent's cast as a pre-step
const composeTokens = (parent: TypeToken, target: TypeToken): TypeToken => {
  const Composed = class extends (target.constructor as TokenClass) {
    override async cast(value: unknown, context?: ParserContext) {
      const base = await parent.cast(value, context);
      if (base === undefined) return undefined;
      return super.cast(base, context);
    }
  };
  const token = createCarrier<TypeToken>(Composed.prototype);
  defineHidden(token, '_state', {
    ...target._state,
    id: undefined,
    name: `${parent.name}.to(${target.name})`,
    derived: { parent, key: 'to', params: [], source: target.id },
  } satisfies TypeTokenState);
  return token;
};

// ---- defineType

export type AccessorDefinitions<Out, A> = { [P in keyof A]: (value: Out, context: ParserContext) => A[P] };
export type MethodDefinitions<Out, M> = { [P in keyof M]: M[P] & ((...params: any[]) => (value: Out, context: ParserContext) => unknown) };
export type WithAccessors<A> = { readonly [P in keyof A]: TypeToken<Awaited<A[P]>> };
export type WithMethods<M> = {
  readonly [P in keyof M]: M[P] extends (...params: infer P) => (...args: any) => infer R ? (...params: P) => TypeToken<Awaited<R>> : never;
};
export type DefinedType<E, A, M> = unknown extends A
  ? unknown extends M
    ? E
    : E & WithMethods<M>
  : unknown extends M
    ? E & WithAccessors<A>
    : E & WithAccessors<A> & WithMethods<M>;

export interface DefineTypeCommon<Out> extends TypeTokenOptions<Out> {
  /** Shown in cast errors and part of the cache identity (disambiguates factory-made types sharing one source) */
  name?: string;
}

export interface DefineExtendedType<Out, E, A, M> extends DefineTypeCommon<Out> {
  /** Parent token: its cast runs first and its whole accessor surface is inherited */
  extends: E & TypeToken<Out>;
  /** Refinement applied to the parent's output */
  fn?: CastFunction<Out, Out>;
  /** Property accessors (`types.x.member`) deriving a new value from the cast output */
  accessors?: AccessorDefinitions<Out, A>;
  /** Parameterised accessors (`types.x.member(...params)`): a factory returning the derivation */
  methods?: MethodDefinitions<Out, M>;
}

export interface DefineBaseType<R, A, M> extends DefineTypeCommon<Awaited<R>> {
  fn: (value: unknown, context: ParserContext) => R;
  accessors?: AccessorDefinitions<Awaited<R>, A>;
  methods?: MethodDefinitions<Awaited<R>, M>;
}

export const installMembers = (
  proto: object,
  accessors?: Record<string, CastFunction<any, any>>,
  methods?: Record<string, (...params: any[]) => CastFunction<any, any>>,
) => {
  for (const [key, fn] of Object.entries(accessors ?? {})) {
    Object.defineProperty(proto, key, {
      configurable: true,
      get(this: TypeToken) {
        return this['derive'](key, fn);
      },
    });
  }
  for (const [key, factory] of Object.entries(methods ?? {})) {
    Object.defineProperty(proto, key, {
      configurable: true,
      writable: true,
      value(this: TypeToken, ...params: unknown[]) {
        return this['derive'](key, factory(...params), params);
      },
    });
  }
};

type OutputOf<T> = T extends { readonly [PARSER_TYPE_OUTPUT]: infer Out } ? Out : never;

/**
 * Create a type: from a class (`defineType(EmailType)` — the factory form of `new EmailType()`),
 * from a casting function, or from a definition object. With `extends`, the new type inherits the
 * parent's cast (run first) and its entire accessor surface — `fn` refines the parent's output.
 * `accessors` and `methods` add members of their own.
 */
export function defineType<R>(fn: (value: unknown, context: ParserContext) => R): TypeToken<Awaited<R>>;
export function defineType<T extends TypeToken>(type: new () => T, options: NonOptionalOptions<OutputOf<T>>): T & ParserTypeDefaulted;
export function defineType<T extends TypeToken>(type: new () => T, options?: TypeTokenOptions<OutputOf<T>>): T;
export function defineType<Out, E extends TypeToken<Out>, A, M>(
  definition: DefineExtendedType<Out, E, A, M> & ({ default: Out } | { required: true }),
): DefinedType<E, A, M> & ParserTypeDefaulted;
export function defineType<Out, E extends TypeToken<Out>, A, M>(definition: DefineExtendedType<Out, E, A, M>): DefinedType<E, A, M>;
export function defineType<R, A, M>(
  definition: DefineBaseType<R, A, M> & ({ default: Awaited<R> } | { required: true }),
): DefinedType<TypeToken<Awaited<R>>, A, M> & ParserTypeDefaulted;
export function defineType<R, A, M>(definition: DefineBaseType<R, A, M>): DefinedType<TypeToken<Awaited<R>>, A, M>;
export function defineType(
  definition: (new () => TypeToken) | CastFunction | DefineExtendedType<any, any, any, any> | DefineBaseType<any, any, any>,
  options?: TypeTokenOptions,
): TypeToken {
  if (typeof definition === 'function') {
    // A class (anything whose prototype chain reaches TypeToken) is instantiated; any other function is a cast
    if (definition.prototype instanceof TypeToken) {
      const token = new (definition as new () => TypeToken)();
      return options ? token(options) : token;
    }
    return new TypeToken({ type: 'custom', fn: definition as CastFunction });
  }
  const { fn, name, accessors, methods, ...tokenOptions } = definition;
  const parent = 'extends' in definition ? definition.extends : undefined;
  let token: TypeToken;
  if (parent) {
    if (!isTypeToken(parent)) throw new Error('[@bou-co/parsing] defineType: `extends` must be a type token');
    const Base = parent.constructor as TokenClass;
    const Derived = fn
      ? class extends Base {
          override async cast(value: unknown, context?: ParserContext) {
            const base = await super.cast(value, context);
            if (base === undefined) return undefined;
            return fn(base, context ?? ROOT_CONTEXT);
          }
        }
      : class extends Base {};
    installMembers(Derived.prototype, accessors, methods);
    const key = `define(${name ?? parent.name})`;
    token = createDerived(Derived.prototype, parent, key, [], fn ? String(fn) : '', { name: name ?? parent.name });
  } else {
    if (typeof fn !== 'function') throw new Error('[@bou-co/parsing] defineType: a casting function `fn` is required');
    if (accessors || methods) {
      const Custom = class extends TypeToken {};
      installMembers(Custom.prototype, accessors, methods);
      token = new Custom({ type: 'custom', name: name ?? 'custom', fn });
    } else {
      token = new TypeToken({ type: 'custom', name: name ?? 'custom', fn });
    }
  }
  return token(tokenOptions);
}

// ---- Errors and the cast runtime

export const buildKeyPath = (context: Partial<ParserContext>): string => {
  const keys: PropertyKey[] = [];
  let current: Partial<ParserContext> | undefined = context;
  while (current) {
    if (current.key !== undefined) keys.unshift(current.key);
    current = current.parent;
  }
  return keys.map(String).join('.') || '<root>';
};

export class ParserCastError extends Error {
  readonly type: string;
  readonly key?: PropertyKey;
  readonly path: string;
  readonly received: unknown;
  override readonly cause?: unknown;

  constructor(cause: unknown, received: unknown, token: TypeToken, context: Partial<ParserContext>) {
    const type = token.name;
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

export interface ApplyCastOptions {
  /** The caller has its own fallback (a `||` alternative in a template): a failure yields undefined silently */
  fallback?: boolean;
}

// Exactly two flows: throw, or (log and) undefined — which the token default then fills
const handleFailure = (error: unknown, value: unknown, token: TypeToken, context: ParserContext, options?: ApplyCastOptions) => {
  const castError = new ParserCastError(error, value, token, context);
  context.onCastError?.(castError, context);
  const { policy, default: fallbackValue } = token._state;
  if (policy === 'strict') throw castError;
  if (policy === 'loose' || options?.fallback) return fallbackValue;
  const loose = context.looseCasting;
  // TODO(v4): drop the 'undefined' alias — it is the same flow as `true`
  if (loose === true || loose === 'undefined') {
    if (!context.onCastError) console.warn(`[@bou-co/parsing] Cast to "${token.name}" failed at "${buildKeyPath(context)}" — value dropped`, value);
    return fallbackValue;
  }
  throw castError;
};

export const applyCast = async (value: unknown, token: TypeToken, context: ParserContext = ROOT_CONTEXT, options?: ApplyCastOptions): Promise<unknown> => {
  const { default: defaultValue, required } = token._state;
  const missing = (received: unknown) => (required ? handleFailure(new Error('Missing required value'), received, token, context, options) : defaultValue);
  // Missing values skip casting so fields stay optional — the default fills them, and only a required token complains
  if (isMissing(value)) return missing(value);
  try {
    const result = await token.cast(value, context);
    // A cast may yield undefined to mean "missing" — same treatment
    return result === undefined ? missing(value) : result;
  } catch (error) {
    return handleFailure(error, value, token, context, options);
  }
};

/** Legacy definition shapes accepted by `defineType` */
export type ParserTypeObject<Out = unknown> = { fn: ParserTypeFunction<Out>; strict?: boolean; name?: string; default?: Out };
export type ParserTypeDefinition<Out = unknown> = ParserTypeFunction<Out> | ParserTypeObject<Out>;
