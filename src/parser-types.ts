import type { Parser } from './parser';
import type { ParserCastError } from './parser-casting';
import { CommonContext, CreateContext, FunctionalContext, GlobalContext, InstanceContext, ParserCachingOptions } from './expandable-types';

// Util types

type OrFix = Record<never, never>;
export type Or<T> = T & OrFix;

export type OrString = Or<string>;
export type OrNumber = Or<number>;
export type OrBoolean = Or<boolean>;

export type AppObject = Record<PropertyKey, any>;

export type OnlyOptionalValues<T> = { [K in keyof T]: undefined extends T[K] ? true : false }[keyof T] extends true | undefined ? true : false;

// Parser types

export type ContextParserValueFunction<DATA = unknown, PARAMS = unknown[]> = ParserValueFunction<unknown, DATA, PARAMS>;

export interface ParserContextVariables {
  [key: PropertyKey]: ContextParserValueFunction | OrString | OrNumber | OrBoolean | AppObject | unknown[];
}

export interface ParserContextTransformer {
  when: ParserCondition<unknown>;
  then: ParserValueFunction<unknown, unknown>;
}

export interface ParserContextTransformers {
  [key: string]: ParserContextTransformer;
}

export type ParserPatternCacheMode = 'run' | 'none' | 'storage';

export interface PatternResolveInput {
  /** The expression after grammar parsing, e.g. "user.name" (the raw capture for patterns with expressions: false) */
  path: string;
  /** The full matched text, e.g. '{{user.name || "Guest" | uppercase}}' */
  raw: string;
  /** Raw regex capture groups */
  groups: RegExpExecArray;
  context: ParserContext;
}

export interface ParserPattern {
  /** Start and end strings bounding a match, e.g. ['{{', '}}']. The engine builds the match regex from these when `match` is absent. Required for expressions */
  delimiters?: [string, string];
  /** Regex detecting the pattern inside strings. First capture group is the expression. Optional when `delimiters` is set (overrides the built regex) */
  match?: RegExp;
  /** Called once per unique match in a string, never per occurrence */
  resolve: (input: PatternResolveInput) => unknown | Promise<unknown>;
  /** Engine parses ||, | pipes and literals before calling resolve. Defaults to true for patterns with `delimiters`; unavailable (throws if set) without them */
  expressions?: boolean;
  /** Re-scan resolved string output for patterns. Default: true */
  rescan?: boolean;
  /** 'run' (memoized per parse, default), 'none', or 'storage' (uses the configured storage) */
  cache?: ParserPatternCacheMode;
}

/** Per-key: a pattern to register, a partial merged onto the same-named existing pattern, or false to disable it */
export type ParserPatternsConfig = Record<string, ParserPattern | Partial<ParserPattern> | false>;

export type ParserPipeFunction<DATA = any, PARAMS = any> = ContextParserValueFunction<DATA, PARAMS>;

export interface ParserContextPipes {
  [key: string]: ParserPipeFunction;
}

export type CacheValueFn = <T>(value: T) => T;

export interface StorageLike {
  /** Match a key to value in cache and return it */
  match: (key: string, context: CachingParserContext) => Promise<any> | any;
  /** Add a value to cache with a key */
  add: (key: string, value: any, context: CachingParserContext) => Promise<void> | void;
  /** Define function for generating cache key */
  generateKey?: (context: CachingParserContext) => string;
  /** Remove a value from cache by key */
  remove?: (key: string, context: ParserContext) => Promise<void> | void;
  /** Clear the cache completely */
  clear?: (context: ParserContext) => Promise<void> | void;
}

export interface ParserGlobalContext extends CommonContext, GlobalContext {
  storage?: StorageLike;
  variables?: ParserContextVariables;
  transformers?: ParserContextTransformers;
  patterns?: ParserPatternsConfig;
  pipes?: ParserContextPipes;
  variableResolver?: (variableName: string, context: ParserContext, cache: CacheValueFn) => Promise<unknown> | unknown;
  cache?: ParserCachingOptions;
  looseCasting?: LooseCasting;
  onCastError?: OnCastError;
}

export type ParserGlobalContextFn = () => ParserGlobalContext | Promise<ParserGlobalContext>;

export interface CreateParserContext extends CommonContext, CreateContext {
  variables?: ParserContextVariables;
  pipes?: ParserContextPipes;
  cache?: ParserCachingOptions;
  looseCasting?: LooseCasting;
  onCastError?: OnCastError;
}

