module.exports = function (api) {
    // Cache keyed by NODE_ENV so dev/prod configs stay separate.
    // api.cache(true) cannot be combined with api.env() — both configure caching.
    api.cache.using(() => process.env.NODE_ENV);
    // NativeWind v2 babel plugin calls PostCSS synchronously. Tailwind CSS 3.4.x
    // uses async PostCSS internals, which PostCSS 8.5.x rejects in sync mode.
    // On EAS Linux (non-hoisted pnpm), NativeWind resolves an older Tailwind that
    // is sync — builds work fine. On Windows Expo Go (hoisted), it picks up
    // workspace root's Tailwind 3.4.x and fails.
    // Fix: skip compile step in dev (Expo Go shows unstyled but functional app);
    // production EAS builds use the full pipeline and styles work correctly.
    const isDev = process.env.NODE_ENV === 'development';
    return {
        presets: ['babel-preset-expo'],
        plugins: [
            isDev
                ? ['nativewind/babel', { mode: 'transformOnly' }]
                : 'nativewind/babel',
        ],
    };
};
