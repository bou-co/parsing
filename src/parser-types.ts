import { CreateContext, GlobalContext, InstanceContext } from './expandable-types';

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

export interface ParserGlobalContext extends GlobalContext {
  variables?: ParserContextVariables;
  transformers?: ParserContextTransformers;
}

export type ParserGlobalContextFn = () => ParserGlobalContext | Promise<ParserGlobalContext>;

export interface CreateParserContext extends CreateContext {
  variables?: ParserContextVariables;
}

export interface ParserInstanceContext extends InstanceContext {
  variables?: ParserContextVariables;
}

export interface ParserContext<DATA = AppObject, PARAMS = unknown[]> extends InstanceContext, GlobalContext, CreateParserContext {
  data: DATA;
  key?: PropertyKey;
  projection: ParserProjection;
  params?: PARAMS;
  variables: AppObject;
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
  (
    data: AppObject,
    instanceContext: OnlyOptionalValues<ParserInstanceContext> extends true ? ParserInstanceContext | void : ParserInstanceContext,
    parentContext?: ParserContext,
  ): Promise<_HandleProjectionObject<T>>;
  // Additional functions
  as: <TYPE extends object>(data: AppObject, instanceContext?: AppObject, parentContext?: ParserContext) => Promise<TYPE>;
  asArray: <V = AppObject[]>(data: V, instanceContext?: AppObject, parentContext?: ParserContext) => Promise<_HandleProjectionObject<T>[]>;
  // Metadata
  _parser: true;
  projection: T;
};

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
