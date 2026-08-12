/* eslint-disable @typescript-eslint/no-explicit-any */
import { ParserCachingOptions } from './expandable-types';
import { getFromObject } from './internal';
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
} from './parser-types';
import { applyCast, assertNotLegacyTypeKey, isTypeToken, ParserTypeToken, types } from './parser-casting';
import { asyncMapObject, filterNill, filterUndefinedEntries, mergeObjects, optional, typed } from './parser-util';
import { toHash } from './to-hash';

interface ParserCache {
  variables: Record<string, any>;
  pending: Map<string, Promise<any>>;
}

export class Parser {
  private cache: ParserCache = { variables: {}, pending: new Map() };

  private initializingGlobalContext = false;
  private globalContext: ParserGlobalContext | ParserGlobalContextFn;

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

  public objectify = (value: string) => {
    try {
      return JSON.parse(value);
    } catch (error) {
      throw { title: 'Parser stringify error', error, value };
    }
  };

  /**
   * Retrieves the value of a variable from the context based on the provided match string.
   * The match string should be in the format `{{variableName}}` or `{{variableName|pipeConfig}}`.
   * If the variable is not found, it will try to resolve it using the variable resolver function from the context.
   * If the variable is an object, it will apply the specified pipe configuration to the value.
   * If the variable is a string, it will return the string without any processing.
   * If the variable is a number, it will return the number as is.
   * If the variable is a boolean, it will return the boolean as is.
   * If the variable is an array, it will return the array as is.
   * @param match The match string containing the variable name and optional pipe configuration.
   * @param context The context containing variable definitions and a variable resolver function.
   * @returns A promise that resolves to the value of the variable, processed according to the pipe configuration if applicable.
   * @throws Will throw an error if the pipe is not found or if the pipe is not a function.
   */
  public static getVariableValue = async <T = unknown>(match: string, context: ParserContext): Promise<T> => {
    const { variables, variableResolver } = context;
    if (match === '{{...}}') return variables as T;

    const parts = match
      .slice(2, -2)
      .split('||')
      .map((item) => item.trim());

    for (const part of parts) {
      const [variable, pipeConfig] = part.split('|').map((item) => item.trim());
      const handlePipe = async <T>(value: T) => {
        if (!pipeConfig) return value;
        const [pipeName, ...pipeParams] = pipeConfig.split(':').map((item) => item.trim());
        const pipe = await getFromObject(variables, pipeName);
        if (!pipe) throw new Error(`Pipe "${pipeName}" not found`);
        if (typeof pipe !== 'function') throw new Error(`Pipe "${pipeName}" is not a function`);
        const params = await Promise.all(
          pipeParams.map(async (param) => {
            if (/^".+"$/.test(param)) return param.slice(1, -1) as T;
            if (/^\d+$/.test(param)) return parseInt(param, 10) as T;
            if (/^false$|^true$/.test(param)) return param === 'true' ? (true as T) : (false as T);
            const paramValue = await getFromObject(variables, param, context);
            if (typeof paramValue === 'function') return await paramValue(context);
            return paramValue;
          }),
        );
        return await pipe({ ...context, data: value, params: params.length ? params : undefined });
      };

      if (/^".+"$/.test(variable)) return variable.slice(1, -1) as T;
      if (/^\d+$/.test(variable)) return parseInt(variable, 10) as T;
      if (/^false$|^true$/.test(variable)) return variable === 'true' ? (true as T) : (false as T);

      const resolveVariableValue = async (path: string): Promise<unknown> => {
        const cacheVariable = <T>(value: T): T => {
          if (!context.parser) return value;
          return context.parser.cacheVariable(path, value);
        };

        let value: unknown = await getFromObject(variables, path, context);
        if (value === undefined && variableResolver) value = await variableResolver(path, context, cacheVariable);
        if (typeof value === 'function') value = await value(context);
        return value;
      };

      const [key, ...rest] = variable.split('.');
      let value = await resolveVariableValue(key);
      if (value && typeof value === 'object' && rest.length) value = await getFromObject(value, rest.join('.'), context);
      if (value !== undefined || context.pipeUndefined) return handlePipe(value);
    }
    return undefined as T;
  };

