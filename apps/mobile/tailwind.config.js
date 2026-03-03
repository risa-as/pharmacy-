/**
 * Faramace Mobile — Tailwind / NativeWind v2 Config
 *
 * Design tokens are kept in sync with packages/shared/tailwind.config.ts → staticTokens.
 * NativeWind v2 + Metro resolve configs at JS runtime; TypeScript ESM files cannot be
 * required() directly, so the values are inlined below.
 * ⚠ When updating tokens in packages/shared/tailwind.config.ts, update here too.
 */

/** @type {import('tailwindcss').Config} */
module.exports = {
    // 'media' → follows OS Appearance API (dark/light auto switch)
    darkMode: 'media',

    content: [
        './app/**/*.{js,jsx,ts,tsx}',
        './components/**/*.{js,jsx,ts,tsx}',
        './context/**/*.{js,jsx,ts,tsx}',
    ],

    theme: {
        extend: {
            colors: {
                // ── Brand ──────────────────────────────────────────
                // Medical teal — source: staticTokens.colors.primary
                primary: {
                    DEFAULT: '#0F7575',
                    light:   '#1CABAC',
                    dark:    '#0B5E5E',
                },

                // ── Semantic ────────────────────────────────────────
                // Light-mode values / dark-mode suffixed variants for
                // NativeWind colorScheme-conditional classes
                success: {
                    DEFAULT: '#2D8A52',
                    dark:    '#44C47A',
                },
                warning: {
                    DEFAULT: '#C47820',
                    dark:    '#D4934A',
                },
                danger: {
                    DEFAULT: '#B03030',
                    dark:    '#D86B6B',
                },
                info: {
                    DEFAULT: '#2B6F8F',
                    dark:    '#5B9FBE',
                },

                // ── Surfaces (static — no CSS vars in RN) ───────────
                surface: {
                    DEFAULT: '#FAFAF8',   // warm off-white (matches --background light)
                    dark:    '#181614',   // warm dark      (matches --background dark)
                },
                card: {
                    DEFAULT: '#FFFFFF',
                    dark:    '#211E1B',   // matches --card dark
                },
            },

            fontFamily: {
                // Arabic-first stack matching the shared config
                sans: ['IBM Plex Sans Arabic', 'Cairo', 'System'],
            },

            borderRadius: {
                DEFAULT: '8px',
                lg:      '12px',
                xl:      '16px',
                '2xl':   '20px',
            },
        },
    },

    // NativeWind v2 uses the Babel plugin only — no tailwind plugin needed
    plugins: [],
};