export interface ParserInstanceContext extends CommonContext, InstanceContext {
  variables?: ParserContextVariables;
  pipes?: ParserContextPipes;
  cache?: ParserCachingOptions;
  looseCasting?: LooseCasting;
  onCastError?: OnCastError;
}

export interface ParserContext<DATA = AppObject, PARAMS = unknown[]>
  extends FunctionalContext, CommonContext, InstanceContext, ParserGlobalContext, CreateParserContext {
  /** True when this is the top-level execution of the parser */
  isRoot?: boolean;
  /** Reference to the parser engine handling the execution */
  parser: Parser;
  /** The input data at the currently executing nested level */
  data: DATA;
  /** Raw incoming data value at the current key (`data?.[key]`) — never resolved eagerly; call `resolve()` to resolve it on demand. Mirrors `data` inside transformers and pipes */
  value?: any;
  /** Key of the property currently being evaluated */
  key?: PropertyKey;
  /** The active projection for the current level */
  projection?: ParserProjection;
  /** Parameters passed to a variable pipe function */
  params?: PARAMS;
  /** Merged dictionary of global, schema and instance variables */
  variables: AppObject;
  /** Merged dictionary of global, schema and instance pipe functions */
  pipes?: ParserContextPipes;
  /** Index of the current item when parsing an array */
  index?: number;
  /** Context of the parent level, forming a chain up to the root */
  parent?: Partial<ParserContext>;
  /** Projection references from the root to the current level */
  path?: object[];
  /** Projection references accumulated during projection-driven (data-less) resolution. Present only when the current parse has no matching input data. */
  datalessPath?: object[];
  /** Get or compute a value through the global storage */
  store: <T>(key: string, fn: () => T | Promise<T>, options?: ParserCachingOptions) => Promise<T>;
  /** Resolve variables and transformers on a value, inheriting the current context; with no arguments it lazily resolves the current `value` (memoized per context) */
  resolve: ContextResolveFunction;
}

export interface CachingParserContext extends ParserContext {
  cache: ParserCachingOptions;
}

// Parser type casting

export const PARSER_TYPE_OUTPUT: unique symbol = Symbol.for('@bou-co/parsing:type-output');

export const PARSER_TYPE_DEFAULTED: unique symbol = Symbol.for('@bou-co/parsing:type-defaulted');

export type LooseCasting = boolean | 'undefined';

export type OnCastError = (error: ParserCastError, context: ParserContext) => void;

export type ParserTypeFunction<Out = unknown> = (value: unknown, context: ParserContext) => Out | Promise<Out>;

export interface ParserTypeObject<Out = unknown> {
  fn: ParserTypeFunction<Out>;
  strict?: boolean;
  // Distinguishes types sharing a factory-made fn (closures are invisible to hashing); also shown in cast errors
  name?: string;
  default?: Out;
}

export type ParserTypeDefinition<Out = unknown> = ParserTypeFunction<Out> | ParserTypeObject<Out>;

// `default` stays required so type tokens never match this signature (keeps types.array(types.x) on the item overload)
export interface ParserTypeOptions<Out = unknown> {
  default: Out;
}

export interface ParserType<Out = unknown> {
  (options: ParserTypeOptions<Out>): ParserTypeWithDefault<Out>;
  (value: unknown, context: ParserContext): Out | Promise<Out>;
  readonly _type: string;
  readonly strict?: boolean;
  // Type-level phantom carrying the output type — never present at runtime
  readonly [PARSER_TYPE_OUTPUT]: Out;
}

export interface ParserTypeWithDefault<Out = unknown> extends ParserType<Out> {
  // Type-level phantom marking the field non-optional in the output — never present at runtime
  readonly [PARSER_TYPE_DEFAULTED]: true;
}

// Brand-only view of ParserType used in ParserProjectionValue: adding a second callable
// member to that union would break contextual typing of plain value functions
export interface ParserTypeLike {
  readonly _type: string;
  readonly [PARSER_TYPE_OUTPUT]: unknown;
}

// Brand-only for the same reason as ParserTypeLike — callable at runtime, never at type level
export interface ParserFlatFunction<T extends object> {
  readonly _flat: true;
  readonly _parser: true;
  readonly projection: T;
}

export interface ParserFlatLike {
  readonly _flat: true;
  readonly projection: object;
}

export type ArrayParserType = ParserType<unknown[]> & {
  <Item>(item: ParserType<Item>): ParserType<Item[]>;
};

export interface DefaultParserTypes {
  readonly string: ParserType<string>;
  readonly number: ParserType<number>;
  readonly boolean: ParserType<boolean>;
  readonly date: ParserType<Date>;
  readonly object: ParserType<AppObject>;
  readonly array: ArrayParserType;
  readonly any: ParserType<any>;
  readonly unknown: ParserType<unknown>;
}

