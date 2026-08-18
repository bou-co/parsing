import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addSkills, discoverSkills } from '../cli/add-skills';

const skillsDir = fileURLToPath(new URL('../skills', import.meta.url));

describe('add-skills CLI', () => {
  let targetDir: string;

  beforeEach(() => {
    targetDir = mkdtempSync(join(tmpdir(), 'bou-skills-'));
  });

  afterEach(() => {
    rmSync(targetDir, { recursive: true, force: true });
  });

  it('discovers the bundled skills', () => {
    expect(discoverSkills(skillsDir)).toEqual(['bou-parsing', 'bou-parsing-v2-to-v3-migration']);
  });

  it('copies a selected skill with its references', () => {
    const results = addSkills({ names: ['bou-parsing'], skillsDir, targetDir });
    expect(results).toEqual([{ name: 'bou-parsing', target: join(targetDir, 'bou-parsing'), action: 'added' }]);
    expect(existsSync(join(targetDir, 'bou-parsing', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(targetDir, 'bou-parsing', 'references', 'features.md'))).toBe(true);
    expect(existsSync(join(targetDir, 'bou-parsing-v2-to-v3-migration'))).toBe(false);
  });

  it('copies multiple skills at once', () => {
    const results = addSkills({ names: ['bou-parsing', 'bou-parsing-v2-to-v3-migration'], skillsDir, targetDir });
    expect(results.map((r) => r.action)).toEqual(['added', 'added']);
    expect(existsSync(join(targetDir, 'bou-parsing-v2-to-v3-migration', 'references', 'rollout.md'))).toBe(true);
  });

  it('overwrites an existing skill folder', () => {
    addSkills({ names: ['bou-parsing'], skillsDir, targetDir });
    const file = join(targetDir, 'bou-parsing', 'SKILL.md');
    writeFileSync(file, 'stale');
    const results = addSkills({ names: ['bou-parsing'], skillsDir, targetDir });
    expect(results[0].action).toBe('updated');
    expect(readFileSync(file, 'utf8')).not.toBe('stale');
  });

  it('throws for unknown skill names, listing available ones', () => {
    expect(() => addSkills({ names: ['nope'], skillsDir, targetDir })).toThrow(/Unknown skill: nope/);
    expect(() => addSkills({ names: ['nope'], skillsDir, targetDir })).toThrow(/bou-parsing/);
  });
});
