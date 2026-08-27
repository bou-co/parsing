import { get } from '../parser-util';
import { getFromObject } from '../internal';
import { ParserContext } from '../parser-types';
import { initializeParser } from '../parser';
import { ParserCastError } from '../type-token';

describe('get util', () => {
  it('should resolve a nested path', async () => {
    const result = await get('slug.current', { slug: { current: 'ok' } });
    expect(result).toEqual('ok');
  });

  it('should return undefined for a missing intermediate key', async () => {
    const result = await get('slug.current', { _id: 'x' });
    expect(result).toBeUndefined();
  });

  it('should return undefined when an intermediate value is null instead of throwing', async () => {
    await expect(get('slug.current', { slug: null })).resolves.toBeUndefined();
  });

  it('should return undefined when a value deeper in the path is null', async () => {
    const result = await get('a.b.c', { a: { b: null } });
    expect(result).toBeUndefined();
  });

  it('should return null when the final value is null', async () => {
    const result = await get('slug', { slug: null });
    expect(result).toBeNull();
  });

  it('should return undefined for null data in curried form', async () => {
    const getter = get('slug.current');
    const result = await getter({ data: { slug: null } } as unknown as ParserContext);
    expect(result).toBeUndefined();
  });

  describe('error handling', () => {
    it('should catch a throwing get() method and return undefined', async () => {
      const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
      const store = {
        get: () => {
          throw new Error('boom');
        },
      };
      await expect(getFromObject({ store }, 'store.key', {})).rejects.toThrow();
      expect(debug).toHaveBeenCalledTimes(1);
      debug.mockRestore();
    });

    it('should catch a throwing intermediate function and return undefined', async () => {
      const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
      const from = {
        fn: () => {
          throw new Error('boom');
        },
      };
      await expect(getFromObject(from, 'fn.key', {})).rejects.toThrow();
      expect(debug).toHaveBeenCalledTimes(1);
      debug.mockRestore();
    });

    it('should return undefined when an intermediate function resolves to null without hitting the catch', async () => {
      const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
      const from = { fn: () => null };
      await expect(getFromObject(from, 'fn.key', {})).resolves.toBeUndefined();
      expect(debug).not.toHaveBeenCalled();
      debug.mockRestore();
    });

    it('should traverse into the object returned by an intermediate function', async () => {
      const from = { fn: () => ({ key: 'v' }) };
      const result = await getFromObject(from, 'fn.key', {});
      expect(result).toEqual('v');
    });
  });

  describe('with a type', () => {
    const { createParser, types } = initializeParser({ variables: { company: { phone: '+358 9 1234567' } } });

    it('projects several outputs from one raw field, cast like a token at the key', async () => {
      const parser = createParser({
        phoneTitle: get('contact.phoneNumber', types.tel),
        phoneLink: get('contact.phoneNumber', types.tel.href),
        phoneRaw: get('contact.phoneNumber'),
        mail: get('contact.email', types.email.normalized.href),
      });
      const data = await parser({ contact: { phoneNumber: '+358 (0)40-123 4567', email: 'Bob@Example.com' } });
      expect(data).toEqual({
        phoneTitle: '+358 (0)40-123 4567',
        phoneLink: 'tel:+3580401234567',
        phoneRaw: '+358 (0)40-123 4567',
        mail: 'mailto:bob@example.com',
      });
      expect(await parser({ contact: {} })).toEqual({});
      expect(await parser({})).toEqual({});
    });

    it('applies defaults, required, and the failure policy with the projection key as the error path', async () => {
      const parser = createParser({ phone: get('phoneNumber', types.tel.href.default('tel:')), name: get('person.name', types.text.required) });
      expect(await parser({ person: { name: ' Bob ' } })).toEqual({ phone: 'tel:', name: 'Bob' });
      await expect(parser({ person: {} })).rejects.toThrow('Parser cast error at "name"');
      await expect(parser({ phoneNumber: 'call me', person: { name: 'x' } })).rejects.toThrow('Parser cast error at "phone": cannot cast value to "tel.href"');
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      expect(await parser({ phoneNumber: 'call me', person: { name: 'x' } }, { looseCasting: true })).toEqual({ phone: 'tel:', name: 'x' });
      expect(warn).toHaveBeenCalledTimes(1);
      warn.mockRestore();
      const strict = createParser({ phone: get('phoneNumber', types.tel.strict) });
      await expect(strict({ phoneNumber: 'call me' }, { looseCasting: true })).rejects.toThrow(ParserCastError);
    });

    it('resolves patterns in the looked-up value before casting', async () => {
      const parser = createParser({ link: get('phone', types.tel.href) });
      expect(await parser({ phone: '{{ company.phone }}' })).toEqual({ link: 'tel:+35891234567' });
    });

    it('reads from an explicit object, in a projection and awaited standalone', async () => {
      const rawData = { contact: { phoneNumber: '+1 (555) 010-0100 x7', bad: 'nope' } };
      const parser = createParser({
        link: get('contact.phoneNumber', rawData, types.tel.href),
        plain: get('contact.phoneNumber', rawData),
      });
      expect(await parser({})).toEqual({ link: 'tel:+15550100100;ext=7', plain: '+1 (555) 010-0100 x7' });
      expect(await get('contact.phoneNumber', rawData, types.tel.normalized)).toEqual('+15550100100');
      expect(await get('contact.missing', rawData, types.tel.default('none'))).toEqual('none');
      await expect(async () => get('contact.bad', rawData, types.tel)).rejects.toThrow('Invalid phone number');
      const loose = createParser({ link: get('contact.bad', rawData, types.tel.href) }, { looseCasting: true, onCastError: () => undefined });
      expect(await loose({})).toEqual({});
    });

    it('casts inside context.resolve too (where data is the resolve input, so the object form reads the parser data)', async () => {
      const parser = createParser({
        out: (context) => context.resolve({ phone: get('phoneNumber', context.data, types.tel.normalized), raw: get('phoneNumber', context.data) }),
      });
      expect(await parser({ phoneNumber: '040 123' })).toEqual({ out: { phone: '040123', raw: '040 123' } });
      await expect(createParser({ out: (context) => context.resolve(get('phoneNumber', context.data, types.tel)) })({ phoneNumber: 'x' })).rejects.toThrow(
        ParserCastError,
      );
    });

    it('hashes by path and token so projections that differ only in a get stay distinct', () => {
      expect(String(get('a'))).not.toEqual(String(get('b')));
      expect(String(get('a', types.tel))).not.toEqual(String(get('a', types.tel.href)));
      expect(String(get('a', types.tel))).not.toEqual(String(get('a')));
      expect(String(get('a', { a: 1 }, types.tel))).not.toEqual(String(get('a', { a: 2 }, types.tel)));
      expect(String(createParser({ v: get('a') }))).not.toEqual(String(createParser({ v: get('b') })));
    });
  });
});
