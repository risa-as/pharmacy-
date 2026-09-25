import { defineConfig, loadEnv } from 'vite'
import path from 'node:path'
import electron from 'vite-plugin-electron/simple'
import react from '@vitejs/plugin-react'
import { createDevStartup } from './scripts/dev-startup.cjs'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
    // Load .env from the desktop app root (all vars, not just VITE_ prefixed)
    const env = loadEnv(mode === 'development-watch' ? 'development' : mode, path.resolve(__dirname), '')
    const startElectron = createDevStartup(mode === 'development-watch')

    return {
        // Bundle the workspace TypeScript entry in the renderer. Its CommonJS
        // dist entry is consumed by Node, and is not a browser ESM entry.
        resolve: {
            alias: { '@faramace/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts') },
            // Shared source has legacy CommonJS .js siblings. Prefer the TS
            // sources for extensionless exports so Node globals never leak
            // into the sandboxed renderer bundle.
            extensions: ['.mjs', '.ts', '.tsx', '.js', '.jsx', '.json'],
        },
        plugins: [
            react(),
            electron({
                main: {
                    entry: 'electron/main.ts',
                    onstart: startElectron,
                    vite: {
                        // Bake env vars as global constants into dist-electron/main.js at build time.
                        // Using __VAR__ globals (not process.env.*) because vite-plugin-electron
                        // does NOT reliably replace process.env.* in the main process build.
                        define: {
                            __API_URL__: JSON.stringify(env.VITE_API_URL || ''),
                            __CLOUD_API_URL__: JSON.stringify(env.VITE_CLOUD_API_URL || ''),
                            __ZAINCASH_MERCHANT_ID__: JSON.stringify(env.ZAINCASH_MERCHANT_ID || ''),
                            __ZAINCASH_SECRET__: JSON.stringify(env.ZAINCASH_SECRET || ''),
                            __ZAINCASH_BASE_URL__: JSON.stringify(env.ZAINCASH_BASE_URL || ''),
                            __OFFLINE_TOKEN_PUBLIC_KEY__: JSON.stringify(env.OFFLINE_TOKEN_PUBLIC_KEY || ''),
                        },
                        build: {
                            minify: false,
                            rollupOptions: {
                                // electron-updater is externalized (not bundled) and shipped via
                                // node_modules — electron-builder auto-includes production deps,
                                // the same proven pattern as electron-store / node-fetch here.
                                external: ['node-fetch', 'electron-store', '@prisma/client', 'electron-updater'],
                            },
                        },
                    },
                },
                preload: {
                    input: path.join(__dirname, 'electron/preload.ts'),
                    onstart: startElectron,
                },
                renderer: {},
            }),
        ],
    }
})
