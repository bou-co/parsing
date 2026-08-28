import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';

// __dirname guard keeps the cjs build functional (rolldown replaces import.meta with {} there)
const moduleDir = typeof __dirname === 'undefined' ? dirname(fileURLToPath(import.meta.url)) : __dirname;

export interface AddSkillsOptions {
  names: string[];
  skillsDir: string;
  targetDir: string;
}

export interface AddSkillsResult {
  name: string;
  target: string;
  action: 'added' | 'updated';
}

export const discoverSkills = (skillsDir: string): string[] => {
  if (!existsSync(skillsDir)) return [];
  return readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(skillsDir, entry.name, 'SKILL.md')))
    .map((entry) => entry.name)
    .sort();
};

export const addSkills = ({ names, skillsDir, targetDir }: AddSkillsOptions): AddSkillsResult[] => {
  const available = discoverSkills(skillsDir);
  const unknown = names.filter((name) => !available.includes(name));
  if (unknown.length) {
    throw new Error(`Unknown skill${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}. Available: ${available.join(', ')}`);
  }
  mkdirSync(targetDir, { recursive: true });
  return names.map((name) => {
    const target = join(targetDir, name);
    const action = existsSync(target) ? 'updated' : 'added';
    rmSync(target, { recursive: true, force: true });
    cpSync(join(skillsDir, name), target, { recursive: true });
    return { name, target, action };
  });
};

const usage = `Usage: npx @bou-co/parsing add-skills [names...] [--all] [--dir <path>]

Copies the selected skills into your repo (default destination: .claude/skills/).`;

const promptForSkills = async (available: string[]): Promise<string[]> => {
  console.log('Available skills:');
  available.forEach((name, index) => console.log(`  ${index + 1}. ${name}`));
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question('Skills to add (numbers like "1,2", "all", empty to cancel): ')).trim();
    if (!answer) return [];
    if (/^(all|a)$/i.test(answer)) return available;
    return answer.split(/[\s,]+/).map((token) => {
      const name = /^\d+$/.test(token) ? available[Number(token) - 1] : undefined;
      if (!name) throw new Error(`Invalid selection: ${token}`);
      return name;
    });
  } finally {
    rl.close();
  }
};

export const runAddSkills = async (argv: string[]): Promise<void> => {
  const names: string[] = [];
  let all = false;
  let dir: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--all') all = true;
    else if (arg === '--dir') {
      dir = argv[++i];
      if (!dir) throw new Error('--dir requires a path');
    } else if (arg.startsWith('--dir=')) dir = arg.slice('--dir='.length);
    else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}\n\n${usage}`);
    else names.push(arg);
  }

  const skillsDir = join(moduleDir, '..', 'skills');
  const available = discoverSkills(skillsDir);
  if (!available.length) throw new Error(`No bundled skills found in ${skillsDir}`);

  let selected = all ? available : names;
  if (!selected.length) {
    if (!process.stdin.isTTY) {
      console.error(`${usage}\n\nAvailable skills:\n${available.map((name) => `  ${name}`).join('\n')}`);
      process.exitCode = 1;
      return;
    }
    selected = await promptForSkills(available);
    if (!selected.length) {
      console.log('Nothing selected.');
      return;
    }
  }

  const targetDir = resolve(dir ?? join('.claude', 'skills'));
  const results = addSkills({ names: selected, skillsDir, targetDir });
  for (const { name, target, action } of results) {
    console.log(`${action} ${name} -> ${target}`);
  }
};
