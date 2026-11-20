/* eslint-disable @typescript-eslint/no-explicit-any */
import { ParserCachingOptions } from './expandable-types';
import { canResolveDataless, isDatalessInput, toContentHash } from './internal';
import {
  ParserFunction,
  ParserContext,
  ParserConditionalItems,
  ParserProjection,
  ParserGlobalContextFn,
  AppObject,
  CreateParserContext,
  ParserContextHook,
  ParserInheritedHook,
  ParserInstanceContext,
  ParserGlobalContext,
  CachingParserContext,
  ParserResolveFunction,
  ContextResolveFunction,
  StoreValue,
  ParserStore,
  StoreAddInput,
  DefaultParserTypes,
  ParserTypesConfig,
  RegisteredTypes,
} from './parser-types';
import { applyCast, assertNotLegacyTypeKey, isTypeToken, TypeToken, types } from './parser-casting';
import { mergeTypes, ParserTypesNamespace } from './types/namespace';
import {
  CompiledPatternRegistry,
  compilePatternRegistry,
  evaluateVariableExpression,
  matchFullPattern,
  PATTERN_REGISTRY,
  PATTERN_RUN_CACHE,
  PATTERN_STORE,
  resolvePatternMatch,
  resolvePatternsInText,
} from './parser-patterns';
import { filterNill, filterUndefinedEntries, mergeObjects, optional, typed } from './parser-util';
import { toHash } from './to-hash';
import { variables } from './variables';

interface ParserCache {
  variables: Record<string, any>;
  pending: Map<string, Promise<any>>;
}

const parserRef = (parser: object): object => ('projection' in parser && parser.projection instanceof Object ? parser.projection : parser);

export class Parser {
  private cache: ParserCache = { variables: {}, pending: new Map() };

  private initializingGlobalContext = false;
  private globalContext: ParserGlobalContext | ParserGlobalContextFn;
  private patternRegistry?: CompiledPatternRegistry;
  private typesNamespace: ParserTypesNamespace;

  constructor(globalContext: ParserGlobalContext | ParserGlobalContextFn = {} as ParserGlobalContext) {
    this.globalContext = globalContext;
    // Function-form global contexts register their types at first parse (pipe-visible only)
    this.typesNamespace = typeof globalContext === 'function' ? types : mergeTypes(types, globalContext.types);
  }

  /** Built-in types plus everything registered through the global context */
  public get types(): ParserTypesNamespace {
    return this.typesNamespace;
  }

  // TODO(v4): remove migration catches, assigning the removed v2 statics would otherwise silently no-op
  private static readonly parserGlobalContextRemoved =
    '[@bou-co/parsing] Parser.parserGlobalContext was removed in v3 — engines are isolated; pass the global context to initializeParser(...) or new Parser(...)';
  static get parserGlobalContext(): never {
    throw new Error(Parser.parserGlobalContextRemoved);
  }
  static set parserGlobalContext(_value: unknown) {
    throw new Error(Parser.parserGlobalContextRemoved);
  }
  static createParser = (): never => {
    throw new Error(
      '[@bou-co/parsing] Parser.createParser was removed in v3 — use the createParser returned by initializeParser(...) or new Parser(config).createParser',
    );
  };

