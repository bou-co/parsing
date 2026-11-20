/** Split into words on non-alphanumerics and camelCase boundaries: "helloWorld-FOO bar" → ["hello", "World", "FOO", "bar"] */
export const splitWords = (value: string): string[] =>
  value
    .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, '$1 $2')
    .replace(/(\p{Lu}+)(\p{Lu}\p{Ll})/gu, '$1 $2')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

export const capitalizeWord = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);

export const invalid = (type: string, hint?: string): Error => new Error(hint ? `Invalid ${type} (${hint})` : `Invalid ${type}`);

export const pad = (value: number, size = 2): string => String(Math.abs(value)).padStart(size, '0');

/** Count characters as Unicode code points (a surrogate pair is one character) */
export const countCharacters = (value: string): number => Array.from(value).length;

// Mirrors UAX #29 word segmentation: hyphenated compounds count per part, apostrophes stay inside a word
const WORD = /\p{L}[\p{L}\p{N}'’]*|\p{N}+/gu;

/** Count words: `Intl.Segmenter` word segmentation when the runtime has it (handles scripts without spaces), else a Unicode-aware regex */
export const countWords = (value: string): number => {
  if (typeof Intl.Segmenter === 'function') {
    let count = 0;
    for (const segment of new Intl.Segmenter(undefined, { granularity: 'word' }).segment(value)) if (segment.isWordLike) count++;
    return count;
  }
  return value.match(WORD)?.length ?? 0;
};
