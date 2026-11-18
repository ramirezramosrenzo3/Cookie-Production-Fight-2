import { defineConfig } from 'vitest/config';

// base relativa: funciona igual en GitHub Pages (/repo/) que en un dominio propio
export default defineConfig({
  base: './',
  esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
  build: {
    target: 'es2020',
    sourcemap: true,
  },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
