import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addSkills, discoverSkills, runAddSkills } from '../cli/add-skills';

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

describe('add-skills command line', () => {
  let workDir: string;
  let previousCwd: string;
  let previousExitCode: typeof process.exitCode;
  let previousIsTTY: boolean | undefined;
  let log: ReturnType<typeof vi.spyOn>;
  let error: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    workDir = realpathSync(mkdtempSync(join(tmpdir(), 'bou-skills-cli-')));
    previousCwd = process.cwd();
    previousExitCode = process.exitCode;
    previousIsTTY = process.stdin.isTTY;
    process.chdir(workDir);
    process.stdin.isTTY = false;
    log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.chdir(previousCwd);
    process.exitCode = previousExitCode;
    process.stdin.isTTY = previousIsTTY as boolean;
    log.mockRestore();
    error.mockRestore();
    rmSync(workDir, { recursive: true, force: true });
  });

  it('copies every skill into .claude/skills by default with --all', async () => {
    await runAddSkills(['--all']);
    expect(existsSync(join(workDir, '.claude', 'skills', 'bou-parsing', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(workDir, '.claude', 'skills', 'bou-parsing-v2-to-v3-migration', 'SKILL.md'))).toBe(true);
    expect(log).toHaveBeenCalledWith(`added bou-parsing -> ${join(workDir, '.claude', 'skills', 'bou-parsing')}`);
    expect(process.exitCode).toBe(previousExitCode);
  });

  it('accepts --dir <path> and --dir=<path> with named skills', async () => {
    await runAddSkills(['bou-parsing', '--dir', 'spaced']);
    await runAddSkills(['--dir=equals', 'bou-parsing']);
    expect(existsSync(join(workDir, 'spaced', 'bou-parsing', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(workDir, 'equals', 'bou-parsing', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(workDir, 'spaced', 'bou-parsing-v2-to-v3-migration'))).toBe(false);
    expect(existsSync(join(workDir, '.claude'))).toBe(false);
  });

  it('rejects --dir without a path, unknown options and unknown names', async () => {
    await expect(runAddSkills(['--all', '--dir'])).rejects.toThrow('--dir requires a path');
    await expect(runAddSkills(['--force'])).rejects.toThrow(/Unknown option: --force[\s\S]*Usage: npx @bou-co\/parsing add-skills/);
    await expect(runAddSkills(['nope'])).rejects.toThrow('Unknown skill: nope');
    expect(existsSync(join(workDir, '.claude'))).toBe(false);
  });

  it('prints usage with the available skills and sets exit code 1 without a selection on a non-TTY', async () => {
    await runAddSkills([]);
    expect(process.exitCode).toBe(1);
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0][0]).toContain('Usage: npx @bou-co/parsing add-skills');
    expect(error.mock.calls[0][0]).toContain('  bou-parsing\n  bou-parsing-v2-to-v3-migration');
    expect(existsSync(join(workDir, '.claude'))).toBe(false);
  });

  it('replaces the whole skill folder on update, dropping local files', async () => {
    await runAddSkills(['bou-parsing']);
    const skillDir = join(workDir, '.claude', 'skills', 'bou-parsing');
    writeFileSync(join(skillDir, 'local-notes.md'), 'mine');
    mkdirSync(join(skillDir, 'extra'));
    await runAddSkills(['bou-parsing']);
    expect(existsSync(join(skillDir, 'local-notes.md'))).toBe(false);
    expect(existsSync(join(skillDir, 'extra'))).toBe(false);
    expect(existsSync(join(skillDir, 'SKILL.md'))).toBe(true);
    expect(log).toHaveBeenLastCalledWith(`updated bou-parsing -> ${skillDir}`);
  });
});

describe('skill discovery', () => {
  it('returns nothing for a missing directory and skips folders without SKILL.md', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bou-skills-discover-'));
    try {
      mkdirSync(join(dir, 'with-skill'));
      writeFileSync(join(dir, 'with-skill', 'SKILL.md'), '# skill');
      mkdirSync(join(dir, 'without-skill'));
      writeFileSync(join(dir, 'loose-file.md'), 'x');
      expect(discoverSkills(join(dir, 'missing'))).toEqual([]);
      expect(discoverSkills(dir)).toEqual(['with-skill']);
      expect(() => addSkills({ names: ['without-skill'], skillsDir: dir, targetDir: join(dir, 'out') })).toThrow(
        'Unknown skill: without-skill. Available: with-skill',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('cli entry', () => {
  const runCli = async (...args: string[]) => {
    const previousArgv = process.argv;
    const previousExitCode = process.exitCode;
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      process.argv = ['node', 'bou-parsing', ...args];
      process.exitCode = undefined;
      vi.resetModules();
      await import('../cli/index');
      return { exitCode: process.exitCode, output: log.mock.calls.map(([line]) => String(line)).join('\n') };
    } finally {
      process.argv = previousArgv;
      process.exitCode = previousExitCode;
      log.mockRestore();
    }
  };

  it('prints usage without a command and exits cleanly', async () => {
    const { exitCode, output } = await runCli();
    expect(output).toContain('Usage: npx @bou-co/parsing <command>');
    expect(output).toContain('add-skills [names...] [--all] [--dir <path>]');
    expect(exitCode).toBeUndefined();
  });

  it('prints usage and sets exit code 1 for an unknown command', async () => {
    const { exitCode, output } = await runCli('nope');
    expect(output).toContain('Usage: npx @bou-co/parsing <command>');
    expect(exitCode).toBe(1);
  });
});
