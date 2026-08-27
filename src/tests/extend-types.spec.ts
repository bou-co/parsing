import { initializeParser } from '../parser';
import { defineType, StringType, TypeToken, ParserCastError, isTypeToken } from '../types';
import type { ParserContext } from '../parser-types';
import { toHash } from '../to-hash';

const { createParser, types } = initializeParser();

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

describe('extending types', () => {
  describe('defineType with extends', () => {
    const email = defineType({
      name: 'email',
      extends: types.string,
      fn: (value) => {
        if (!EMAIL.test(value)) throw new Error('Invalid email');
        return value.toLowerCase();
      },
      accessors: { local: (value) => value.split('@')[0], domain: (value) => value.split('@')[1] },
      methods: { mask: (keep: number) => (value) => `${value.slice(0, keep)}…` },
    });

    it('runs the parent cast first, then the refinement', async () => {
      const parser = createParser({ email });
      expect((await parser({ email: 'Bob@Example.COM' })).email).toEqual('bob@example.com');
      await expect(parser({ email: 'nope' })).rejects.toThrow('cannot cast value to "email" — Invalid email');
      await expect(parser({ email: { not: 'a string' } })).rejects.toThrow('Invalid string');
    });

    it('inherits the whole string accessor surface', async () => {
      const parser = createParser({ shout: email.upperCase, kebab: email.kebab, len: email.length });
      const data = await parser({ shout: 'a@b.co', kebab: 'a@b.co', len: 'a@b.co' });
      expect(data.shout).toEqual('A@B.CO');
      expect(data.kebab).toEqual('a-b-co');
      expect(data.len).toEqual(6);
      expect(email).toBeInstanceOf(StringType);
      expect(email.upperCase).toBeInstanceOf(StringType);
    });

    it('exposes its own accessors and methods', async () => {
      const parser = createParser({ local: email.local, domain: email.domain, masked: email.mask(2) });
      const data = await parser({ local: 'Bob@Example.com', domain: 'Bob@Example.com', masked: 'bob@example.com' });
      expect(data).toEqual({ local: 'bob', domain: 'example.com', masked: 'bo…' });
      expect(email.mask(2)).toBe(email.mask(2));
      expect(email.mask(2)).not.toBe(email.mask(3));
    });

    it('accessors fail at the base cast — never a partial result', async () => {
      const parser = createParser({ domain: email.domain });
      await expect(parser({ domain: 'not-an-email' })).rejects.toThrow('cannot cast value to "email.domain" — Invalid email');
      const loose = createParser({ domain: email.domain }, { looseCasting: true, onCastError: () => undefined });
      expect((await loose({ domain: 'not-an-email' })).domain).toBeUndefined();
    });

    it('keeps own accessors through default/strict/loose and further extension', async () => {
      const defaulted = email.default('n/a');
      expect(isTypeToken(defaulted.domain)).toBe(true);
      const parser = createParser({ a: defaulted, b: email.strict.domain, c: email.extend((value) => `${value}!`).domain });
      const data = await parser({ b: 'x@y.z', c: 'x@y.z' });
      expect(data).toEqual({ a: 'n/a', b: 'y.z', c: 'y.z!' });
    });

    it('supports extends without fn (accessors only) and names default to the parent', () => {
      const withDomain = defineType({ extends: types.string, accessors: { first: (value) => value[0] } });
      expect(withDomain.name).toEqual('string');
      expect(withDomain.first.name).toEqual('string.first');
      expect(email.name).toEqual('email');
    });

    it('rejects a non-token extends', () => {
      expect(() => defineType({ extends: 'string' as never, fn: (value: never) => value })).toThrow('`extends` must be a type token');
    });
  });

  describe('defineType without extends', () => {
    it('adds accessors to a base token', async () => {
      const dmy = defineType({
        fn: (value) => {
          const date = new Date(value as string);
          if (isNaN(date.getTime())) throw new Error('Invalid date');
          return { day: date.getUTCDate(), month: date.getUTCMonth() + 1, year: date.getUTCFullYear() };
        },
        accessors: { day: (value) => value.day },
        methods: { padded: (width: number) => (value) => String(value.day).padStart(width, '0') },
      });
      const parser = createParser({ full: dmy, day: dmy.day, padded: dmy.padded(3) });
      const data = await parser({ full: '2024-05-15', day: '2024-05-15', padded: '2024-05-15' });
      expect(data).toEqual({ full: { day: 15, month: 5, year: 2024 }, day: 15, padded: '015' });
    });
  });

  describe('class extension', () => {
    class SkuType extends StringType {
      static override readonly family = 'sku';
      override async cast(value: unknown, context?: ParserContext) {
        const text = await super.cast(value, context);
        if (text === undefined) return undefined;
        if (!/^[A-Z]+-\d+$/i.test(text)) throw new Error('Invalid SKU');
        return text.toUpperCase();
      }
      get vendor() {
        return this.derive('vendor', (value) => value.split('-')[0]);
      }
      get number() {
        return this.derive('number', (value) => Number(value.split('-')[1]));
      }
    }
    const sku = defineType(SkuType);

    it('works like any other token, with inherited and own accessors', async () => {
      const parser = createParser({ sku, vendor: sku.vendor, number: sku.number, lower: sku.lowerCase, filled: sku.default('ACME-0') });
      const data = await parser({ sku: 'acme-12', vendor: 'acme-12', number: 'acme-12', lower: 'acme-12' });
      expect(data).toEqual({ sku: 'ACME-12', vendor: 'ACME', number: 12, lower: 'acme-12', filled: 'ACME-0' });
      await expect(parser({ sku: 'nope' })).rejects.toThrow(ParserCastError);
      expect(sku.name).toEqual('sku');
      expect(sku.default('x')).toBeInstanceOf(SkuType);
      expect(sku.upperCase).toBeInstanceOf(SkuType);
      expect(sku).toBeInstanceOf(SkuType);
      expect(typeof sku).toEqual('function');
    });

    it('defineType(Class, options) is the factory form of new, with options applied', async () => {
      const filled = defineType(SkuType, { default: 'ACME-1', strict: true });
      expect(filled).toBeInstanceOf(SkuType);
      expect(filled.defaultValue).toEqual('ACME-1');
      expect(filled.policy).toEqual('strict');
      expect(await filled.cast('acme-2')).toEqual('ACME-2');
      expect(String(defineType(SkuType))).toEqual(String(new SkuType()));
    });

    it('subclasses without a family marker are named after the class and hash by their cast', () => {
      class Loud extends StringType {
        override async cast(value: unknown, context?: ParserContext) {
          return (await super.cast(value, context))?.toUpperCase();
        }
      }
      class Quiet extends StringType {
        override async cast(value: unknown, context?: ParserContext) {
          return (await super.cast(value, context))?.toLowerCase();
        }
      }
      expect(defineType(Loud).name).toEqual('Loud');
      expect(toHash(new Loud())).toEqual(toHash(new Loud()));
      expect(toHash(new Loud())).not.toEqual(toHash(new Quiet()));
      expect(toHash(new Loud())).not.toEqual(toHash(types.string));
    });
  });

  describe('universal chain', () => {
    it('extend keeps the family, to derives a base token, to(token) composes and keeps the target family', async () => {
      const trimmed = types.string.extend((value) => value.trim());
      const length = types.string.to((value) => value.length);
      const json = defineType((value) => (typeof value === 'string' ? JSON.parse(value) : value));
      const numbers = json.to(types.array.of(types.number));
      expect(trimmed).toBeInstanceOf(StringType);
      expect(length).toBeInstanceOf(TypeToken);
      expect(length).not.toBeInstanceOf(StringType);
      expect(numbers.constructor.name).not.toEqual('StringType');
      const parser = createParser({ trimmed: trimmed.upperCase, length, numbers: numbers.unique, first: numbers.first });
      const data = await parser({ trimmed: '  hi ', length: 'four', numbers: '[1, "1", 2]', first: '[3, 4]' });
      expect(data).toEqual({ trimmed: 'HI', length: 4, numbers: [1, 2], first: 3 });
    });

    it('tokens are not spreadable into plain objects and are hidden from enumeration', () => {
      expect(Object.keys(types.string)).toEqual([]);
      expect(JSON.stringify({ t: types.string })).toEqual('{"t":"__parserType:string__"}');
      expect(String(types.string.upperCase)).toMatch(/^__parserType:string\.upperCase#/);
    });
  });
});
