import { initializeParser } from '../parser';

const { types } = initializeParser();

describe('object type', () => {
  it('passes any non-array object through, class instances included', async () => {
    class Box {}
    const date = new Date(0);
    const map = new Map();
    const box = new Box();
    expect(await types.object.cast(date)).toBe(date);
    expect(await types.object.cast(map)).toBe(map);
    expect(await types.object.cast(box)).toBe(box);
    for (const bad of [[], 'x', 1, true]) await expect(async () => types.object.cast(bad)).rejects.toThrow('Invalid object');
  });
});
