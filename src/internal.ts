// Check if a projection is marked as an array via the @array directive
export const hasArrayDirective = (projection: unknown): boolean =>
  typeof projection === 'object' && projection !== null && !Array.isArray(projection) && '@array' in projection;

// Check if an input value is unable to feed an object projection
export const isDatalessInput = (input: unknown): boolean => {
  // Objects and arrays stay data-driven
  if (input !== null && typeof input === 'object') return false;
  // Non-empty strings keep their own handling (stringified objects, variables)
  if (typeof input === 'string' && input !== '') return false;
  return true;
};

// Check if a parser can resolve without data (array-shaped output always requires data)
export const canResolveDataless = (parser: object, projection: unknown): boolean =>
  !('_array' in parser) && !Array.isArray(projection) && !hasArrayDirective(projection);

export const getFromObject = async (from: object, path: string, context?: unknown) => {
  type VariablesObj = Record<any, any> | undefined;
  try {
    if (!from) return undefined;
    const keys = path.split('.');
    // Go through each key in the path
    return await keys.reduce(async (acc, key): Promise<VariablesObj> => {
      // Resolve asynchronous accumulator
      let current = await acc;
      // If the current value is not an object or is null, return undefined
      if (current === undefined || current === null) return undefined;
      // If the current value is a function and context is provided, call the value with the context
      if (typeof current === 'function' && context) current = await current(context);
      // If the current value is not an object, return undefined
      if (typeof current !== 'object' || current === null) return undefined;
      // If current object contains a 'get' method, call it with the key and context
      if ('get' in current && typeof current['get'] === 'function') return current['get'](key, context);
      // If the key exists in the current object, return its value
      if (key in current) return current[key];
      // If the key does not exist, return undefined
      return undefined;
    }, from as Promise<VariablesObj>);
  } catch (error) {
    const message = `Error while traversing path "${path}" in object: ${error instanceof Error ? error.message : String(error)}`;
    console.debug(message);
    throw new Error(message);
  }
};
