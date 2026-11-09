import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'packages/**/src/**/*.test.ts',
      'apps/web/src/**/*.test.ts',
      'supabase/functions/_shared/**/*.test.ts',
    ],
    environment: 'node',
    restoreMocks: true,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
