import { defineConfig, loadEnv } from 'vite'
import path from 'node:path'
import electron from 'vite-plugin-electron/simple'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
    // Load .env from the desktop app root (all vars, not just VITE_ prefixed)
    const env = loadEnv(mode, path.resolve(__dirname), '')

    return {
        plugins: [
            react(),
            electron({
                main: {
                    entry: 'electron/main.ts',
                    vite: {
                        // Bake env vars into dist-electron/main.js at build time
                        define: {
                            'process.env.VITE_API_URL': JSON.stringify(env.VITE_API_URL || ''),
                            'process.env.VITE_CLOUD_API_URL': JSON.stringify(env.VITE_CLOUD_API_URL || ''),
                            'process.env.BACKUP_SECRET_KEY': JSON.stringify(env.BACKUP_SECRET_KEY || ''),
                            'process.env.ZAINCASH_MERCHANT_ID': JSON.stringify(env.ZAINCASH_MERCHANT_ID || ''),
                            'process.env.ZAINCASH_SECRET': JSON.stringify(env.ZAINCASH_SECRET || ''),
                            'process.env.ZAINCASH_BASE_URL': JSON.stringify(env.ZAINCASH_BASE_URL || ''),
                            'process.env.OFFLINE_TOKEN_PUBLIC_KEY': JSON.stringify(env.OFFLINE_TOKEN_PUBLIC_KEY || ''),
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
    }
})
