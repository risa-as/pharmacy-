import { defineConfig } from 'vitest/config';

// Unit tests for pure business-logic modules (no Next.js runtime needed).
// Run with:  pnpm --filter web test
export default defineConfig({
    test: {
        environment: 'node',
        include: ['app/**/*.test.ts'],
    },
});
