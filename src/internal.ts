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

const toAlphabeticChar = (code: number) => String.fromCharCode(code + (code > 25 ? 39 : 97));

export const toAlphabeticName = (code: number) => {
  let name = '';
  let x;

  for (x = Math.abs(code); x > 52; x = (x / 52) | 0) name = toAlphabeticChar(x % 52) + name;

  return toAlphabeticChar(x % 52) + name;
};

export const toPhash = (h: number, x: string): number => {
  let i = x.length;
  while (i) h = (h * 33) ^ x.charCodeAt(--i);
  return h;
};

const toFnv1a = (x: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < x.length; i++) h = Math.imul(h ^ x.charCodeAt(i), 0x01000193);
  return h >>> 0;
};

export const hashReplacer = (_key: string, value: unknown) => {
  if (value instanceof Function) return value.toString();
  if (value instanceof RegExp) return value.toString();
  return value;
};

// Content-addressed store keys: toHash is 32-bit and collapses falsy values, which is fine for cache
// keys that also carry a projection but too collision-prone when the hash is the whole identity
export const toContentHash = (value: unknown): string => {
  const asString = JSON.stringify(value, hashReplacer) ?? String(value);
  return toAlphabeticName(toPhash(5381, asString) >>> 0) + toAlphabeticName(toFnv1a(asString));
};
