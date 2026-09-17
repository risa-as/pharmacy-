import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Unit tests for pure business-logic modules (no Next.js runtime needed).
// Run with:  pnpm --filter web test
export default defineConfig({
    resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
    test: {
        environment: 'node',
        include: ['app/**/*.test.ts'],
    },
});