// Utility types

// eslint-disable-next-line @typescript-eslint/ban-types
type Prettify<T> = { [K in keyof T]: T[K] } & {};

type AllKeys<T> = T extends any ? keyof T : never;

type PickType<T, K extends AllKeys<T>> = T extends { [k in K]?: any } ? RealValue<T[K]> : undefined;

type Merge<T> = { [k in AllKeys<T>]?: PickType<T, k> };

type IsAny<T> = unknown extends T ? ([keyof T] extends [never] ? false : true) : false;

type KeysOfType<T, SelectedType> = {
  [K in keyof T]: IsAny<T[K]> extends true ? never : SelectedType extends T[K] ? K : never;
}[keyof T];

type KeysOfAny<T> = { [K in keyof T]: IsAny<T[K]> extends true ? K : never }[keyof T];

// type Optional<T> = Partial<Pick<T, KeysOfType<T, undefined>>> & Pick<T, KeysOfType<T, unknown>> & Pick<T, KeysOfAny<T>>;
type Optional<T> = Partial<Pick<T, KeysOfType<T, undefined>>> & Pick<T, KeysOfAny<T>>;

type Required<T> = Omit<T, KeysOfType<T, undefined>>;

type OptionalUndefined<T> = Optional<T> & Required<T>;

// type ObjectIncludesKey<T extends object, K> = K extends keyof T ? true : false;

type RealValue<T> =
  //
  T extends { readonly [PARSER_TYPE_OUTPUT]: infer Out }
    ? Out extends Promise<unknown>
      ? Awaited<Out>
      : Out
    : T extends Date
      ? Date
      : T extends Promise<infer R>
        ? RealValue<R>
        : T extends (...args: any) => infer R
          ? RealValue<R>
          : T extends any[]
            ? RealValue<T[number]>[]
            : T extends object
              ? _HandleProjectionObject<T>
              : T;

export type _HandleProjectionObject<T extends object> = Prettify<_HandleArray<T>>;

// 1. Handle @array
type _HandleArray<T extends object> = T extends { '@array': true } ? _HandleIf<Omit<T, '@array'>>[] : _HandleIf<T>;

// 2. Handle @if
type _HandleIf<T extends object> = T extends { '@if': ParserConditionalItem[] }
  ? _HandleCombine<Omit<T, '@if'>> & Merge<CondidionalResult<T['@if'][number]['then']>>
  : _HandleCombine<T>;

type CondidionalResult<T> = T extends (...args: any[]) => any ? ParserReturnValue<T> : T extends object ? T : never;

// 3. Handle @combine
type _HandleCombine<T extends object> = _CombineKeys<T> extends never ? _HandleFlat<T> : _MergeCombine<T> & _HandleFlat<Omit<T, _CombineKeys<T>>>;

type _CombineKeys<T extends object> = {
  [K in keyof T]: K extends `@combine${string}` ? K : never;
}[keyof T];

type _MergeCombine<T extends object> = Merge<
  {
    [K in keyof T]: K extends `@combine${string}` ? (T[K] extends ParserValueFunction ? Awaited<ReturnType<T[K]>> : never) : never;
  }[keyof T]
>;

// 4. Handle .flat parsers — merged like @combine, so their fields stay optional
type _FlatKeys<T extends object> = {
  [K in keyof T]: IsAny<T[K]> extends true ? never : T[K] extends { readonly _flat: true } ? K : never;
}[keyof T];

type _MergeFlat<T extends object> = Merge<
  {
    [K in _FlatKeys<T>]: T[K] extends { readonly projection: infer P extends object } ? _HandleProjectionObject<P> : never;
  }[_FlatKeys<T>]
>;

type _HandleFlat<T extends object> = _FlatKeys<T> extends never ? _HandleChildren<T> : _MergeFlat<T> & _HandleChildren<Omit<T, _FlatKeys<T>>>;

// 5. Handle children — fields with a default are re-added as required on top of the optional map.
// Keep the first mapped type homomorphic ([K in keyof T]) — a non-homomorphic split (e.g. over
// Exclude<keyof T, ...>) forces eager evaluation and collapses doubly-nested parser types to {}
type _HandleChildren<T extends object> = { -readonly [K in keyof T]?: RealValue<T[K]> } & {
  -readonly [K in keyof T as IsAny<T[K]> extends true ? never : T[K] extends { readonly [PARSER_TYPE_DEFAULTED]: true } ? K : never]-?: RealValue<T[K]>;
};

