import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const raw = process.env.TEST_DATABASE_URL;
if (!raw) throw new Error('TEST_DATABASE_URL is required; integration tests never use DATABASE_URL implicitly.');
const target = new URL(raw);
if (!['localhost', '127.0.0.1'].includes(target.hostname) || target.pathname !== '/faramace_readiness') {
    throw new Error('Integration tests require the isolated local faramace_readiness database.');
}
process.env.DATABASE_URL = raw;
export default defineConfig({
    resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
    test: { environment: 'node', include: ['tests/**/*.integration.test.ts'], fileParallelism: false, testTimeout: 30_000, hookTimeout: 30_000 },
});