  /**
   * Resolves variables in the current value based on the context.
   * If the current value is an object, it recursively resolves its properties.
   * If the current value is a string, it checks for variables wrapped in `{{}}` and replaces them with their values.
   * @param current The value to resolve variables in.
   * @param context The context containing variable definitions and other information.
   * @returns A promise that resolves to the value with variables resolved.
   */
  public static resolveVariables = async <T>(current: T, context: ParserContext): Promise<T> => {
    // If the current value does not exist, return it as is
    if (!current) return current;

    // If the current value is an object, iterate over its entries
    if (typeof current === 'object') {
      const callback = (value: any) => this.resolveVariables(value, context);
      return asyncMapObject(current, callback);
    }

    // If the current value is a string, check if it contains a variable
    if (typeof current === 'string') {
      const variables = current.match(/\{\{[^}]+\}\}/g);
      if (!variables) return current;
      const isVariable = current.match(/^\{\{[^}]+\}\}$/);
      if (isVariable) return this.getVariableValue(current, context);

      return variables.reduce(
        async (acc, variableName) => {
          const awaited = await acc;
          const value = await this.getVariableValue<string>(variableName, context);
          return awaited.replace(variableName, value);
        },
        Promise.resolve(current) as Promise<string>,
      ) as T;
    }
    return current;
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

      const globalContext = await this.getGlobalContext();
      if (globalContext) Object.assign(variables, globalContext.variables);
      if (parentContext) Object.assign(variables, parentContext.variables);
      if (parserContext) Object.assign(variables, parserContext.variables);
      if (instanceContext) Object.assign(variables, instanceContext.variables);
      if (this.cache.variables) Object.assign(variables, this.cache.variables);

      let contextBase: ParserContext = {
        parser: this,
        ...globalContext,
        ...parentContext,
        ...parserContext,
        ...instanceContext,
        isRoot,
        variables,
        data,
        cache: mergeObjects(globalContext?.cache, parserContext?.cache, instanceContext?.cache),
        parent: isRoot ? undefined : parentContext,
        store: (key, fn, options) => this.storeValue(contextBase, key, fn, options),
      } satisfies Partial<ParserContext> as any;

      const projection = typeof project === 'function' ? await project(contextBase) : project;
      Object.assign(contextBase, { projection });

      const dataIsArray = Array.isArray(data) && data.every((item) => item instanceof Object);
      if (dataIsArray) {
        const projectionIsArray = Array.isArray(projection);
        if (projectionIsArray) {
          const sameLength = data.length === projection.length;
          if (!sameLength) console.warn('Data and projection length do not match');
          const promises = data.map(async (item, index) => {
            const itemProjection = projection[index];
            if (!itemProjection) return undefined;
            const _parentContext: ParserContext = { ...contextBase, key: index };
            const _instanceContext = { ...instanceContext, index };
            const parserFn = this.createProjection(itemProjection, parserContext);
            return await parserFn(item, _instanceContext, _parentContext);
          });
          return Promise.all(promises).then(filterNill);
        }
        const parserFn = this.createProjection(projection, parserContext) as ParserFunction<AppObject>;
        const promises = data.map(async (item, index) => {
          const _parentContext: ParserContext = { ...contextBase, key: index };
          const _instanceContext = { ...instanceContext, index };
          return await parserFn(item, _instanceContext, _parentContext);
        });
        return Promise.all(promises).then(filterNill);
      }

      const contextsWithHooks = [globalContext, parserContext, instanceContext];
      for (const context of contextsWithHooks) {
        if (context?.before) contextBase = await context.before(contextBase);
      }

      const entries = Object.entries(projection);
      const conditionalEnties = [] as [string, unknown][];

      const promises = entries.map(async ([key, value]): Promise<undefined | [string, unknown]> => {
        const context: ParserContext = { ...contextBase, key };
        let castToken: ParserTypeToken | undefined;

        const getValue = async (): Promise<undefined | [string, unknown]> => {
          if (key.startsWith('@')) {
            if (key === '@array') {
              return undefined;
            }

            if (key === '@if') {
              const items = value as ParserConditionalItems;
              const promises = items.map(async ({ when, then }) => {
                const shouldBeAdded = await when(context);
                if (shouldBeAdded) {
                  if (typeof then === 'function') {
                    if ('_parser' in then) {
                      const result = await then(data as any, instanceContext, context);
                      conditionalEnties.push(...Object.entries(result));
                    } else {
                      const result = await then(context);
                      conditionalEnties.push(...Object.entries(result));
                    }
                  } else {
                    const parser = this.createProjection(then) as ParserFunction<AppObject>;
                    const result = await parser(data as any, instanceContext, context);
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
              if ('_flat' in value) {
                const result = await value(data?.[key], instanceContext, context);
                if (result === undefined || result === null) return undefined;
                if (Array.isArray(result)) throw new Error(`[@bou-co/parsing] .flat at "${String(key)}" merges object results only — got an array`);
                conditionalEnties.push(...Object.entries(result));
                return undefined;
              }
              return [key, await value(data?.[key], instanceContext, context)];
            }

            const result = await value(context);
            if (result === '_inherit') return [key, data[key]];
            if (result instanceof Function && '_parser' in result) {
              return [key, await result(data[key], instanceContext, context)];
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
            if (!data?.[key]) return [key, undefined];
            const parserFn = this.createProjection(value);

            // Check if calue for current key is an object
            if (data[key] instanceof Object) {
              return [key, await parserFn(data[key], instanceContext, context)];
            }
            // Check if value is a string that looks like a string object or a variable
            if (typeof data[key] === 'string') {
              // Match objects that are stringified
              const isStringObject = data[key].match(/^\{[^}]+\}$/);
              if (isStringObject) return [key, await parserFn(data[key], instanceContext, context)];

              // Match variables that are wrapped in double curly braces
              const isVariable = data[key].match(/^\{\{[^}]+\}\}$/);
              if (!isVariable) return [key, undefined];
              const variable = Parser.getVariableValue(data[key], context);
              if (variable instanceof Object) return [key, await parserFn(variable, instanceContext, context)];
            }
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
            if (transformer.when({ ...context, data: _value })) {
              _value = await transformer.then({ ...context, data: _value });
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

    Object.defineProperty(parse, 'as', { value: parse });
    Object.defineProperty(parse, 'asArray', { value: parse });
    Object.defineProperty(parse, 'withContext', { value: withContext });
    Object.defineProperty(parse, '_parser', { value: true });
    Object.defineProperty(parse, 'projection', { value: project });

    // Lazy so the common path pays nothing — createProjection runs per nested parse
    let flatParser: unknown;
    Object.defineProperty(parse, 'flat', {
      get: () => {
        if (!flatParser) {
          const flat = (data: AppObject | string, instanceContext?: ParserInstanceContext, parentContext?: Partial<ParserContext>) => {
            return parse(data, instanceContext, parentContext);
          };
          Object.defineProperty(flat, '_parser', { value: true });
          Object.defineProperty(flat, '_flat', { value: true });
          Object.defineProperty(flat, 'projection', { value: project });
          Object.defineProperty(flat, 'toString', { value: () => `__parser-flat:${toHash(project)}__` });
          flatParser = flat;
        }
        return flatParser;
      },
    });

    // toHash stringifies functions via toString — parsers must hash by their projection, not the shared parse source
    let projectionHash: string | undefined;
    Object.defineProperty(parse, 'toString', { value: () => (projectionHash ??= `__parser:${toHash(project)}__`) });

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

        const context: CachingParserContext = {
          parser: this,
          ...globalContext,
          ...parserContext,
          ...instanceContext,
          variables,
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
  const { createParser } = engine;
  return { createParser, types };
};

export const resolveVariables = async <T>(current: T, context: ParserContext): Promise<T> => {
  return Parser.resolveVariables(current, context);
};

export const getVariableValue = async <T = unknown>(variable: string, context: ParserContext): Promise<T> => {
  if (!/^\{\{[^}]+\}\}$/.test(variable)) variable = `{{${variable}}}`;
  return Parser.getVariableValue(variable, context);
};

export * from './parser-types';