  private async getGlobalContext() {
    while (this.initializingGlobalContext) {
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
    if (typeof this.globalContext === 'function') {
      this.initializingGlobalContext = true;
      try {
        this.globalContext = await this.globalContext();
        this.typesNamespace = mergeTypes(types, this.globalContext.types);
      } finally {
        this.initializingGlobalContext = false;
      }
    }
    return this.globalContext as ParserGlobalContext;
  }

  public cacheVariable = <T>(path: string, value: T): T => {
    Object.assign(this.cache.variables, { [path]: value });
    return value;
  };

  // Only safe to call once the global context has resolved
  private getPatternRegistry = (): CompiledPatternRegistry => {
    return (this.patternRegistry ??= compilePatternRegistry((this.globalContext as ParserGlobalContext).patterns));
  };

  private seedPatterns = (context: ParserContext, runCache: Map<string, Promise<unknown>> = new Map()) => {
    Object.assign(context, { [PATTERN_REGISTRY]: this.getPatternRegistry(), [PATTERN_RUN_CACHE]: runCache, [PATTERN_STORE]: this.storeValue });
  };

  private storeValue = async <T>(context: ParserContext, key: string, fn: () => T | Promise<T>, options?: ParserCachingOptions): Promise<T> => {
    const { storage } = context;
    if (!storage) return fn();

    const { pending } = this.cache;
    const existing = pending.get(key);
    if (existing) return existing;

    const _fn = async () => {
      const storeContext = Parser.cachingContext(context, options);
      const cached = await storage.match(key, storeContext);
      if (cached !== undefined && cached !== null) return cached as T;
      const value = await fn();
      await storage.add(key, value, storeContext);
      return value;
    };

    const promise = _fn();
    pending.set(key, promise);

    const cleanup = () => {
      if (pending.get(key) === promise) pending.delete(key);
    };

    promise.then(cleanup, cleanup);
    return promise;
  };

  private static cachingContext = (context: ParserContext, options?: ParserCachingOptions): CachingParserContext => {
    return { ...context, cache: mergeObjects(context.cache, options) };
  };

  private static resolveStoreKey = async (key: string, context: ParserContext): Promise<string> => {
    return String(await Parser.resolveVariables(key, context));
  };

  // Lazy so the standalone store(key, fn) can sit in a projection literal; eager for context.store so consecutive calls stay parallel
  private createStore = (getContext: () => ParserContext | Promise<ParserContext>, lazy = false): ParserStore => {
    const run = async <T>(context: ParserContext, key: string, fn: (context: ParserContext) => T | Promise<T>, options?: ParserCachingOptions) => {
      const resolvedKey = await Parser.resolveStoreKey(key, context);
      return this.storeValue(context, resolvedKey, () => fn(context), options);
    };

    const store = <T>(key: string, fn: (context: ParserContext) => T | Promise<T>, options?: ParserCachingOptions): StoreValue<T> => {
      let own: Promise<T> | undefined;
      const runOwn = () => (own ??= Promise.resolve(getContext()).then((context) => run(context, key, fn, options)));
      // Eager runs may be awaited a tick later, so mark them handled
      if (!lazy) runOwn().catch(() => undefined);
      const value = ((context?: ParserContext) => (context ? run(context, key, fn, options) : runOwn())) as StoreValue<T>;
      Object.defineProperties(value, {
        then: {
          value: (onfulfilled?: ((value: T) => unknown) | null, onrejected?: ((reason: unknown) => unknown) | null) => runOwn().then(onfulfilled, onrejected),
        },
        catch: { value: (onrejected?: ((reason: unknown) => unknown) | null) => runOwn().catch(onrejected) },
        finally: { value: (onfinally?: (() => void) | null) => runOwn().finally(onfinally) },
        // toHash stringifies projection functions, so distinct values must differ
        toString: { value: () => `__store:${key}:${toHash(fn)}:${toHash(options)}__` },
      });
      return value;
    };

    const match = async <T = unknown>(key: string, options?: ParserCachingOptions): Promise<T | undefined> => {
      const context = await getContext();
      if (!context.storage) return undefined;
      const resolvedKey = await Parser.resolveStoreKey(key, context);
      return (await context.storage.match(resolvedKey, Parser.cachingContext(context, options))) ?? undefined;
    };

    const add = async (...args: [StoreAddInput] | [string, unknown, ParserCachingOptions?]): Promise<string> => {
      let key: string | undefined;
      let value: unknown;
      let options: ParserCachingOptions | undefined;
      if (args.length === 1) {
        const [input] = args;
        if (!input || typeof input !== 'object' || !('value' in input)) {
          throw new Error('[@bou-co/parsing] store.add(input) takes { key?, value, ...options } — or call store.add(key, value, options?)');
        }
        ({ key, value, ...options } = input);
      } else {
        [key, value, options] = args;
      }
      value = await value;
      if (value === undefined || value === null) {
        throw new Error('[@bou-co/parsing] store.add needs a value — null and undefined read back as a miss');
      }
      const context = await getContext();
      const resolvedKey = key === undefined ? `store:${toContentHash(value)}` : await Parser.resolveStoreKey(key, context);
      if (context.storage) await context.storage.add(resolvedKey, value, Parser.cachingContext(context, options));
      return resolvedKey;
    };

    const remove = async (key: string, options?: ParserCachingOptions): Promise<void> => {
      const context = await getContext();
      if (!context.storage?.remove) return;
      await context.storage.remove(await Parser.resolveStoreKey(key, context), Parser.cachingContext(context, options));
    };

    const clear = async (options?: ParserCachingOptions): Promise<void> => {
      const context = await getContext();
      await context.storage?.clear?.(Parser.cachingContext(context, options));
    };

    return Object.assign(store, { match, add: add as ParserStore['add'], remove, clear });
  };

  /** Value caching through the global storage, usable outside a parse */
  public store: ParserStore = this.createStore(() => this.createRootContext(undefined), true);

  // Resolves a nested projection without matching data so data independent values still produce output
  private parseDataless = async (
    parserFn: (data: AppObject | string, instanceContext?: ParserInstanceContext, parentContext?: ParserContext) => Promise<unknown>,
    ref: object,
    instanceContext: ParserInstanceContext,
    context: ParserContext,
  ): Promise<unknown> => {
    // Stop when the projection was already resolved in this data-less chain
    const path = context.datalessPath ?? [];
    if (path.includes(ref)) return undefined;
    // Fresh object as before hooks may mutate it
    const result = await parserFn({}, instanceContext, { ...context, datalessPath: [...path, ref] });
    // Nothing resolved, so the key is omitted
    if (result && typeof result === 'object' && !Array.isArray(result) && Object.keys(result).length === 0) return undefined;
    return result;
  };

  // A string feeds a nested projection only as a stringified object/array or a full-string pattern resolving to an object
  private nestedInput = async (input: unknown, context: ParserContext): Promise<unknown> => {
    if (typeof input !== 'string' || input === '') return input;
    const fullPattern = matchFullPattern(input, context);
    if (fullPattern) {
      const resolved = await resolvePatternMatch(fullPattern, context);
      return resolved instanceof Object ? resolved : undefined;
    }
    return /^\s*[{[]/.test(input) ? input : undefined;
  };

  private parseNested = async (
    parserFn: (data: any, instanceContext?: ParserInstanceContext, parentContext?: ParserContext) => Promise<unknown>,
    ref: object,
    value: unknown,
    instanceContext: ParserInstanceContext,
    context: ParserContext,
  ): Promise<unknown> => {
    const input = await this.nestedInput(value, context);
    if (!isDatalessInput(input)) return parserFn(input, instanceContext, context);
    // Array projections always require data
    if (!canResolveDataless(parserFn, ref)) return undefined;
    return this.parseDataless(parserFn, ref, instanceContext, context);
  };

  public objectify = (value: string) => {
    try {
      return JSON.parse(value);
    } catch (error) {
      throw { title: 'Parser stringify error', error, value };
    }
  };

  /** Resolves a variable expression (`{{variableName}}` or a bare path) through the active variables pattern */
  public static getVariableValue = async <T = unknown>(match: string, context: ParserContext): Promise<T> => {
    return evaluateVariableExpression(match, context) as Promise<T>;
  };

  /** Resolves patterns (variables by default) in strings, recursing into objects and arrays */
  public static resolveVariables = async <T>(current: T, context: ParserContext): Promise<T> => {
    return this.resolveValue(current, context) as T | Promise<T>;
  };

  // Resolves values without allocating promises for the ones that contain no variables
  private static resolveValue = (current: unknown, context: ParserContext): unknown => {
    if (!current) return current;

    if (isTypeToken(current)) return current;

    // Await only the asynchronous entries
    if (typeof current === 'object') {
      const entries = Object.entries(current);
      if (!entries.length) return current;
      const result: Record<any, any> = Array.isArray(current) ? [] : {};
      let pending: Promise<void>[] | undefined;
      for (const [key, value] of entries) {
        const resolved = this.resolveValue(value, context);
        if (resolved instanceof Promise) {
          pending ??= [];
          pending.push(resolved.then((awaited) => (result[key] = awaited)));
        } else {
          result[key] = resolved;
        }
      }
      if (pending) return Promise.all(pending).then(() => result);
      return result;
    }

    if (typeof current === 'string') return resolvePatternsInText(current, context);
    return current;
  };

  // Root context shared by the standalone resolve and store
  private createRootContext = async (input: unknown, instanceContext: ParserInstanceContext = {}): Promise<ParserContext> => {
    const globalContext = await this.getGlobalContext();

    const variables = { current: input };
    if (globalContext) Object.assign(variables, globalContext.variables);
    if (instanceContext) Object.assign(variables, instanceContext.variables);
    if (this.cache.variables) Object.assign(variables, this.cache.variables);

    const pipes = {};
    if (globalContext) Object.assign(pipes, globalContext.pipes);
    if (instanceContext) Object.assign(pipes, instanceContext.pipes);

    const context: ParserContext = {
      parser: this,
      ...globalContext,
      ...instanceContext,
      isRoot: true,
      variables,
      pipes,
      types: mergeTypes(this.typesNamespace, instanceContext?.types),
      data: input,
      value: input,
      cache: mergeObjects(globalContext?.cache, instanceContext?.cache),
      store: this.createStore(() => context),
    } satisfies Partial<ParserContext<unknown>> as any;
    context.resolve = this.createContextResolve(context);
    this.seedPatterns(context);
    return context;
  };

  public resolve = (async (input: unknown, instanceContext: ParserInstanceContext = {}) => {
    const context = await this.createRootContext(input, instanceContext);
    return this.resolveNode(input, context);
  }) as ParserResolveFunction;

  // context.resolve: same as the public resolve but inheriting the calling context
  private resolveWithParentContext = (input: unknown, parentContext: ParserContext, instanceContext?: Partial<ParserInstanceContext>): Promise<unknown> => {
    const variables = { ...parentContext.variables, ...instanceContext?.variables, current: input };
    const pipes = { ...parentContext.pipes, ...instanceContext?.pipes };
    const resolvedTypes = mergeTypes(parentContext.types ?? this.typesNamespace, instanceContext?.types);
    const context: ParserContext = {
      ...parentContext,
      ...instanceContext,
      variables,
      pipes,
      types: resolvedTypes,
      data: input,
      value: input,
    } satisfies Partial<ParserContext<unknown>> as any;
    context.store = this.createStore(() => context);
    context.resolve = this.createContextResolve(context);
    return this.resolveNode(input, context);
  };

  // Zero-arg resolve() resolves context.value once per context; resolve(undefined) is told apart by arity
  private createContextResolve = (context: ParserContext): ContextResolveFunction => {
    let memo: Promise<unknown> | undefined;
    const contextResolve = (...args: [unknown?, Partial<ParserInstanceContext>?]) => {
      if (!args.length) return (memo ??= this.resolveWithParentContext(context.value, context));
      return this.resolveWithParentContext(args[0], context, args[1]);
    };
    return contextResolve as ContextResolveFunction;
  };

  // Unlike parse, transformers apply at every nesting level since there is no projection to scope them
  private resolveNode = async (value: unknown, context: ParserContext): Promise<unknown> => {
    if (value instanceof Promise) return this.resolveNode(await value, context);
    if (isTypeToken(value)) return value;
    if (typeof value === 'function') {
      if ('_parser' in value) return value;
      const result = await this.resolveNode(await (value as (context: ParserContext) => unknown)(context), context);
      return '_cast' in value ? applyCast(result, (value as { _cast: TypeToken })._cast, context) : result;
    }
    if (context.transformers) {
      for (const transformer of Object.values(context.transformers)) {
        if (await transformer.when({ ...context, data: value, value })) {
          value = await transformer.then({ ...context, data: value, value });
        }
      }
    }
    if (value && typeof value === 'object') {
      const entries = Object.entries(value);
      if (!entries.length) return value;
      const result: Record<any, any> = Array.isArray(value) ? [] : {};
      const levelContext: ParserContext = { ...context, data: value, value, parent: context, isRoot: false };
      await Promise.all(
        entries.map(async ([key, item]) => {
          result[key] = await this.resolveNode(item, { ...levelContext, key });
        }),
      );
      return result;
    }
    return Parser.resolveVariables(value, context);
  };

  // A hook declaring the second parameter calls the earlier hooks itself, any other hook runs after them
  private static callHook = async (hook: ParserContextHook, context: ParserContext, inherited: ParserInheritedHook): Promise<ParserContext> => {
    return hook.length > 1 ? hook(context, inherited) : hook(await inherited(context), inherited);
  };

  private static chainHooks = (a?: ParserContextHook, b?: ParserContextHook): ParserContextHook | undefined => {
    if (!a || !b || a === b) return a ?? b;
    return (context, inherited) => Parser.callHook(b, context, (context) => Parser.callHook(a, context, inherited));
  };

  // An after hook returning something without data is ignored
  private static keepData = (hook: ParserContextHook): ParserContextHook => {
    return async (context, inherited) => {
      let received = context;
      const result = await Parser.callHook(hook, context, async (context) => (received = await inherited(context)));
      return result?.data ? result : received;
    };
  };

  private static chainAfterHooks = (a?: ParserContextHook, b?: ParserContextHook): ParserContextHook | undefined => {
    if (!a || !b || a === b) return a ?? b;
    return Parser.chainHooks(Parser.keepData(a), Parser.keepData(b));
  };

  // Hooks compose (base first, extension second) instead of overwriting
  private static mergeParserContexts = (base?: CreateParserContext, extension?: CreateParserContext): CreateParserContext => {
    const merged = mergeObjects<CreateParserContext>(base, extension);
    const before = Parser.chainHooks(base?.before, extension?.before);
    const after = Parser.chainAfterHooks(base?.after, extension?.after);
    if (before) merged.before = before;
    if (after) merged.after = after;
    return merged;
  };

  public createProjection = <const T extends object>(
    project: T | ((context: ParserContext) => T | Promise<T>),
    parserContext?: CreateParserContext,
  ): ParserFunction<T> => {
    const parse = async (value: AppObject | string, instanceContext: ParserInstanceContext = {}, parentContext: Partial<ParserContext> = {}) => {
      // TODO(v4): remove migration catch
      if (instanceContext && 'parser' in instanceContext) {
        throw new Error(
          '[@bou-co/parsing] A full parser context was passed as the second argument — in v3 the parent context is the third argument: parser(input, instanceContext, parentContext)',
        );
      }
      const isRoot = parentContext.isRoot === undefined;

      if (!value) return undefined;
      if (value instanceof Promise) value = await value;
      const data: AppObject = typeof value === 'string' ? this.objectify(value) : value;

      const variables = { current: data };

      // Skip the async resolution once the global context is ready as this runs for every nested level
      const globalContext = typeof this.globalContext === 'function' || this.initializingGlobalContext ? await this.getGlobalContext() : this.globalContext;
      if (globalContext) Object.assign(variables, globalContext.variables);
      if (parentContext) Object.assign(variables, parentContext.variables);
      if (parserContext) Object.assign(variables, parserContext.variables);
      if (instanceContext) Object.assign(variables, instanceContext.variables);
      if (this.cache.variables) Object.assign(variables, this.cache.variables);

      const pipes = {};
      if (globalContext) Object.assign(pipes, globalContext.pipes);
      if (parentContext) Object.assign(pipes, parentContext.pipes);
      if (parserContext) Object.assign(pipes, parserContext.pipes);
      if (instanceContext) Object.assign(pipes, instanceContext.pipes);

      // Set after the spreads so a raw per-level config never leaks in as the merged namespace
      const resolvedTypes = mergeTypes(this.typesNamespace, parentContext.types, parserContext?.types, instanceContext.types);

      let contextBase: ParserContext = {
        parser: this,
        ...globalContext,
        ...parentContext,
        ...parserContext,
        ...instanceContext,
        isRoot,
        variables,
        pipes,
        types: resolvedTypes,
        data,
        // Explicit so a per-key value from parentContext never leaks into this level
        value: data,
        cache: mergeObjects(globalContext?.cache, parserContext?.cache, instanceContext?.cache),
        parent: isRoot ? undefined : parentContext,
        store: this.createStore(() => contextBase),
      } satisfies Partial<ParserContext> as any;
      contextBase.resolve = this.createContextResolve(contextBase);
      // The run cache is shared down from the root parse
      const patternRunCache = (contextBase as AppObject)[PATTERN_RUN_CACHE] ?? new Map();
      this.seedPatterns(contextBase, patternRunCache);

      const projection = typeof project === 'function' ? await project(contextBase) : project;
      Object.assign(contextBase, { projection, path: [...(parentContext.path ?? []), projection] });

      const dataIsArray = Array.isArray(data) && data.every((item) => item instanceof Object);
      if (dataIsArray) {
        const projectionIsArray = Array.isArray(projection);
        if (projectionIsArray) {
          const sameLength = data.length === projection.length;
          if (!sameLength) console.warn('Data and projection length do not match');
          const promises = data.map(async (item, index) => {
            const itemProjection = projection[index];
            if (!itemProjection) return undefined;
            const _parentContext: ParserContext = { ...contextBase, key: index, value: item };
            const _instanceContext = { ...instanceContext, index };
            const parserFn = this.createProjection(itemProjection, parserContext);
            return await parserFn(item, _instanceContext, _parentContext);
          });
          return Promise.all(promises).then(filterNill);
        }
        const parserFn = this.createProjection(projection, parserContext) as ParserFunction<AppObject>;
        const promises = data.map(async (item, index) => {
          const _parentContext: ParserContext = { ...contextBase, key: index, value: item };
          const _instanceContext = { ...instanceContext, index };
          return await parserFn(item, _instanceContext, _parentContext);
        });
        return Promise.all(promises).then(filterNill);
      }

      // One chain per level: global, schema (base, extensions), instance
      const contextsWithHooks = [globalContext, parserContext, instanceContext];
      const before = contextsWithHooks.reduce<ParserContextHook | undefined>((chain, context) => Parser.chainHooks(chain, context?.before), undefined);
      if (before) contextBase = await Parser.callHook(before, contextBase, async (context) => context);
      // Before hooks may replace contextBase
      contextBase.resolve = this.createContextResolve(contextBase);
      this.seedPatterns(contextBase, patternRunCache);

      const entries = Object.entries(projection);
      const conditionalEnties = [] as [string, unknown][];

      const promises = entries.map(async ([key, value]): Promise<undefined | [string, unknown]> => {
        const context: ParserContext = { ...contextBase, key, value: data?.[key] };
        context.resolve = this.createContextResolve(context);
        let castToken: TypeToken | undefined;

        const getValue = async (): Promise<undefined | [string, unknown]> => {
          if (key.startsWith('@')) {
            if (key === '@array') {
              return undefined;
            }

            if (key === '@if') {
              const items = value as ParserConditionalItems;
              // Guard against self-referencing projections when resolving without data
              const guardedContext = (ref: object): ParserContext | undefined => {
                const path = context.datalessPath;
                if (!path) return context;
                if (path.includes(ref)) return undefined;
                return { ...context, datalessPath: [...path, ref] };
              };
              const promises = items.map(async ({ when, then }) => {
                const shouldBeAdded = await when(context);
                if (shouldBeAdded) {
                  if (typeof then === 'function') {
                    if ('_parser' in then) {
                      const thenContext = guardedContext(('projection' in then ? then.projection : then) as object);
                      if (!thenContext) return;
                      const result = await then(data as any, instanceContext, thenContext);
                      conditionalEnties.push(...Object.entries(result));
                    } else {
                      const result = await then(context);
                      conditionalEnties.push(...Object.entries(result));
                    }
                  } else {
                    const thenContext = guardedContext(then);
                    if (!thenContext) return;
                    const parser = this.createProjection(then) as ParserFunction<AppObject>;
                    const result = await parser(data as any, instanceContext, thenContext);
                    conditionalEnties.push(...Object.entries(result));
                  }
                }
              });
              await Promise.all(promises);
              return undefined;
            }

            if (key.startsWith('@combine')) {
              const fn = value as (context: ParserContext) => Promise<AppObject>;
              const result = await fn(context);
              if (!result) return [key, undefined];
              const entries = Object.entries(result);
              conditionalEnties.push(...entries);
            }

            return undefined;
          }
          // TODO(v4): remove migration catch
          if (typeof value === 'string') assertNotLegacyTypeKey(value, context);

          if (isTypeToken(value)) {
            castToken = value;
            return [key, data?.[key]];
          }

          if (value instanceof Function) {
            if (value === typed) return [key, data[key]];
            if (value === optional) return [key, data[key]];
            if ('_parser' in value) {
              const result = await this.parseNested(value as any, parserRef(value), data?.[key], instanceContext, context);
              if (!('_flat' in value)) return [key, result];
              if (result === undefined || result === null) return undefined;
              if (Array.isArray(result)) throw new Error(`[@bou-co/parsing] .flat at "${String(key)}" merges object results only — got an array`);
              conditionalEnties.push(...Object.entries(result));
              return undefined;
            }

            if ('_cast' in value) {
              castToken = (value as { _cast: TypeToken })._cast;
              return [key, await value(context)];
            }
            const result = await value(context);
            if (result === '_inherit') return [key, data[key]];
            if (result instanceof Function && '_parser' in result) {
              return [key, await this.parseNested(result as any, parserRef(result), data?.[key], instanceContext, context)];
            }
            if (isTypeToken(result)) {
              castToken = result;
              return [key, data?.[key]];
            }
            return [key, result];
          }
          if (value instanceof Object) {
            if (value instanceof Promise) {
              return [key, await value];
            }
            return [key, await this.parseNested(this.createProjection(value), value, data?.[key], instanceContext, context)];
          }
          if (value) return [key, value];
          return [key, undefined];
        };

        const projectedValue = await getValue();
        if (projectedValue === undefined) return undefined;
        let [_key, _value] = projectedValue;
        // Null must still reach applyCast so a type default can apply
        if (_value === null) return [_key, castToken ? await applyCast(undefined, castToken, context) : undefined];
        if (typeof _value === 'object') {
          type AlreadyParsedObject = { _parsed?: boolean };
          const alreadyParsed = (_value as AlreadyParsedObject)._parsed;
          if (alreadyParsed) {
            if (castToken) return [_key, await applyCast(_value, castToken, context)];
            return [_key, _value];
          }
        }

        // Apply global transformers if they exist
        if (globalContext.transformers) {
          for (const transformer of Object.values(globalContext.transformers)) {
            if (await transformer.when({ ...context, data: _value, value: _value })) {
              _value = await transformer.then({ ...context, data: _value, value: _value });
            }
          }
        }

        // Casting is the final step so variables and transformers resolve first
        const processedValue = await Parser.resolveVariables(_value, context);
        if (castToken) return [_key, await applyCast(processedValue, castToken, context)];
        return [_key, processedValue];
      });

      const resolved = await Promise.all(promises).then(filterNill).then(filterUndefinedEntries);
      if (Array.isArray(projection)) return resolved.map(([, value]) => value);
      let combined = Object.fromEntries([...resolved, ...conditionalEnties]);
      const after = contextsWithHooks.reduce<ParserContextHook | undefined>((chain, context) => Parser.chainAfterHooks(chain, context?.after), undefined);
      if (after) {
        const afterResult = await Parser.callHook(after, { ...contextBase, data: combined }, async (context) => context);
        if (afterResult.data) combined = afterResult.data;
      }
      return new Proxy(combined, {
        get: (target, prop) => {
          // Add "_parsed" property to indicate that the object has been parsed and does not need to be checked for variables again
          if (prop === '_parsed') return true;
          return target[prop as keyof typeof combined];
        },
      });
    };

    const withContext = (context: Partial<ParserInstanceContext>) => {
      const _parserContext = Parser.mergeParserContexts(parserContext, context);
      return this.createProjection(project, _parserContext);
    };

    // toHash stringifies functions, so parsers must hash by their projection instead of the shared parse source
    let projectionHash: string | undefined;
    const parserToString = () => (projectionHash ??= `__parser:${toHash(project)}__`);

    const createParseVariant = (marker: '_flat' | '_array', toString: () => string) => {
      const variant = (data: AppObject | string, instanceContext?: ParserInstanceContext, parentContext?: Partial<ParserContext>) => {
        return parse(data, instanceContext, parentContext);
      };
      Object.defineProperty(variant, '_parser', { value: true });
      Object.defineProperty(variant, marker, { value: true });
      Object.defineProperty(variant, 'projection', { value: project });
      Object.defineProperty(variant, 'toString', { value: toString });
      return variant;
    };

    // Lazy as createProjection runs per nested parse
    let flatParser: unknown;
    let arrayParser: unknown;

    Object.defineProperty(parse, 'as', { value: parse });
    Object.defineProperty(parse, 'asArray', { get: () => (arrayParser ??= createParseVariant('_array', parserToString)) });
    Object.defineProperty(parse, 'flat', { get: () => (flatParser ??= createParseVariant('_flat', () => `__parser-flat:${toHash(project)}__`)) });
    Object.defineProperty(parse, 'withContext', { value: withContext });
    Object.defineProperty(parse, 'toString', { value: parserToString });
    Object.defineProperty(parse, '_parser', { value: true });
    Object.defineProperty(parse, 'projection', { value: project });

    Object.defineProperty(parse, 'extend', {
      value: <X extends ParserProjection>(extendProject: X, extendContext?: CreateParserContext): ParserFunction<T & X> => {
        if (typeof project === 'function') throw new Error('Cannot extend a projection that is a function');
        const _project = { ...project, ...extendProject };
        const _parserContext = Parser.mergeParserContexts(parserContext, extendContext);
        return this.createProjection(_project, _parserContext);
      },
    });

    return parse as unknown as ParserFunction<T>;
  };

  public createParser = <const T extends ParserProjection>(
    project: T | ((context: ParserContext) => T | Promise<T>),
    parserContext?: CreateParserContext,
  ): ParserFunction<T> => {
    const projectionFn = this.createProjection(project, parserContext);

    const proxyFn = new Proxy(projectionFn, {
      apply: async (target: any, _thisArg: unknown, args: [any, ParserInstanceContext]) => {
        const globalContext = await this.getGlobalContext();
        if (!globalContext.storage) return await target(...args);
        const [data, instanceContext] = args;

        const cache: ParserCachingOptions = mergeObjects(globalContext?.cache, parserContext?.cache, instanceContext?.cache);
        if (!cache.enabled) return await target(...args);

        const variables = { current: data };
        if (globalContext) Object.assign(variables, globalContext.variables);
        if (parserContext) Object.assign(variables, parserContext.variables);
        if (instanceContext) Object.assign(variables, instanceContext.variables);

        const pipes = {};
        if (globalContext) Object.assign(pipes, globalContext.pipes);
        if (parserContext) Object.assign(pipes, parserContext.pipes);
        if (instanceContext) Object.assign(pipes, instanceContext.pipes);

        const context: CachingParserContext = {
          parser: this,
          ...globalContext,
          ...parserContext,
          ...instanceContext,
          variables,
          pipes,
          types: mergeTypes(this.typesNamespace, parserContext?.types, instanceContext?.types),
          data,
          projection: projectionFn.projection,
          cache,
        } satisfies Partial<CachingParserContext> as any;

        const _key = globalContext.storage.generateKey ? globalContext.storage.generateKey(context) : `${toHash(projectionFn.projection)}:${toHash(args)}`;

        const cachedValue = await globalContext.storage.match(_key, context);
        if (cachedValue) return cachedValue;
        const newValue = await target(...args);
        await globalContext.storage.add(_key, newValue, context);

        return newValue;
      },
    });

    return proxyFn;
  };
}

export interface InitializedParser<T> {
  createParser: Parser['createParser'];
  resolve: Parser['resolve'];
  /** Value caching through the global storage: `store(key, fn)`, `store.match`, `store.add`, `store.remove`, `store.clear` */
  store: Parser['store'];
  /** Built-in types plus everything registered via the global context's `types` (object form) */
  types: T;
  /** Proxy shorthand for variable expressions: `variables.user.name` resolves like `'{{user.name}}'` */
  variables: typeof variables;
}

/** Create an isolated parser engine; object-form `types` registrations extend the returned `types` namespace */
export function initializeParser<const T extends ParserTypesConfig>(
  addGlobalContext: ParserGlobalContext & { types: T },
): InitializedParser<RegisteredTypes<DefaultParserTypes, T>>;
export function initializeParser(addGlobalContext?: ParserGlobalContext | ParserGlobalContextFn): InitializedParser<DefaultParserTypes>;
export function initializeParser(addGlobalContext?: ParserGlobalContext | ParserGlobalContextFn): InitializedParser<unknown> {
  const engine = new Parser(addGlobalContext || ({} as ParserGlobalContext));
  const { createParser, resolve, store } = engine;
  return { createParser, resolve, store, types: engine.types, variables };
}

export const resolveVariables = async <T>(current: T, context: ParserContext): Promise<T> => {
  return Parser.resolveVariables(current, context);
};

export const getVariableValue = async <T = unknown>(variable: string, context: ParserContext): Promise<T> => {
  return Parser.getVariableValue(variable, context);
};

export * from './parser-types';
