/* eslint-disable @typescript-eslint/no-explicit-any */
import { getFromObject } from './internal';
import { ParserFunction, ParserContext, valueKeys, ParserConditionalItems, ParserProjection, ParserGlobalContextFn, AppObject } from './parser-types';
import { asDate, asyncMapObject, filterNill, optional, typed } from './parser-util';

class Parser {
  static parserGlobalContext: ParserGlobalContextFn;
  public objectify = (value: string) => {
    try {
      return JSON.parse(value);
    } catch (error) {
      throw { title: 'Parser stringify error', error, value };
    }
  };

  public project = <const T extends object>(projection: T, parserContext?: AppObject): ParserFunction<T> => {
    const parse = async (value: AppObject | string, instanceContext?: AppObject, parentContext?: ParserContext) => {
      if (!value) return undefined;
      const data: AppObject = typeof value === 'string' ? this.objectify(value) : value;
      const projectionIsArray = Array.isArray(projection);
      const dataIsArray = Array.isArray(data) && data.every((item) => item instanceof Object);

      if (dataIsArray) {
        if (projectionIsArray) {
          const sameLength = data.length === projection.length;
          if (!sameLength) console.warn('Data and projection length do not match');
          const promises = data.map(async (item, index) => {
            const itemProjection = projection[index];
            const context: ParserContext = {
              parentContext,
              instanceContext,
              data,
              key: index,
              projection,
            };
            if (!itemProjection) return undefined;
            const parserFn = this.project(itemProjection);
            return await parserFn(item, instanceContext, context);
          });
          return Promise.all(promises).then(filterNill);
        }
        const parserFn = this.project(projection) as ParserFunction<AppObject>;
        const promises = data.map(async (item, index) => {
          const context: ParserContext = {
            parentContext,
            instanceContext,
            data,
            key: index,
            projection,
          };
          return await parserFn(item, instanceContext, context);
        });
        return Promise.all(promises).then(filterNill);
      }

      const entries = Object.entries(projection);
      const conditionalEnties = [] as [string, unknown][];

      const variables = { current: data };

      const parserGlobalContext = await Parser.parserGlobalContext();
      if (parserGlobalContext) Object.assign(variables, parserGlobalContext);
      if (parserContext) Object.assign(variables, parserContext);
      if (instanceContext) Object.assign(variables, instanceContext);
      if (parentContext) Object.assign(variables, parentContext);

      const promises = entries.map(async ([key, value]): Promise<undefined | [string, unknown]> => {
        const context: ParserContext = {
          parserContext,
          instanceContext,
          parentContext,
          data,
          key,
          projection,
        };

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
                      const result = await then(data, instanceContext, context);
                      conditionalEnties.push(...Object.entries(result));
                    } else {
                      const result = await then(context);
                      conditionalEnties.push(...Object.entries(result));
                    }
                  } else {
                    const parser = this.project(then) as ParserFunction<AppObject>;
                    const result = await parser(data, instanceContext, context);
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
          if (value === 'date') return [key, asDate(data[key])];

          if (value instanceof Function) {
            if (value === typed) return [key, data[key]];
            if (value === optional) return [key, data[key]];
            if ('_parser' in value) return [key, await value(data?.[key], context)];
            // return [key, await value(context)];
            const result = await value(context);
            if (result === '_inherit') return [key, data[key]];
            if (result instanceof Function && '_parser' in result) {
              return [key, await result(data[key], context)];
            }
            return [key, result];
          }
          if (value instanceof Object) {
            if (value instanceof Promise) {
              return [key, await value];
            }
            if (!data?.[key]) return [key, undefined];
            const parserFn = this.project(value);
            return [key, await parserFn(data[key], instanceContext, context)];
          }
          if (valueKeys.includes(value)) return [key, data[key]];
          if (/^array<.+>/gi.test(value)) return [key, data[key]];
          if (value) return [key, value];
          return [key, undefined];
        };

        const getVariableValue = async <T = unknown>(match: string): Promise<T> => {
          if (match === '{{...}}') return instanceContext as T;

          const options = match
            .slice(2, -2)
            .split('||')
            .map((item) => item.trim());

          for (const variableName of options) {
            if (/".+"/.test(variableName)) return variableName.slice(1, -1) as T;
            const value = await getFromObject(variables, variableName);
            if (typeof value === 'function') {
              const res = await value(context);
              if (res) return res;
            } else if (value !== undefined) return value as T;
          }
          return undefined as T;
        };

        const findVariables = async <T>(current: T): Promise<T> => {
          // If the current value does not exist, return it as is
          if (!current) return current;

          // If the current value is an object, iterate over its entries
          if (typeof current === 'object') {
            return asyncMapObject(current, findVariables);
          }

          // If the current value is a string, check if it contains a variable
          if (typeof current === 'string') {
            const variables = current.match(/\{\{[^}]+\}\}/g);
            if (!variables) return current;
            const isVariable = current.match(/^\{\{[^}]+\}\}$/);
            if (isVariable) return getVariableValue(current);

            return variables.reduce(
              async (acc, variableName) => {
                const awaited = await acc;
                const value = await getVariableValue<string>(variableName);
                return awaited.replace(variableName, value);
              },
              Promise.resolve(current) as Promise<string>,
            ) as T;
          }
          return current;
        };

        const projectedValue = await getValue();
        if (projectedValue === undefined) return undefined;
        const [_key, _value] = projectedValue;
        if (_value === null) return [_key, undefined];
        const processedValue = await findVariables(_value);
        return [_key, processedValue];
      });

      const resolved = await Promise.all(promises).then(filterNill);
      if (Array.isArray(projection)) return resolved.map(([, value]) => value);
      return Object.fromEntries([...resolved, ...conditionalEnties]);
    };

    Object.defineProperty(parse, 'as', { value: parse });
    Object.defineProperty(parse, 'asArray', { value: parse });
    Object.defineProperty(parse, '_parser', { value: true });
    Object.defineProperty(parse, 'projection', { value: projection });

    return parse as unknown as ParserFunction<T>;
  };

  public static create = <const T extends ParserProjection>(projection: T, parserContext?: AppObject): ParserFunction<T> => {
    const parser = new Parser();
    return parser.project(projection, parserContext);
  };
}

export const initializeParser = (addGlobalContext: ParserGlobalContextFn = () => ({})) => {
  Parser.parserGlobalContext = addGlobalContext;
  const createParser = Parser.create;
  return { createParser };
};

export * from './parser-types';
