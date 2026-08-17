/* eslint-disable @typescript-eslint/no-explicit-any */
import { ParserCachingOptions } from './expandable-types';
import { canResolveDataless, hasArrayDirective, isDatalessInput } from './internal';
import {
  ParserFunction,
  ParserContext,
  ParserConditionalItems,
  ParserProjection,
  ParserGlobalContextFn,
  AppObject,
  CreateParserContext,
  ParserInstanceContext,
  ParserGlobalContext,
  CachingParserContext,
  ParserResolveFunction,
  ContextResolveFunction,
} from './parser-types';
import { applyCast, assertNotLegacyTypeKey, isTypeToken, ParserTypeToken, types } from './parser-casting';
import {
  CompiledPatternRegistry,
  compilePatternRegistry,
  evaluateVariableExpression,
  matchFullPattern,
  PATTERN_REGISTRY,
  PATTERN_RUN_CACHE,
  resolvePatternMatch,
  resolvePatternsInText,
} from './parser-patterns';
import { filterNill, filterUndefinedEntries, mergeObjects, optional, typed } from './parser-util';
import { toHash } from './to-hash';

interface ParserCache {
  variables: Record<string, any>;
  pending: Map<string, Promise<any>>;
}

export class Parser {
  private cache: ParserCache = { variables: {}, pending: new Map() };

  private initializingGlobalContext = false;
  private globalContext: ParserGlobalContext | ParserGlobalContextFn;
  private patternRegistry?: CompiledPatternRegistry;

  constructor(globalContext: ParserGlobalContext | ParserGlobalContextFn = {} as ParserGlobalContext) {
    this.globalContext = globalContext;
  }

