import { join } from 'path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  root: __dirname,
  cacheDir: './node_modules/.vite/libs/core',
  plugins: [
    dts({
      entryRoot: 'src',
      tsconfigPath: join(__dirname, 'tsconfig.lib.json'),
      pathsToAliases: false,
    }),
  ],
  build: {
    outDir: './dist',
    emptyOutDir: true,
    reportCompressedSize: true,
    lib: {
      name: 'bou-co-parser',
      entry: {
        index: 'src/parser.ts',
        react: 'src/react/index.ts',
      },
      fileName: (format, entryName) => {
        const ext = format === 'es' ? 'js' : format;
        const parts = entryName.split('/');
        if (parts.length > 1) {
          const name = parts.at(-1);
          const path = parts.slice(0, -1).join('/');
          return `${path}/${name}.${ext}`;
        }
        return `${entryName}.${ext}`;
      },
      formats: ['es', 'cjs'],
    },
    rollupOptions: { treeshake: true, external: ['path', 'fs', 'react', 'react-dom', 'react/jsx-runtime'] },
  },
});
