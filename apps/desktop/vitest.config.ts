import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Unit tests for the desktop main-process pure logic (offline-subscription
// evaluation + idempotency keys). The offline-token module imports `electron`
// at the top, which doesn't exist in a node test runner — alias it to a stub.
// Run with:  pnpm --filter desktop test
export default defineConfig({
    resolve: {
        alias: {
            electron: path.resolve(__dirname, 'electron/__tests__/__mocks__/electron.ts'),
        },
    },
    test: {
        environment: 'node',
        include: ['electron/**/*.test.ts'],
    },
});