  private async getGlobalContext() {
    while (this.initializingGlobalContext) {
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
    if (typeof this.globalContext === 'function') {
      this.initializingGlobalContext = true;
      this.globalContext = await this.globalContext();
    }
    this.initializingGlobalContext = false;
    return this.globalContext;
  }

  public cacheVariable = <T>(path: string, value: T): T => {
    Object.assign(this.cache.variables, { [path]: value });
    return value;
  };

  // Only safe to call once the global context has resolved (patterns are global-only)
  private getPatternRegistry = (): CompiledPatternRegistry => {
    return (this.patternRegistry ??= compilePatternRegistry((this.globalContext as ParserGlobalContext).patterns));
  };

  private storeValue = async <T>(context: ParserContext, key: string, fn: () => T | Promise<T>, options?: ParserCachingOptions): Promise<T> => {
    const { storage } = context;
    if (!storage) return fn();

    const { pending } = this.cache;
    const existing = pending.get(key);
    if (existing) return existing;

    const _fn = async () => {
      const storeContext: CachingParserContext = { ...context, cache: mergeObjects(context.cache, options) };
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

  // Resolves a nested projection without matching data so data independent values still produce output
  private parseDataless = async (
    parserFn: (data: AppObject | string, instanceContext?: ParserInstanceContext, parentContext?: ParserContext) => Promise<unknown>,
    ref: object,
    instanceContext: ParserInstanceContext,
    context: ParserContext,
  ): Promise<unknown> => {
    // If the projection was already resolved in this data-less chain, stop to prevent infinite recursion
    const path = context.datalessPath ?? [];
    if (path.includes(ref)) return undefined;
    // Use a fresh empty object as data since before hooks may mutate it
    const result = await parserFn({}, instanceContext, { ...context, datalessPath: [...path, ref] });
    // If nothing was resolved, return undefined so the key is omitted
    if (result && typeof result === 'object' && !Array.isArray(result) && Object.keys(result).length === 0) return undefined;
    return result;
  };

  public objectify = (value: string) => {
    try {
      return JSON.parse(value);
    } catch (error) {
      throw { title: 'Parser stringify error', error, value };
    }
  };

  /**
   * Resolves a variable expression through the active variables pattern.
   * Accepts the pattern's own syntax (`{{variableName}}` by default), the legacy `{{path}}` form, or a bare path.
   * Expression grammar (`||` fallbacks, literals, `| pipe:params`) is applied unless the pattern opts out.
   * @throws Will throw an error if a referenced pipe is not found or is not a function.
   */
  public static getVariableValue = async <T = unknown>(match: string, context: ParserContext): Promise<T> => {
    return evaluateVariableExpression(match, context) as Promise<T>;
  };

  /**
   * Resolves patterns (variables by default) in the current value based on the context.
   * If the current value is an object, it recursively resolves its properties.
   * If the current value is a string, registered patterns are matched and replaced with their resolved values.
   * @param current The value to resolve patterns in.
   * @param context The context containing variable definitions and other information.
   * @returns A promise that resolves to the value with patterns resolved.
   */
  public static resolveVariables = async <T>(current: T, context: ParserContext): Promise<T> => {
    return this.resolveValue(current, context) as T | Promise<T>;
  };

  // Resolves values without allocating promises for the ones that contain no variables
  private static resolveValue = (current: unknown, context: ParserContext): unknown => {
    // If the current value does not exist, return it as is
    if (!current) return current;

    // If the current value is an object, resolve each entry and await only the asynchronous ones
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

    // If the current value is a string, resolve any patterns it contains (returns the string as-is when there are none)
    if (typeof current === 'string') return resolvePatternsInText(current, context);
    return current;
  };

  // Resolves variables and applies global transformers on raw input without parsing it against a projection
  public resolve = (async (input: unknown, instanceContext: ParserInstanceContext = {}) => {
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
      data: input,
      value: input,
      cache: mergeObjects(globalContext?.cache, instanceContext?.cache),
      store: (key, fn, options) => this.storeValue(context, key, fn, options),
    } satisfies Partial<ParserContext<unknown>> as any;
    context.resolve = this.createContextResolve(context);
    Object.assign(context, { [PATTERN_REGISTRY]: this.getPatternRegistry(), [PATTERN_RUN_CACHE]: new Map() });

    return this.resolveNode(input, context);
  }) as ParserResolveFunction;

  // Backs context.resolve — same resolution as the public resolve but inheriting the calling context
  private resolveWithParentContext = (input: unknown, parentContext: ParserContext, instanceContext?: ParserInstanceContext): Promise<unknown> => {
    const variables = { ...parentContext.variables, ...instanceContext?.variables, current: input };
    const pipes = { ...parentContext.pipes, ...instanceContext?.pipes };
    const context: ParserContext = { ...parentContext, ...instanceContext, variables, pipes, data: input, value: input } satisfies Partial<
      ParserContext<unknown>
    > as any;
    context.store = (key, fn, options) => this.storeValue(context, key, fn, options);
    context.resolve = this.createContextResolve(context);
    return this.resolveNode(input, context);
  };

  // Wires context.resolve: zero-arg lazily resolves context.value, memoized per context so
  // DB-backed variable resolution runs once; resolve(undefined) is distinguished by arity
  private createContextResolve = (context: ParserContext): ContextResolveFunction => {
    let memo: Promise<unknown> | undefined;
    const contextResolve = (...args: [unknown?, ParserInstanceContext?]) => {
      if (!args.length) return (memo ??= this.resolveWithParentContext(context.value, context));
      return this.resolveWithParentContext(args[0], context, args[1]);
    };
    return contextResolve as ContextResolveFunction;
  };

  // Unlike parse, transformers apply at every nesting level since there is no projection to scope them
  private resolveNode = async (value: unknown, context: ParserContext): Promise<unknown> => {
    if (value instanceof Promise) return this.resolveNode(await value, context);
    if (typeof value === 'function') {
      // Branded functions (type tokens, parsers) are parse concerns — pass through untouched
      if ('_type' in value || '_parser' in value) return value;
      const result = await (value as (context: ParserContext) => unknown)(context);
      return this.resolveNode(result, context);
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

  public createProjection = <const T extends object>(
    project: T | ((context: ParserContext) => T | Promise<T>),
    parserContext?: CreateParserContext,
  ): ParserFunction<T> => {
    const parse = async (value: AppObject | string, instanceContext: ParserInstanceContext = {}, parentContext: Partial<ParserContext> = {}) => {
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

      let contextBase: ParserContext = {
        parser: this,
        ...globalContext,
        ...parentContext,
        ...parserContext,
        ...instanceContext,
        isRoot,
        variables,
        pipes,
        data,
        // Explicit so a per-key value from parentContext never leaks into this level
        value: data,
        cache: mergeObjects(globalContext?.cache, parserContext?.cache, instanceContext?.cache),
        parent: isRoot ? undefined : parentContext,
        store: (key, fn, options) => this.storeValue(contextBase, key, fn, options),
      } satisfies Partial<ParserContext> as any;
      contextBase.resolve = this.createContextResolve(contextBase);
      // The registry always belongs to this engine; the run cache is shared down from the root parse
      const patternRunCache = (contextBase as AppObject)[PATTERN_RUN_CACHE] ?? new Map();
      Object.assign(contextBase, { [PATTERN_REGISTRY]: this.getPatternRegistry(), [PATTERN_RUN_CACHE]: patternRunCache });

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

      const contextsWithHooks = [globalContext, parserContext, instanceContext];
      for (const context of contextsWithHooks) {
        if (context?.before) contextBase = await context.before(contextBase);
      }
      // Before hooks may replace contextBase; re-wire so resolve targets the active context
      contextBase.resolve = this.createContextResolve(contextBase);
      Object.assign(contextBase, { [PATTERN_REGISTRY]: this.getPatternRegistry(), [PATTERN_RUN_CACHE]: patternRunCache });

      const entries = Object.entries(projection);
      const conditionalEnties = [] as [string, unknown][];

      const promises = entries.map(async ([key, value]): Promise<undefined | [string, unknown]> => {
        const context: ParserContext = { ...contextBase, key, value: data?.[key] };
        context.resolve = this.createContextResolve(context);
        let castToken: ParserTypeToken | undefined;

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
          if (typeof value === 'string') assertNotLegacyTypeKey(value, context);

          if (value instanceof Function) {
            if (value === typed) return [key, data[key]];
            if (value === optional) return [key, data[key]];
            if (isTypeToken(value)) {
              castToken = value;
              return [key, data?.[key]];
            }
            if ('_parser' in value) {
              const input = data?.[key];
              const projection = 'projection' in value ? (value as { projection?: unknown }).projection : undefined;
              const dataless = isDatalessInput(input) && canResolveDataless(value, projection);
              if ('_flat' in value) {
                const result = dataless
                  ? await this.parseDataless(value as any, (projection ?? value) as object, instanceContext, context)
                  : await value(input, instanceContext, context);
                if (result === undefined || result === null) return undefined;
                if (Array.isArray(result)) throw new Error(`[@bou-co/parsing] .flat at "${String(key)}" merges object results only — got an array`);
                conditionalEnties.push(...Object.entries(result));
                return undefined;
              }
              if (dataless) return [key, await this.parseDataless(value as any, (projection ?? value) as object, instanceContext, context)];
              return [key, await value(input, instanceContext, context)];
            }

            const result = await value(context);
            if (result === '_inherit') return [key, data[key]];
            if (result instanceof Function && '_parser' in result) {
              const input = data[key];
              const projection = 'projection' in result ? (result as { projection?: unknown }).projection : undefined;
              if (isDatalessInput(input) && canResolveDataless(result, projection)) {
                return [key, await this.parseDataless(result as any, (projection ?? result) as object, instanceContext, context)];
              }
              return [key, await result(input, instanceContext, context)];
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
            const input = data?.[key];
            const parserFn = this.createProjection(value);

            // Check if value for current key is an object
            if (input instanceof Object) {
              return [key, await parserFn(input, instanceContext, context)];
            }
            // Check if value is a string that looks like a string object or a variable
            if (typeof input === 'string' && input !== '') {
              // Match objects that are stringified
              const isStringObject = input.match(/^\{[^}]+\}$/);
              if (isStringObject) return [key, await parserFn(input, instanceContext, context)];

              // Match a full-string pattern (a variable by default) that may resolve to an object
              const fullPattern = matchFullPattern(input, context);
              if (fullPattern) {
                const resolved = await resolvePatternMatch(fullPattern, context);
                if (resolved instanceof Object) return [key, await parserFn(resolved as AppObject, instanceContext, context)];
              }
            }
            // Array projections always require data
            if (Array.isArray(value) || hasArrayDirective(value)) return [key, undefined];
            // Otherwise resolve the projection without data
            return [key, await this.parseDataless(parserFn, value, instanceContext, context)];
          }
          if (value) return [key, value];
          return [key, undefined];
        };

        const projectedValue = await getValue();
        if (projectedValue === undefined) return undefined;
        let [_key, _value] = projectedValue;
        // Null still skips transformers/variables, but must reach applyCast so a type default can apply
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
            if (transformer.when({ ...context, data: _value, value: _value })) {
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
      for (const context of contextsWithHooks) {
        if (context?.after) {
          const afterResult = await context.after({ ...contextBase, data: combined });
          if (afterResult.data) combined = afterResult.data;
        }
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
      const _parserContext = mergeObjects(parserContext, context);
      return this.createProjection(project, _parserContext);
    };

    // toHash stringifies functions via toString — parsers must hash by their projection, not the shared parse source
    let projectionHash: string | undefined;
    const parserToString = () => (projectionHash ??= `__parser:${toHash(project)}__`);

    // Creates a marked variant of the parse function, used for the lazy flat and asArray properties
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

    // Lazy so the common path pays nothing — createProjection runs per nested parse
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
        const _parserContext = mergeObjects(parserContext, extendContext);
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

export const initializeParser = (addGlobalContext?: ParserGlobalContext | ParserGlobalContextFn) => {
  const engine = new Parser(addGlobalContext || ({} as ParserGlobalContext));
  const { createParser, resolve } = engine;
  return { createParser, resolve, types };
};

export const resolveVariables = async <T>(current: T, context: ParserContext): Promise<T> => {
  return Parser.resolveVariables(current, context);
};

export const getVariableValue = async <T = unknown>(variable: string, context: ParserContext): Promise<T> => {
  return Parser.getVariableValue(variable, context);
};

export * from './parser-types';
