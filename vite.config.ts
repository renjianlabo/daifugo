import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { host: true },
  test: { testTimeout: 1800000, include: ['tests/**/*.test.ts'] },
} as any);
