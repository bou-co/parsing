import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import dts from 'unplugin-dts/vite';

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
        types: 'types.ts',
        'react/index': 'react/index.ts',
        'templates/localize': 'templates/localize.ts',
      },
    },
    rolldownOptions: {
      treeshake: true,
      external: [/^node:/, /^(path|fs|url|crypto)(\/.*)?$/, /^react(\/.*)?$/, /^react-dom(\/.*)?$/],
      optimization: { inlineConst: true },
    },
  },
});
