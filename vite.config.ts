import { cpSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { defineConfig } from 'vite';
import dts from 'unplugin-dts/vite';

// Every non-spec file under src/types is its own entry so single-type imports (`@bou-co/parsing/types/format/currency`) resolve and tree-shake
const typeEntries = Object.fromEntries(
  readdirSync(resolve(import.meta.dirname, 'src/types'), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts'))
    .map((entry) => {
      const name = relative(resolve(import.meta.dirname, 'src'), join(entry.parentPath, entry.name))
        .replace(/\\/g, '/')
        .replace(/\.ts$/, '');
      return [name, `${name}.ts`];
    }),
);

export default defineConfig({
  root: resolve(import.meta.dirname, 'src'),
  plugins: [
    dts({
      root: resolve(import.meta.dirname),
      entryRoot: resolve(import.meta.dirname, 'src'),
      tsconfigPath: resolve(import.meta.dirname, 'tsconfig.lib.json'),
      exclude: ['src/tests/**/*', '**/*.spec.ts', '**/*.test.ts'],
      compilerOptions: {
        rootDir: resolve(import.meta.dirname, 'src'),
      },
    }),
    {
      name: 'copy-skills',
      closeBundle() {
        cpSync(resolve(import.meta.dirname, 'src/skills'), resolve(import.meta.dirname, 'dist/skills'), { recursive: true });
      },
    },
  ],
  build: {
    outDir: resolve(import.meta.dirname, 'dist'),
    emptyOutDir: true,
    target: 'es2022',
    minify: true,
    reportCompressedSize: true,
    lib: {
      name: 'bou-co-parsing',
      formats: ['es', 'cjs'],
      entry: {
        index: 'index.ts',
        ...typeEntries,
        'react/index': 'react/index.ts',
        'templates/localize': 'templates/localize.ts',
        'cli/index': 'cli/index.ts',
      },
    },
    rolldownOptions: {
      treeshake: true,
      external: [/^node:/, /^(path|fs|url|crypto)(\/.*)?$/, /^react(\/.*)?$/, /^react-dom(\/.*)?$/, /^(sanitize-html|ultrahtml|marked)(\/.*)?$/],
      optimization: { inlineConst: true },
      output: {
        banner: (chunk) => (chunk.name === 'cli/index' ? '#!/usr/bin/env node' : ''),
      },
      onwarn(warning, warn) {
        // cli guards import.meta behind typeof __dirname, so the cjs replacement is harmless
        if (warning.code === 'EMPTY_IMPORT_META') return;
        warn(warning);
      },
    },
  },
});
