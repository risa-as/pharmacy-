/** @type {import('next').NextConfig} */
const nextConfig = {
    transpilePackages: ["@faramace/ui"],

    // ── Performance ─────────────────────────────────────────────────────────
    compress: true,           // gzip / brotli for all responses
    poweredByHeader: false,   // remove X-Powered-By (saves bytes + security)
    reactStrictMode: true,

    // Remove all console.* calls in production except errors/warnings
    compiler: {
        removeConsole: process.env.NODE_ENV === 'production'
            ? { exclude: ['error', 'warn'] }
            : false,
    },

    // ── Images ──────────────────────────────────────────────────────────────
    images: {
        formats: ['image/avif', 'image/webp'],
        minimumCacheTTL: 60 * 60 * 24 * 30, // 30 days
        remotePatterns: [
            { protocol: "https", hostname: "utfs.io" },
            { protocol: "https", hostname: "ufs.sh" },
        ],
    },

    // ── HTTP Headers ─────────────────────────────────────────────────────────
    async headers() {
        return [
            // Static assets — long-lived immutable cache
            {
                source: '/_next/static/:path*',
                headers: [
                    { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
                ],
            },
            // Fonts — long-lived cache
            {
                source: '/fonts/:path*',
                headers: [
                    { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
                ],
            },
            // API routes — no cache by default (overridden per route where appropriate)
            {
                source: '/api/:path*',
                headers: [
                    { key: 'X-Content-Type-Options', value: 'nosniff' },
                    { key: 'X-Frame-Options', value: 'DENY' },
                ],
            },
        ];
    },
};

module.exports = nextConfig;
