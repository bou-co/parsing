/* eslint-disable @typescript-eslint/no-explicit-any */
import { isPlainObject } from './internal';
import { PARSER_TYPE_DEFAULTED, PARSER_TYPE_OUTPUT } from './parser-types';
import type { ParserContext, ParserTypeFunction } from './parser-types';
import { toHash } from './to-hash';

export type CastFunction<In = unknown, Out = unknown> = (value: In, context: ParserContext) => Out | Promise<Out>;

/** What a `cast` may return: the value, or `undefined` meaning "treat as missing" (the token default then applies) */
export type CastResult<Out> = Out | undefined | Promise<Out | undefined>;

export type TypeTokenPolicy = 'strict' | 'loose';

/** Type-level marker carried by tokens with a default (or marked required) — makes the projected field non-optional */
export interface ParserTypeDefaulted {
  readonly [PARSER_TYPE_DEFAULTED]: true;
}

export type ParserTypeRequired = ParserTypeDefaulted;

/** `T`, non-optional when the token it was derived from has a default or is required */
export type Carry<This, T> = This extends ParserTypeDefaulted ? T & ParserTypeDefaulted : T;

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
  /** This step alone, run on the parent's default so a default set earlier in the chain flows through */
  apply: CastFunction<any, any>;
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

export const defineHidden = (target: object, key: string, value: unknown) => {
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

// Own `name`/`length` are removed so the prototype getters win
export const createCarrier = <T extends TypeToken>(proto: object): T => {
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
    // The instance is a function object so the token is callable
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

  /** Cast a value. Standalone use throws on failure; inside a parse the engine applies the failure policy around it */
  cast(value: unknown, context?: ParserContext): CastResult<Out> {
    const { fn } = this._state;
    return fn ? fn(value, context ?? ROOT_CONTEXT) : (value as Out);
  }

  /** Value used whenever the cast pipeline yields `undefined`. Makes the field non-optional */
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

  /** Derive a new output from a function, or compose another token whose family the result keeps (`json.to(types.array.of(types.number))`) */
  to<T extends TypeToken>(next: T): Carry<this, T>;
  to<R>(fn: CastFunction<Out, R>): Carry<this, TypeToken<Awaited<R>>>;
  to(next: TypeToken | CastFunction<Out, unknown>): any {
    if (isTypeToken(next)) return this.memo(`to:${next.id}`, () => composeTokens(this, next));
    return deriveValue(this, 'to', next, []);
  }

  toJSON(): string {
    return this.toString();
  }

  toString(): string {
    // toHash stringifies tokens, so they must hash by identity instead of source
    return `__parserType:${this.id}__`;
  }

  /** Same-family accessor helper, memoised per member + params */
  protected transform(key: string, fn: CastFunction<Out, Out>, params: unknown[] = []): this {
    return this.memo(memoKey(key, params), () => deriveTransform(this, key, fn, params)) as this;
  }

  /** New-output accessor helper, memoised per member + params; `to` composes the result onto a family (`string`) so it keeps chaining */
  protected derive<R, T extends TypeToken = TypeToken<Awaited<R>>>(key: string, fn: CastFunction<Out, R>, params: unknown[] = [], to?: T): Carry<this, T> {
    const token = this.memo(memoKey(key, params), () => deriveValue(this, key, fn, params));
    return (to ? token.to(to) : token) as never;
  }

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

// Cast overrides of user subclasses are part of their identity
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

const createDerived = (
  proto: object,
  parent: TypeToken,
  key: string,
  params: unknown[],
  apply: CastFunction<any, any>,
  patch: Partial<TypeTokenState> = {},
  source = String(apply),
): TypeToken => {
  const token = createCarrier<TypeToken>(proto);
  const derived: DerivedInfo = { parent, key, params, source, apply };
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
  return createDerived(Derived.prototype, parent, key, params, fn);
};

// New output: a base token whose cast runs the parent's cast first
const deriveValue = (parent: TypeToken, key: string, fn: CastFunction<any, any>, params: unknown[]): TypeToken => {
  const cast: CastFunction = async (value, context) => {
    const base = await parent.cast(value, context);
    if (base === undefined) return undefined;
    return fn(base, context);
  };
  return createDerived(TypeToken.prototype, parent, key, params, fn, { type: 'custom', fn: cast, item: undefined });
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
    // Composing onto a bare family root (`.to(string)`) only retypes the value, so the parent's name stays
    name: target.id === target._state.base ? parent.name : `${parent.name}.to(${target.name})`,
    required: parent._state.required ?? target._state.required,
    policy: parent._state.policy ?? target._state.policy,
    derived: { parent, key: 'to', params: [], source: target.id, apply: (value, context) => target.cast(value, context) },
  } satisfies TypeTokenState);
  return token;
};

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

/** Create a type from a class, a casting function, or a definition object (`extends` inherits the parent's cast and accessors) */
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
    if (definition.prototype instanceof TypeToken) {
      const token = new (definition as new () => TypeToken)();
      return options ? token(options) : token;
    }
    return new TypeToken({ type: 'custom', name: 'custom', fn: definition as CastFunction });
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
    token = createDerived(Derived.prototype, parent, key, [], fn ?? ((value) => value), { name: name ?? parent.name }, fn ? String(fn) : '');
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

// Two flows only: throw, or return so the caller drops the value and the default fills it
const handleFailure = (error: unknown, value: unknown, token: TypeToken, context: ParserContext, options?: ApplyCastOptions): void => {
  const castError = new ParserCastError(error, value, token, context);
  context.onCastError?.(castError, context);
  const { policy } = token._state;
  if (policy === 'strict') throw castError;
  if (policy === 'loose' || options?.fallback) return;
  const loose = context.looseCasting;
  // TODO(v4): drop the 'undefined' alias — it is the same flow as `true`
  if (loose === true || loose === 'undefined') {
    if (!context.onCastError) console.warn(`[@bou-co/parsing] Cast to "${token.name}" failed at "${buildKeyPath(context)}" — value dropped`, value);
    return;
  }
  throw castError;
};

// A token's own default is used as written; a default set earlier in the chain runs through the later steps
const resolveDefault = async (token: TypeToken, context: ParserContext): Promise<unknown> => {
  const { default: own, derived } = token._state;
  if (own !== undefined || !derived) return own;
  const inherited = await resolveDefault(derived.parent, context);
  return inherited === undefined ? undefined : derived.apply(inherited, context);
};

export const applyCast = async (value: unknown, token: TypeToken, context: ParserContext = ROOT_CONTEXT, options?: ApplyCastOptions): Promise<unknown> => {
  const fallback = async (received: unknown) => {
    try {
      return await resolveDefault(token, context);
    } catch (error) {
      handleFailure(error, received, token, context, options);
      return undefined;
    }
  };
  const missing = (received: unknown) => {
    if (token._state.required) handleFailure(new Error('Missing required value'), received, token, context, options);
    return fallback(received);
  };
  // Missing values skip casting so fields stay optional
  if (isMissing(value)) return missing(value);
  let result: unknown;
  try {
    result = await token.cast(value, context);
  } catch (error) {
    handleFailure(error, value, token, context, options);
    return fallback(value);
  }
  return result === undefined ? missing(value) : result;
};

// TODO(v4): remove the v2 definition shapes
export type ParserTypeObject<Out = unknown> = { fn: ParserTypeFunction<Out>; strict?: boolean; name?: string; default?: Out };
export type ParserTypeDefinition<Out = unknown> = ParserTypeFunction<Out> | ParserTypeObject<Out>;
