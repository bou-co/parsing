// Util types

type OrFix = Record<never, never>;
export type Or<T> = T & OrFix;

export type OrString = Or<string>;
export type OrNumber = Or<number>;
export type OrBoolean = Or<boolean>;

export type AppObject = Record<PropertyKey, any>;

// Parser types

export type ParserGlobalContextFn = () => AppObject | Promise<AppObject>;

export interface ParserContext {
  parentContext?: ParserContext | undefined;
  parserContext?: AppObject | undefined;
  instanceContext?: AppObject;
  data: AppObject;
  key: PropertyKey;
  projection: ParserProjection;
}

export const valueKeys = ['string', 'object', 'number', 'boolean', 'array', 'undefined', 'any', 'unknown', 'date'] as const;

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

type RealValue<T> = //
  T extends 'any'
    ? any
    : T extends 'unknown'
    ? unknown
    : T extends 'undefined'
    ? undefined
    : T extends 'object'
    ? AppObject
    : T extends 'string'
    ? string
    : T extends 'number'
    ? number
    : T extends 'boolean'
    ? boolean
    : T extends 'date'
    ? Date
    : T extends Date
    ? Date
    : T extends 'array'
    ? any[]
    : T extends `array<${infer ArrayType}>`
    ? RealValue<ArrayType>[]
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
type _HandleCombine<T extends object> = _CombineKeys<T> extends never ? _HandleChildren<T> : _MergeCombine<T> & _HandleChildren<Omit<T, _CombineKeys<T>>>;

type _CombineKeys<T extends object> = {
  [K in keyof T]: K extends `@combine${string}` ? K : never;
}[keyof T];

type _MergeCombine<T extends object> = Merge<
  {
    [K in keyof T]: K extends `@combine${string}` ? (T[K] extends ParserValueFunction ? Awaited<ReturnType<T[K]>> : never) : never;
  }[keyof T]
>;

// 4. Handle children
type _HandleChildren<T extends object> = { -readonly [K in keyof T]?: RealValue<T[K]> };

// 5. Handle optional
type _HandleOptional<T extends object> = OptionalUndefined<T>;

export type ParserFunction<T extends object> = {
  (data: AppObject, instanceContext?: AppObject, parentContext?: ParserContext): Promise<_HandleProjectionObject<T>>;
  // Additional functions
  as: <TYPE extends object>(data: AppObject, instanceContext?: AppObject, parentContext?: ParserContext) => Promise<TYPE>;
  asArray: <V = AppObject[]>(data: V, instanceContext?: AppObject, parentContext?: ParserContext) => Promise<_HandleProjectionObject<T>[]>;
  // Metadata
  _parser: true;
  projection: T;
};

type ParserValueFunction<R = unknown> = (context: ParserContext) => R | Promise<R>;

export type ParserReturnValue<T extends (...args: any) => any> = Awaited<ReturnType<T>>;

export type ParserCondition = (context: ParserContext) => boolean | Promise<boolean>;

type ParserConditionalItemWhen = ParserProjection | ParserFunction<any> | ParserValueFunction<object>;

export type ParserConditionalItem = { when: ParserCondition; then: ParserConditionalItemWhen };

export type ParserConditionalItems = ParserConditionalItem[];

type BasicParserProjectionTypeKeys = 'any' | 'unknown' | 'undefined' | 'string' | 'number' | 'boolean' | 'object' | 'date';
type ParserProjectionTypeKeys = BasicParserProjectionTypeKeys | `array<${BasicParserProjectionTypeKeys | 'nested-array'}>`;
type ParserProjectionTypeValues = OrString | OrNumber | OrBoolean;

export interface ParserProjectionUtils {
  '@array'?: true;
  '@if'?: ParserConditionalItems;
  '@combine'?: ParserValueFunction;
}

export type ParserProjectionValue =
  | undefined
  | ParserProjectionTypeKeys
  | ParserProjectionTypeValues
  | ParserValueFunction
  | ParserProjection
  | ParserProjection[];

export interface ParserProjectionValues {
  [key: PropertyKey]: ParserProjectionValue;
}

export type ParserProjection = ParserProjectionUtils | ParserProjectionValues;
