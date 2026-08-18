import { runAddSkills } from './add-skills';

const usage = `Usage: npx @bou-co/parsing <command>

Commands:
  add-skills [names...] [--all] [--dir <path>]   Copy bundled agent skills into your repo (default: .claude/skills/)`;

const [, , command, ...rest] = process.argv;

if (command === 'add-skills') {
  runAddSkills(rest).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
} else {
  console.log(usage);
  if (command) process.exitCode = 1;
}
