import { initializeParser } from '../parser';
import {
  ArrayType,
  EmailType,
  SlugType,
  StringType,
  TelType,
  TypeToken,
  text,
  email,
  url,
  slug,
  color,
  tel,
  mimeType,
  json,
  unique,
  oneOf,
  pattern,
} from './index';

type Expect<T extends true> = T;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

const { createParser, types } = initializeParser();
const cast = <T>(token: TypeToken<T>, value: unknown) => token.cast(value);
const rejects = (token: TypeToken, value: unknown) => expect(async () => token.cast(value)).rejects;

describe('tier-1 catalogue', () => {
  it('is registered on the namespace and the types entry point', () => {
    expect(types.text).toBe(text);
    expect(types.email).toBe(email);
    expect(types.url).toBe(url);
    expect(types.slug).toBe(slug);
    expect(types.color).toBe(color);
    expect(types.tel).toBe(tel);
    expect(types.mimeType).toBe(mimeType);
    expect(types.json).toBe(json);
    expect(types.unique).toBe(unique);
    expect(types.oneOf).toBe(oneOf);
    expect(types.pattern).toBe(pattern);
  });

  describe('text', () => {
    it('keeps line breaks, tidies whitespace, and treats empty as missing', async () => {
      expect(await cast(text, '  Hello \t  world  ')).toEqual('Hello world');
      expect(await cast(text, 'one\r\ntwo\rthree')).toEqual('one\ntwo\nthree');
      expect(await cast(text, '  first line  \n\n\n\n  second\u00a0paragraph \n')).toEqual('first line\n\nsecond paragraph');
      expect(await cast(text, 12)).toEqual('12');
      expect(await cast(text, '   ')).toBeUndefined();
      expect(await cast(text, ' \n \n ')).toBeUndefined();
      const parser = createParser({ a: types.text, b: types.text.default('Untitled'), c: types.text.upperCase, d: types.string });
      expect(await parser({ a: ' ', b: '', c: ' hi  there ', d: '' })).toEqual({ b: 'Untitled', c: 'HI THERE' });
      expect(text).toBeInstanceOf(StringType);
      await rejects(text, { nope: 1 }).toThrow('Invalid string');
    });

    it('folds to one line and describes the content', async () => {
      const body = 'Hyvää yötä, world!\nSecond line here.\n\nNew paragraph 😀';
      expect(await cast(text.singleLine, ' a \n\n b\tc ')).toEqual('a b c');
      expect(await cast(text.characterCount, 'héllo 😀')).toEqual(7);
      expect(await cast(text.wordCount, body)).toEqual(8);
      expect(await cast(text.wordCount, "it's a dog-eat-dog world")).toEqual(6); // UAX #29: hyphen parts are words
      expect(await cast(text.lineCount, body)).toEqual(4);
      expect(await cast(text.lines, body)).toEqual(['Hyvää yötä, world!', 'Second line here.', '', 'New paragraph 😀']);
      expect(await cast(text.paragraphs, body)).toEqual(['Hyvää yötä, world! Second line here.', 'New paragraph 😀']);
      expect(await cast(text.readingTime(), body)).toEqual(1);
      expect(await cast(text.readingTime(4), body)).toEqual(2);
      expect(await cast(text.lines.length, body)).toEqual(4);
      expect(text.singleLine).toBeInstanceOf(StringType);
      expect(text.lines).toBeInstanceOf(ArrayType);
      const parser = createParser({ words: types.text.wordCount, chars: types.text.characterCount, empty: types.text.wordCount });
      expect(await parser({ words: 'a b', chars: 'abc', empty: '  ' })).toEqual({ words: 2, chars: 3 });
      expect(await createParser({ w: '{{ body | wordCount }}' })({}, { variables: { body } })).toEqual({ w: 8 });
    });
  });

  describe('email', () => {
    it('validates the shape, trims, and keeps the case as written', async () => {
      expect(await cast(email, ' Bob.Smith@Example.COM ')).toEqual('Bob.Smith@Example.COM');
      await rejects(email, 'bob@example').toThrow('Invalid email');
      await rejects(email, 'bob smith@example.com').toThrow('Invalid email');
      expect(await cast(email.local, 'Bob@Example.com')).toEqual('Bob');
      expect(await cast(email.domain, 'Bob@Example.com')).toEqual('Example.com');
      expect(await cast(email.lowerCase, 'Bob@Example.com')).toEqual('bob@example.com');
      await rejects(email.domain, 'nope').toThrow('Invalid email');
    });

    it('exposes the normalised address and the mailto link', async () => {
      expect(await cast(email.normalized, ' Bob@Example.COM ')).toEqual('bob@example.com');
      expect(await cast(email.normalized.domain, 'Bob@Example.COM')).toEqual('example.com');
      expect(await cast(email.href, 'Bob@Example.com')).toEqual('mailto:Bob@Example.com');
      expect(await cast(email.normalized.href, 'Bob@Example.com')).toEqual('mailto:bob@example.com');
      expect(email.normalized).toBeInstanceOf(EmailType);
      expect(email.href).toBeInstanceOf(StringType);
      await rejects(email.href, 'nope').toThrow('Invalid email');
      expect(await createParser({ h: '{{ contact | email.href }}' })({}, { variables: { contact: 'a@b.co' } })).toEqual({ h: 'mailto:a@b.co' });
    });
  });

  describe('url', () => {
    it('follows new URL(): absolute only, normalised, with the platform part names', async () => {
      expect(await cast(url, 'HTTPS://Example.com/a/../b?x=1&x=2#top')).toEqual('https://example.com/b?x=1&x=2#top');
      await rejects(url, '/about').toThrow('absolute URLs only');
      await rejects(url, '//cdn.example.com/x').toThrow('Invalid URL');
      const parts = createParser({
        protocol: types.url.protocol,
        origin: types.url.origin,
        host: types.url.host,
        hostname: types.url.hostname,
        port: types.url.port,
        pathname: types.url.pathname,
        search: types.url.search,
        params: types.url.params,
        hash: types.url.hash,
      });
      const input = Object.fromEntries(Object.keys(parts.projection).map((key) => [key, 'https://example.com:8080/docs/intro?x=1&x=2&y=z#top']));
      expect(await parts(input)).toEqual({
        protocol: 'https:',
        origin: 'https://example.com:8080',
        host: 'example.com:8080',
        hostname: 'example.com',
        port: '8080',
        pathname: '/docs/intro',
        search: '?x=1&x=2&y=z',
        params: { x: '2', y: 'z' },
        hash: '#top',
      });
    });

    it('resolves relative links against a base', async () => {
      const site = url.base('https://site.com/docs/');
      expect(await cast(site, 'intro')).toEqual('https://site.com/docs/intro');
      expect(await cast(site, '/about')).toEqual('https://site.com/about');
      expect(await cast(site, 'https://other.com/x')).toEqual('https://other.com/x');
      expect(await cast(site.pathname, '/about')).toEqual('/about');
      expect(url.base('https://site.com')).toBe(url.base('https://site.com'));
      expect(String(url.base('https://a.com'))).not.toEqual(String(url.base('https://b.com')));
      expect(site.name).toEqual('url.base(https://site.com/docs/)');
    });
  });

  describe('slug', () => {
    it('folds Latin text to an ASCII slug', async () => {
      expect(await cast(slug, '  Hyvää Yötä & Good Night! ')).toEqual('hyvaa-yota-good-night');
      expect(await cast(slug, 'already-a-slug')).toEqual('already-a-slug');
      expect(await cast(slug, 'Straße in Łódź')).toEqual('strasse-in-lodz');
      expect(await cast(slug, 'Søren & Æbleskiver, œuvre, Þór, Đông, ħello')).toEqual('soren-aebleskiver-oeuvre-thor-dong-hello');
      expect(await cast(slug, 'crème brûlée — Tiếng Việt')).toEqual('creme-brulee-tieng-viet');
      expect(await cast(slug, 'Ｆｕｌｌｗｉｄｔｈ ½')).toEqual('fullwidth-1-2');
      expect(await cast(slug, '--Hello__World--')).toEqual('hello-world');
      expect(await cast(slug.upperCase, 'Hello World')).toEqual('HELLO-WORLD');
    });

    it('drops non-Latin scripts and fails when nothing is left', async () => {
      expect(await cast(slug, 'Привет 2024')).toEqual('2024');
      await rejects(slug, '!!!').toThrow('Invalid slug');
      await rejects(slug, 'Привет мир').toThrow('non-Latin scripts need a transliteration step');
    });

    it('is customised by composing a pre-step in front of it', async () => {
      const german = types.string.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').to(types.slug);
      expect(await cast(german, 'Schöne Grüße')).toEqual('schoene-gruesse');
      expect(german).toBeInstanceOf(SlugType);
      const map: Record<string, string> = { п: 'p', р: 'r', и: 'i', в: 'v', е: 'e', т: 't' };
      const cyrillic = types.string.extend((value) => value.replace(/[а-я]/gi, (letter) => map[letter.toLowerCase()] ?? letter)).to(types.slug);
      expect(await cast(cyrillic, 'Привет')).toEqual('privet');
      const suffixed = types.slug.extend((value) => `${value}-2024`);
      expect(await cast(suffixed, 'Hello')).toEqual('hello-2024');
    });
  });

  describe('color', () => {
    it('accepts hex, rgb and hsl, normalising to hex', async () => {
      expect(await cast(color, '#ABC')).toEqual('#aabbcc');
      expect(await cast(color, '#abcd')).toEqual('#aabbccdd');
      expect(await cast(color, 'ff8800')).toEqual('#ff8800');
      expect(await cast(color, 'rgb(255, 136, 0)')).toEqual('#ff8800');
      expect(await cast(color, 'rgba(255 136 0 / 50%)')).toEqual('#ff880080');
      expect(await cast(color, 'hsl(120, 100%, 50%)')).toEqual('#00ff00');
      expect(await cast(color, 'hsla(0, 0%, 0%, 0.5)')).toEqual('#00000080');
      await rejects(color, 'red').toThrow('Invalid color');
      await rejects(color, '#12345').toThrow('Invalid color');
    });

    it('notations are strings and chain', async () => {
      expect(color.hex).toBeInstanceOf(StringType);
      expect(color.rgb).toBeInstanceOf(StringType);
      expect(color.hsl).toBeInstanceOf(StringType);
      expect(await cast(color.hex.upperCase, '#abc')).toEqual('#AABBCC');
      expect(await cast(color.rgb.replace(/\s/g, ''), '#ff8800')).toEqual('rgb(255,136,0)');
    });

    it('exposes notations and components', async () => {
      const parser = createParser({
        hex: types.color.hex,
        rgb: types.color.rgb,
        rgba: types.color.rgb,
        hsl: types.color.hsl,
        channels: types.color.channels,
        alpha: types.color.alpha,
        opaque: types.color.alpha,
      });
      expect(
        await parser({ hex: 'rgb(0,0,255)', rgb: '#ff8800', rgba: '#ff880080', hsl: '#00ff00', channels: '#ff8800', alpha: '#ff880080', opaque: '#fff' }),
      ).toEqual({
        hex: '#0000ff',
        rgb: 'rgb(255, 136, 0)',
        rgba: 'rgba(255, 136, 0, 0.5)',
        hsl: 'hsl(120, 100%, 50%)',
        channels: { r: 255, g: 136, b: 0 },
        alpha: 0.502,
        opaque: 1,
      });
    });
  });

  describe('tel', () => {
    it('accepts the common notations and keeps the number as written', async () => {
      expect(await cast(tel, ' +358 (0)40-123 4567 ')).toEqual('+358 (0)40-123 4567');
      expect(await cast(tel, '040 123 4567')).toEqual('040 123 4567');
      expect(await cast(tel, '+1.555.0100')).toEqual('+1.555.0100');
      expect(await cast(tel, '+49 (0) 30 / 12 34 56')).toEqual('+49 (0) 30 / 12 34 56');
      expect(await cast(tel, '112')).toEqual('112');
      expect(await cast(tel, '+1 (555) 010-0100 ext. 12')).toEqual('+1 (555) 010-0100 ext. 12');
      expect(await cast(tel, '555-0100 x42')).toEqual('555-0100 x42');
      expect(await cast(tel, '555-0100 #42')).toEqual('555-0100 #42');
      await rejects(tel, '12').toThrow('3–15 digits');
      await rejects(tel, '1234567890123456').toThrow('3–15 digits');
      await rejects(tel, '+1 555 CALL NOW').toThrow('Invalid phone number');
      await rejects(tel, '+').toThrow('Invalid phone number');
    });

    it('exposes the normalised number, the tel: link and the extension', async () => {
      expect(await cast(tel.normalized, '+358 (0)40-123 4567 ext. 12')).toEqual('+358401234567');
      expect(await cast(tel.normalized, '(040) 123 4567')).toEqual('0401234567');
      expect(await cast(tel.normalized, '+358 40 (0)1234')).toEqual('+358401234');
      expect(await cast(tel.normalized, '040 123 4567')).toEqual('0401234567');
      expect(await cast(tel.href, '+1 555 0100')).toEqual('tel:+15550100');
      expect(await cast(tel.href, '+1 (555) 010-0100 ext. 12')).toEqual('tel:+15550100100;ext=12');
      expect(await cast(tel.extension, '555-0100 x42')).toEqual('42');
      expect(tel.normalized).toBeInstanceOf(TelType);
      expect(tel.href).toBeInstanceOf(StringType);
      const parser = createParser({ phoneTitle: types.tel, phoneLink: types.tel.href, ext: types.tel.extension, none: types.tel.extension });
      expect(await parser({ phoneTitle: '+358 40 1234567', phoneLink: '+358 40 1234567', ext: '1234 ext 9', none: '1234' })).toEqual({
        phoneTitle: '+358 40 1234567',
        phoneLink: 'tel:+358401234567',
        ext: '9',
      });
      await rejects(tel.href, 'nope').toThrow('Invalid phone number');
    });
  });

  describe('mimeType', () => {
    it('parses and normalises type/subtype+suffix; params', async () => {
      expect(mimeType.suffix).toBeInstanceOf(StringType);
      expect(await cast(mimeType.suffix.upperCase, 'application/ld+json')).toEqual('JSON');
      expect(await cast(mimeType.suffix, 'image/png')).toBeUndefined();
      expect(await cast(mimeType, 'Application/LD+JSON ; charset=UTF-8')).toEqual('application/ld+json; charset=UTF-8');
      expect(await cast(mimeType, 'image/png')).toEqual('image/png');
      await rejects(mimeType, 'image').toThrow('Invalid MIME type');
      await rejects(mimeType, 'image/').toThrow('Invalid MIME type');
      const parser = createParser({
        type: types.mimeType.type,
        subtype: types.mimeType.subtype,
        suffix: types.mimeType.suffix,
        essence: types.mimeType.essence,
        none: types.mimeType.suffix,
      });
      expect(
        await parser({
          type: 'application/ld+json; charset=utf-8',
          subtype: 'application/ld+json',
          suffix: 'application/ld+json',
          essence: 'application/ld+json; charset=utf-8',
          none: 'image/png',
        }),
      ).toEqual({
        type: 'application',
        subtype: 'ld',
        suffix: 'json',
        essence: 'application/ld+json',
      });
    });
  });

  describe('json', () => {
    it('decodes strings, passes objects through, and composes an inner type', async () => {
      expect(await cast(json, '{"a":1}')).toEqual({ a: 1 });
      expect(await cast(json, { a: 1 })).toEqual({ a: 1 });
      await rejects(json, '{nope').toThrow('Invalid JSON');
      const numbers = json.of(types.array.of(types.number));
      expect(numbers).toBeInstanceOf(ArrayType);
      expect(await cast(numbers.unique, '[1, "1", 2]')).toEqual([1, 2]);
      expect(await cast(numbers, [3, '4'])).toEqual([3, 4]);
      await rejects(numbers, '"x"').toThrow('Invalid array');
      const checks: [Expect<Equal<typeof numbers, ArrayType<number>>>, Expect<Equal<typeof json.of<StringType>, (inner: StringType) => StringType>>] = [
        true,
        true,
      ];
      expect(checks.every(Boolean)).toBe(true);
    });
  });

  describe('unique', () => {
    it('deduplicates like a Set and returns an array of the item type', async () => {
      const tags = unique(types.string);
      expect(await cast(tags, ['b', 1, 'a', '1', 'b'])).toEqual(['b', '1', 'a']);
      expect(tags).toBeInstanceOf(ArrayType);
      expect(tags).toBe(types.array.of(types.string).unique);
      const check: Expect<Equal<typeof tags, ArrayType<string>>> = true;
      expect(check).toBe(true);
    });
  });

  describe('oneOf', () => {
    it('checks membership, coerces strings to numeric/boolean members, and infers the union', async () => {
      const status = oneOf('draft', 'published');
      expect(await cast(status, 'draft')).toEqual('draft');
      await rejects(status, 'live').toThrow('Expected one of "draft", "published"');
      const level = oneOf(1, 2, true);
      expect(await cast(level, '2')).toEqual(2);
      expect(await cast(level, 'true')).toEqual(true);
      await rejects(level, 3).toThrow('Expected one of');
      expect(status.name).toEqual('oneOf("draft"|"published")');
      expect(String(status)).not.toEqual(String(oneOf('draft')));
      const parser = createParser({ status: status.default('draft') });
      const check: Expect<Equal<Awaited<ReturnType<typeof parser>>['status'], 'draft' | 'published'>> = true;
      expect(check).toBe(true);
      expect(await parser({})).toEqual({ status: 'draft' });
    });
  });

  describe('pattern', () => {
    it('validates against a regex, returning the value or the named groups', async () => {
      const code = pattern(/^[A-Z]{3}-\d+$/);
      expect(await cast(code, 'ABC-12')).toEqual('ABC-12');
      await rejects(code, 'abc-12').toThrow('Does not match /^[A-Z]{3}-\\d+$/');
      const insensitive = pattern('^[a-z]{3}-\\d+$', 'i');
      expect(await cast(insensitive, 'ABC-12')).toEqual('ABC-12');
      const parts = pattern<{ year: string; month: string }>(/^(?<year>\d{4})-(?<month>\d{2})/);
      expect(await cast(parts, '2024-05-15')).toEqual({ year: '2024', month: '05' });
      expect(code.name).toEqual('pattern(/^[A-Z]{3}-\\d+$/)');
      expect(String(code)).not.toEqual(String(insensitive));
      expect(await cast(code.lowerCase, 'ABC-12')).toEqual('abc-12');
    });

    it('names the regex in cast errors', async () => {
      const parser = createParser({ code: types.pattern(/^\d+$/) });
      await expect(parser({ code: 'x' })).rejects.toThrow('cannot cast value to "pattern(/^\\d+$/)" — Does not match /^\\d+$/');
    });
  });
});
