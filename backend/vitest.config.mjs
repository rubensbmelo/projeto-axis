import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    // Integração contra Supabase real: sequencial evita colisão/flakiness.
    fileParallelism: false,
  },
});


