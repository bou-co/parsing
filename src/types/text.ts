import type { ParserContext } from '../parser-types';
import { Carry, TypeToken, defineType } from '../type-token';
import type { ArrayType } from './array';
import { array } from './array';
import { countCharacters, countWords } from './internal';
import { StringType } from './string';

/** `string` tidied for textarea content: trimmed, spaces collapsed, line breaks kept. Nothing left means missing */
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
  get characterCount(): Carry<this, TypeToken<number>> {
    return this.derive('characterCount', (value) => countCharacters(value));
  }

  /** Number of words (`Intl.Segmenter` when available, so scripts without spaces count too) */
  get wordCount(): Carry<this, TypeToken<number>> {
    return this.derive('wordCount', (value) => countWords(value));
  }

  get lineCount(): Carry<this, TypeToken<number>> {
    return this.derive('lineCount', (value) => value.split('\n').length);
  }

  get lines(): Carry<this, ArrayType<string>> {
    return this.derive('lines', (value) => value.split('\n'), [], array) as never;
  }

  /** Blank-line separated blocks; single line breaks inside a paragraph become spaces */
  get paragraphs(): Carry<this, ArrayType<string>> {
    return this.derive('paragraphs', (value) => value.split(/\n{2,}/).map((paragraph) => paragraph.replace(/\n/g, ' ')), [], array) as never;
  }

  /** Estimated reading time in whole minutes (at least 1) */
  readingTime(wordsPerMinute = 200): Carry<this, TypeToken<number>> {
    return this.derive('readingTime', (value) => Math.max(1, Math.ceil(countWords(value) / wordsPerMinute)), [wordsPerMinute]);
  }
}

export const text = /* @__PURE__ */ defineType(TextType);
