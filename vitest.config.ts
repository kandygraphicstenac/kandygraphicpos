import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/__tests__/**/*.test.ts'],
    // The real-DB integration test (lib/reports/__tests__) makes several
    // round trips to Supabase and takes ~13s, so the 5s default flakes.
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './'),
    },
  },
});
