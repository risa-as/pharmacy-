const guards = new Map<symbol, () => boolean>();

/** Readers are synchronous so an input change blocks a reload immediately. */
export function registerUpdateProtection(isBlocked: () => boolean): () => void {
    const id = Symbol();
    guards.set(id, isBlocked);
    return () => { guards.delete(id); };
}

export function hasUpdateProtection(): boolean {
    for (const read of guards.values()) {
        try { if (read()) return true; } catch { return true; }
    }
    return false;
}

/** Only routes without editable forms are eligible for automatic reload. */
export function isSafeUpdateRoute(path: string): boolean {
    const normalized = path.replace('/(tabs)', '') || '/';
    return ['/', '/more', '/settings', '/settings/about', '/settings/theme'].includes(normalized);
}

type NavigationTree = { routes: readonly { name: string; state?: NavigationTree }[] };
/** Stack screens stay mounted behind About; never discard their hidden forms. */
export function isSafeUpdateHistory(state: NavigationTree | undefined): boolean {
    if (!state) return false;
    return state.routes.every(route => {
        if (route.name === '(tabs)') return true; // Hidden tab editors register guards.
        if (route.name === 'settings') return !!route.state && route.state.routes.every(r => ['about', 'theme'].includes(r.name));
        return ['index', 'more', 'settings/about', 'settings/theme'].includes(route.name);
    });
}
