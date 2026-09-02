import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: {
    // tsconfig.json sets "jsx": "preserve" for Next's own compiler; vitest's
    // esbuild transform needs the runtime spelled out explicitly instead.
    jsx: 'automatic',
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
  },
});
