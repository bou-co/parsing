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

/** Count characters as Unicode code points (a surrogate pair is one character) */
export const countCharacters = (value: string): number => Array.from(value).length;

// Mirrors UAX #29 word segmentation: hyphenated compounds count per part, apostrophes stay inside a word
const WORD = /\p{L}[\p{L}\p{N}'’]*|\p{N}+/gu;

/** Count words: `Intl.Segmenter` word segmentation when the runtime has it (handles scripts without spaces), else a Unicode-aware regex */
export const countWords = (value: string): number => {
  const Segmenter = (
    Intl as { Segmenter?: new (locale?: string, options?: { granularity: string }) => { segment(input: string): Iterable<{ isWordLike?: boolean }> } }
  ).Segmenter;
  if (Segmenter) {
    let count = 0;
    for (const segment of new Segmenter(undefined, { granularity: 'word' }).segment(value)) if (segment.isWordLike) count++;
    return count;
  }
  return value.match(WORD)?.length ?? 0;
};
