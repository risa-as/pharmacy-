import { defineConfig, loadEnv } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import electron from 'vite-plugin-electron/simple';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, __dirname, '');

    return {
        plugins: [
            react(),
            electron({
                main: {
                    entry: 'electron/main.ts',
                    vite: {
                        define: {
                            __API_URL__: JSON.stringify(env.VITE_API_URL || ''),
                            __CLOUD_API_URL__: JSON.stringify(env.VITE_CLOUD_API_URL || ''),
                            __BACKUP_SECRET_KEY__: JSON.stringify(env.BACKUP_SECRET_KEY || ''),
                            __ZAINCASH_MERCHANT_ID__: JSON.stringify(env.ZAINCASH_MERCHANT_ID || ''),
                            __ZAINCASH_SECRET__: JSON.stringify(env.ZAINCASH_SECRET || ''),
                            __ZAINCASH_BASE_URL__: JSON.stringify(env.ZAINCASH_BASE_URL || ''),
                            __OFFLINE_TOKEN_PUBLIC_KEY__: JSON.stringify(env.OFFLINE_TOKEN_PUBLIC_KEY || ''),
                        },
                        build: {
                            rollupOptions: {
                                external: ['node-fetch', '@prisma/client', '.prisma/client', 'electron-store'],
                            },
                        },
                    },
                },
                preload: {
                    input: path.join(__dirname, 'electron/preload.ts'),
                },
                renderer: {},
            }),
        ],
    };
});
