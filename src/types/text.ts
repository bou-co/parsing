import type { ParserContext } from '../parser-types';
import { StringType } from './string';
import type { ArrayType } from './array';
import { array } from './array';
import { TypeToken, defineType } from '../type-token';
import { countCharacters, countWords } from './internal';

/**
 * `text` — `string` plus CMS tidying for textarea-style content. Where `string` is the raw input
 * value (only `''` is missing), `text` is trimmed and normalised while **line breaks are kept**:
 * line endings become `\n`, runs of spaces/tabs collapse to one space, each line is trimmed,
 * three or more newlines collapse to one blank line (a paragraph break), and a result with
 * nothing left is missing (so `.default()` fires and the key is otherwise omitted). `.singleLine`
 * folds everything onto one line; the count and split accessors describe the tidied content.
 * Inherits every `string` accessor.
 */
export class TextType extends StringType {
  static override readonly family: string = 'text';

  override async cast(value: unknown, context?: ParserContext): Promise<string | undefined> {
    const text = await super.cast(value, context);
    if (text === undefined) return undefined;
    const tidy = text
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map((line) => line.replace(/[^\S\n]+/g, ' ').trim())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return tidy === '' ? undefined : tidy;
  }

  /** Every whitespace run, newlines included, folded to one space */
  get singleLine(): this {
    return this.transform('singleLine', (value) => value.replace(/\s+/g, ' '));
  }

  /** Number of characters as Unicode code points */
  get characterCount(): TypeToken<number> {
    return this.derive('characterCount', (value) => countCharacters(value));
  }

  /** Number of words (`Intl.Segmenter` when available, so scripts without spaces count too) */
  get wordCount(): TypeToken<number> {
    return this.derive('wordCount', (value) => countWords(value));
  }

  get lineCount(): TypeToken<number> {
    return this.derive('lineCount', (value) => value.split('\n').length);
  }

  get lines(): ArrayType<string> {
    // Bare `array`: an item-cast would report empty lines as missing
    return this.derive('lines', (value) => value.split('\n')).to(array) as ArrayType<string>;
  }

  /** Blank-line separated blocks; single line breaks inside a paragraph become spaces */
  get paragraphs(): ArrayType<string> {
    return this.derive('paragraphs', (value) => value.split(/\n{2,}/).map((paragraph) => paragraph.replace(/\n/g, ' '))).to(array) as ArrayType<string>;
  }

  /** Estimated reading time in whole minutes (at least 1) */
  readingTime(wordsPerMinute = 200): TypeToken<number> {
    return this.derive('readingTime', (value) => Math.max(1, Math.ceil(countWords(value) / wordsPerMinute)), [wordsPerMinute]);
  }
}

export const text = /* @__PURE__ */ defineType(TextType);
