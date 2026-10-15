import { describe, expect, it } from 'vitest';
import { hasUpdateProtection, isSafeUpdateRoute, isSafeUpdateHistory, registerUpdateProtection } from './update-protection';
describe('update protection', () => {
    it('does not reload editable routes or unknown routes', () => {
        for (const path of ['/sales', '/purchases/123/receive', '/debts', '/smart-orders', '/login', '/new-editor']) expect(isSafeUpdateRoute(path)).toBe(false);
        for (const path of ['/', '/(tabs)', '/more', '/settings/about']) expect(isSafeUpdateRoute(path)).toBe(true);
    });
    it('unwraps the generated Expo slot while still protecting nested forms', () => {
        const safe = { routes: [{ name: '__root', state: { routes: [{ name: '(tabs)' }, { name: 'settings', state: { routes: [{ name: 'about' }] } }] } }] };
        expect(isSafeUpdateHistory(safe)).toBe(true);
        expect(isSafeUpdateHistory({ routes: [{ name: '__root' }] })).toBe(false);
        expect(isSafeUpdateHistory({ routes: [{ name: '__root', state: { routes: [{ name: 'purchases/[id]/receive' }] } }] })).toBe(false);
    });
    it('protects forms left in the root stack behind a safe screen', () => {
        expect(isSafeUpdateHistory({ routes: [{ name: '(tabs)' }, { name: 'purchases/[id]/receive' }, { name: 'settings/about' }] })).toBe(false);
        expect(isSafeUpdateHistory({ routes: [{ name: '(tabs)' }, { name: 'settings', state: { routes: [{ name: 'account' }, { name: 'about' }] } }] })).toBe(false);
        expect(isSafeUpdateHistory({ routes: [{ name: '(tabs)' }, { name: 'settings', state: { routes: [{ name: 'about' }] } }] })).toBe(true);
        expect(isSafeUpdateHistory(undefined)).toBe(false);
    });
    it('tracks a hidden form immediately and releases it when unmounted', () => {
        let blocked = true;
        const remove = registerUpdateProtection(() => blocked);
        expect(hasUpdateProtection()).toBe(true);
        blocked = false;
        expect(hasUpdateProtection()).toBe(false);
        blocked = true;
        remove();
        expect(hasUpdateProtection()).toBe(false);
    });
    it('fails closed if a safety reader throws', () => {
        const remove = registerUpdateProtection(() => { throw Error('not ready'); });
        expect(hasUpdateProtection()).toBe(true);
        remove();
    });
});