// 6. Handle optional
type _HandleOptional<T extends object> = OptionalUndefined<T>;

export type InstaceContext = OnlyOptionalValues<ParserInstanceContext> extends true ? ParserInstanceContext | void : ParserInstanceContext;

export type ParserFunction<T extends object> = {
  (data: AppObject | string, instanceContext: InstaceContext, parentContext?: ParserContext): Promise<_HandleProjectionObject<T>>;
  // Additional functions
  as: <TYPE extends object>(data: AppObject, instanceContext: InstaceContext, parentContext?: ParserContext) => Promise<TYPE>;
  asArray: <V = AppObject[]>(data: V, instanceContext: InstaceContext, parentContext?: ParserContext) => Promise<_HandleProjectionObject<T>[]>;
  flat: ParserFlatFunction<T>;
  withContext: (context: Partial<ParserInstanceContext>) => ParserFunction<T>;
  extend: <X extends ParserProjection>(extendWith: X, parserContext?: CreateParserContext) => ParserFunction<T & X>;
  // Metadata
  _parser: true;
  projection: T;
};

export type ResolvedValue<T> = T extends string
  ? string
  : T extends (...args: any) => infer R
    ? ResolvedValue<Awaited<R>>
    : T extends readonly (infer I)[]
      ? ResolvedValue<I>[]
      : T extends object
        ? { [K in keyof T]: ResolvedValue<T[K]> }
        : T;

// Recursive so function values get contextual typing, like ParserProjection does for createParser
export type ResolveInput =
  string | number | boolean | null | undefined | ((context: ParserContext) => unknown) | readonly ResolveInput[] | { [key: PropertyKey]: ResolveInput };

// Sentinel detecting whether the caller passed an explicit type argument: TS has no partial
// type-argument inference, so R keeps this default exactly when the caller omitted it
declare const RESOLVE_TYPE_UNSET: unique symbol;
export type ResolveTypeUnset = typeof RESOLVE_TYPE_UNSET;

// Overload order is load-bearing: the constrained-T signature must stay first so literal inputs get
// contextual typing; plain-T catches interface-typed inputs (no implicit index signature) and, via
// its unknown default, explicit-R calls whose input the first overload rejects. An explicit R always
// overrides the inferred ResolvedValue mapping (remaining type params fall back to their defaults)
export interface ParserResolveFunction {
  <R = ResolveTypeUnset, T extends ResolveInput = ResolveInput>(
    input: T,
    instanceContext?: ParserInstanceContext,
  ): Promise<[R] extends [ResolveTypeUnset] ? ResolvedValue<T> : R>;
  <R = ResolveTypeUnset, T = unknown>(input: T, instanceContext?: ParserInstanceContext): Promise<[R] extends [ResolveTypeUnset] ? ResolvedValue<T> : R>;
}

// Context-only variant adding the zero-argument form that lazily resolves `context.value`
// (memoized per context). Own signatures are checked before inherited ones, but arity 0 can
// never capture a call with arguments, so the base overload order stays load-bearing
export interface ContextResolveFunction extends ParserResolveFunction {
  <R = unknown>(): Promise<R>;
}

type ParserValueFunction<R = unknown, DATA = AppObject, PARAMS = unknown[]> = (
  context: ParserContext<DATA, PARAMS>,
  __parserFnContext?: any,
  __parserFnParent?: any,
) => R | Promise<R>;

export type ParserReturnValue<T extends (...args: any) => any> = Awaited<ReturnType<T>>;

export type ParserCondition<DATA = AppObject, PARAMS = unknown[]> = (context: ParserContext<DATA, PARAMS>) => boolean | Promise<boolean>;

type ParserConditionalItemThen = ParserProjection | ParserValueFunction<AppObject>;

export type ParserConditionalItem = { when: ParserCondition; then: ParserConditionalItemThen };

export type ParserConditionalItems = ParserConditionalItem[];

type ParserProjectionTypeValues = OrString | OrNumber | OrBoolean;

export interface ParserProjectionUtils {
  '@array'?: true;
  '@if'?: ParserConditionalItems;
  '@combine'?: ParserValueFunction;
}

export type ParserProjectionValue =
  undefined | ParserTypeLike | ParserFlatLike | ParserProjectionTypeValues | ParserValueFunction | ParserProjection | ParserProjection[];

export interface ParserProjectionValues {
  [key: PropertyKey]: ParserProjectionValue;
}

export type ParserProjection = ParserProjectionUtils | ParserProjectionValues;
