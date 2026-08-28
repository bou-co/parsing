import { z } from 'zod';
import { initializeParser } from '../../parser';
import { ParserReturnValue } from '../../parser-types';
import { coords, dataTypes, locale, record, schema } from '../data';
import { types as builtIn } from '../namespace';

type Expect<T extends true> = T;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

const { createParser, types } = initializeParser({ types: dataTypes });

describe('data types', () => {
  it('record casts every value and drops undefined ones', async () => {
    const scores = record.of(builtIn.number);
    expect(await scores.cast({ a: '1', b: 2 })).toEqual({ a: 1, b: 2 });
    expect(await record.cast({ a: 'x' })).toEqual({ a: 'x' });
    await expect(async () => record.cast([1])).rejects.toThrow('Invalid record');
    await expect(async () => scores.cast({ a: 'x' })).rejects.toThrow('at "a"');
    expect(scores).toBe(record.of(builtIn.number));
    expect(scores.name).toEqual('record<number>');
    const parser = createParser({ scores: types.record.of(builtIn.number), decoded: builtIn.json.of(types.record.of(builtIn.number)) });
    type Value = ParserReturnValue<typeof parser>;
    const check: Expect<Equal<Value['scores'], Record<string, number> | undefined>> = true;
    expect(check).toBe(true);
    expect(await parser({ scores: { x: '3' }, decoded: '{"y": "4"}' })).toEqual({ scores: { x: 3 }, decoded: { y: 4 } });
  });

  it('schema consumes a Standard Schema (Zod) and infers its output', async () => {
    const settings = schema(z.object({ theme: z.enum(['light', 'dark']), size: z.coerce.number().default(1) }));
    expect(await settings.cast({ theme: 'dark', size: '2' })).toEqual({ theme: 'dark', size: 2 });
    await expect(async () => settings.cast({ theme: 'blue' })).rejects.toThrow('theme:');
    expect(settings.name).toEqual('schema(zod)');
    const parser = createParser({ settings });
    type Value = ParserReturnValue<typeof parser>;
    const check: Expect<Equal<Value['settings'], { theme: 'light' | 'dark'; size: number } | undefined>> = true;
    expect(check).toBe(true);
    expect(await parser({ settings: { theme: 'light' } })).toEqual({ settings: { theme: 'light', size: 1 } });
    expect(() => schema({} as never)).toThrow('expected a Standard Schema');
    await expect(createParser({ v: '{{ x | schema }}' })({}, { variables: { x: 1 } })).rejects.toThrow('cannot be used as a pipe');
  });

  it('coords accepts objects, arrays and strings and validates ranges', async () => {
    expect(await coords.cast('60.16, 24.93')).toEqual({ lat: 60.16, lng: 24.93 });
    expect(await coords.cast([60.16, '24.93'])).toEqual({ lat: 60.16, lng: 24.93 });
    expect(await coords.cast({ latitude: 60, longitude: 24 })).toEqual({ lat: 60, lng: 24 });
    expect(await coords.lat.cast({ lat: 1, lng: 2 })).toEqual(1);
    expect(await coords.lng.cast('1 2')).toEqual(2);
    await expect(async () => coords.cast('91, 0')).rejects.toThrow('out of range');
    await expect(async () => coords.cast('here')).rejects.toThrow('Invalid coordinates');
  });

  it('locale canonicalises BCP 47 tags', async () => {
    expect(await locale.cast('en_us')).toEqual('en-US');
    expect(await locale.cast('FI')).toEqual('fi');
    expect(await locale.cast('zh-hant-tw')).toEqual('zh-Hant-TW');
    expect(await locale.language.cast('sv-FI')).toEqual('sv');
    expect(await locale.region.cast('sv-FI')).toEqual('FI');
    expect(await locale.region.cast('sv')).toBeUndefined();
    await expect(async () => locale.cast('not a locale!')).rejects.toThrow('Invalid locale');
    const parser = createParser({ a: builtIn.string });
    expect(await parser({ a: '{{ tag | locale.language }}' }, { variables: { tag: 'de_AT' } })).toEqual({ a: 'de' });
  });
});
