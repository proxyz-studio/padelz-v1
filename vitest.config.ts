import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react',
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    coverage: { provider: 'v8', reporter: ['text', 'lcov'] },
  },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
});
