/** @type {import('next').NextConfig} */
const nextConfig = {
    transpilePackages: ["@faramace/ui"],

    // ── Standalone build (portable, no node_modules needed on target machine)
    output: 'standalone',

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
            // Global security headers (apply to pages + API).
            // Note: CSP intentionally restricts framing/objects/base-uri only,
            // not script/style sources, to avoid breaking Next.js hydration.
            {
                source: '/:path*',
                headers: [
                    { key: 'X-Content-Type-Options', value: 'nosniff' },
                    { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
                    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
                    {
                        key: 'Strict-Transport-Security',
                        value: 'max-age=63072000; includeSubDomains; preload',
                    },
                    {
                        key: 'Permissions-Policy',
                        value: 'geolocation=(), microphone=(), payment=()',
                    },
                    {
                        key: 'Content-Security-Policy',
                        value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
                    },
                ],
            },
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
        ];
    },
};

module.exports = nextConfig;
