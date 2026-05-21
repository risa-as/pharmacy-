module.exports = function (api) {
    api.cache(true);
    // NativeWind v2 babel plugin calls PostCSS synchronously. Tailwind CSS 3.4.x
    // uses async PostCSS internals, which PostCSS 8.5.x rejects in sync mode.
    // On EAS Linux (non-hoisted pnpm), NativeWind resolves an older Tailwind that
    // is sync — builds work fine. On Windows Expo Go (hoisted), it picks up
    // workspace root's Tailwind 3.4.x and fails.
    // Fix: skip compile step in dev (Expo Go shows unstyled but functional app);
    // production EAS builds use the full pipeline and styles work correctly.
    const isDev = api.env('development');
    return {
        presets: ['babel-preset-expo'],
        plugins: [
            isDev
                ? ['nativewind/babel', { mode: 'transformOnly' }]
                : 'nativewind/babel',
        ],
    };
};
