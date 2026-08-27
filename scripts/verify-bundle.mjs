// Verifies the built package tree-shakes: named type imports drop unrelated types, and no subset pulls the content peers
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'vite';

const dist = resolve(import.meta.dirname, '../dist');
const dir = mkdtempSync(join(tmpdir(), 'bou-parsing-bundle-'));

const bundle = async (name, source) => {
  const entry = join(dir, `${name}.js`);
  writeFileSync(entry, source);
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    root: dir,
    build: {
      write: false,
      minify: false,
      lib: { entry, formats: ['es'], fileName: name },
      rolldownOptions: { external: [/^(sanitize-html|ultrahtml|marked)(\/.*)?$/], treeshake: true },
    },
  });
  const outputs = Array.isArray(result) ? result : [result];
  return outputs.flatMap((output) => output.output.map((chunk) => chunk.code ?? '')).join('\n');
};

const failures = [];
const check = (label, code, { includes = [], excludes = [] }) => {
  for (const marker of includes) if (!code.includes(marker)) failures.push(`${label}: expected to contain ${JSON.stringify(marker)}`);
  for (const marker of excludes) if (code.includes(marker)) failures.push(`${label}: must not contain ${JSON.stringify(marker)}`);
};

const namedImport = await bundle('named', `import { email } from '${join(dist, 'types/index.js')}'; export { email };`);
check('named import of email', namedImport, {
  includes: ['Invalid email'],
  excludes: ['Invalid slug', 'Invalid color', 'Invalid MIME type', 'Does not match'],
});

const core = await bundle('core', `import { initializeParser } from '${join(dist, 'index.js')}'; export { initializeParser };`);
check('core entry', core, { excludes: ['sanitize-html', 'ultrahtml', 'marked'] });

for (const subset of ['format', 'data', 'all']) {
  const file = join(dist, `types/${subset}.js`);
  if (!existsSync(file)) continue;
  const code = await bundle(subset, `export * from '${file}';`);
  check(`types/${subset}`, code, { excludes: ['sanitize-html', 'ultrahtml', 'marked'] });
}

rmSync(dir, { recursive: true, force: true });
if (failures.length) {
  console.error('Bundle verification failed:\n - ' + failures.join('\n - '));
  process.exit(1);
}
console.log('Bundle verification passed');
