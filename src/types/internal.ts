// Shared helpers for the built-in families — kept here so behaviour cannot drift between types

/** Split into words on non-alphanumerics and camelCase boundaries: "helloWorld-FOO bar" → ["hello", "World", "FOO", "bar"] */
export const splitWords = (value: string): string[] =>
  value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);

export const capitalizeWord = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);

export const invalid = (type: string): Error => new Error(`Invalid ${type}`);
