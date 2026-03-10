export const getFromObject = async (from: object, path: string, context?: unknown) => {
  type VariablesObj = Record<any, any> | undefined;
  if (!from) return undefined;
  const keys = path.split('.');
  // Go through each key in the path
  return keys.reduce(async (acc, key): Promise<VariablesObj> => {
    // Resolve asynchronous accumulator
    let current = await acc;
    // If the current value is not an object or is null, return undefined
    if (current === undefined) return undefined;
    // If the current value is a function and context is provided, call the value with the context
    if (typeof current === 'function' && context) current = await current(context);
    // If the current value is not an object, return undefined
    if (typeof current !== 'object') return undefined;
    // If current object contains a 'get' method, call it with the key and context
    if ('get' in current && typeof current['get'] === 'function') return current['get'](key, context);
    // If the key exists in the current object, return its value
    if (key in current) return current[key];
    // If the key does not exist, return undefined
    return undefined;
  }, from as Promise<VariablesObj>);
};
