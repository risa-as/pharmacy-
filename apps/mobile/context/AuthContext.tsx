import { AppState } from 'react-native';
import { request } from '../services/api';
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authService, MobileSessionLimitError, SessionInvalidError, User } from '../services/auth';
import { registerSessionExpiredHandler } from '../services/api';
import { AppShell, canSwitchBranch, getShell } from '../utils/roles';

interface AuthContextType {
    can: (permission: string) => boolean;
    features: Record<string, boolean>;
    user: User | null;
    role: string | null;
    /** ADMIN / MANAGER — may switch branches. */
    isAdmin: boolean;
    isPharmacist: boolean;
    /** Which tab bar + home the user sees (see utils/roles). */
    shell: AppShell;
    isPharmacistShell: boolean;
    branchId: string | null;
    isLoading: boolean;
    refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    can: () => false,
    features: {},
    user: null,
    role: null,
    isAdmin: false,
    isPharmacist: false,
    shell: 'manager',
    isPharmacistShell: false,
    branchId: null,
    isLoading: true,
    refreshUser: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [permissions, setPermissions] = useState<Record<string,boolean>>({});
    const [features, setFeatures] = useState<Record<string,boolean>>({});
    const loadAccess = useCallback(async () => {
        try { const access = await request<{permissions:Record<string,boolean>;features:Record<string,boolean>}>('/mobile/access'); setPermissions(access.permissions); setFeatures(access.features); }
        catch { setPermissions({}); setFeatures({}); }
    }, []);

    const refreshUser = useCallback(async () => {
        try {
            let currentUser = await authService.getCurrentUser();

            if (currentUser && currentUser.role !== 'SUPER_ADMIN') {
                // 1. Renew the JWT and re-validate the account (revocation point):
                //    a disabled employee / suspended org / expired token → logout.
                //    Network error → keep current token (offline access allowed).
                try {
                    await authService.refreshAccessToken();
                    currentUser = await authService.getCurrentUser(); // pick up refreshed user
                } catch (refreshError: any) {
                    if (refreshError instanceof SessionInvalidError) {
                        console.warn('AuthContext: session invalid on startup, forcing logout');
                        await authService.logout();
                        setUser(null);
                        return;
                    }
                    // Other errors → allow offline access
                }

                // 2. Enforce the mobile session-seat limit on startup for ADMIN/PHARMACIST.
                //    On 403 (plan limit exceeded) → force logout. Network error → silent.
                try {
                    await authService.verifySessionOnStartup(currentUser!.id);
                } catch (sessionError: any) {
                    if (sessionError instanceof MobileSessionLimitError) {
                        console.warn('AuthContext: session limit exceeded on startup, forcing logout');
                        await authService.logout();
                        setUser(null);
                        return;
                    }
                    // Any other error (network, server down) → allow offline access
                }
            }

            if (currentUser) await loadAccess(); else { setPermissions({}); setFeatures({}); }
            setUser(currentUser);
        } catch (error) {
            console.error('AuthContext: failed to load user', error);
            setUser(null);
        } finally {
            setIsLoading(false);
        }
    }, [loadAccess]);

    useEffect(() => {
        refreshUser();
    }, [refreshUser]);

    // When the session expires (401 on any request), api.ts clears SecureStore
    // and calls this handler so we also wipe the React state. Without this,
    // the next user who logs in on the same device would still see the previous
    // user's role (e.g. admin) until AuthContext is remounted.
    useEffect(() => {
        registerSessionExpiredHandler(() => {
            setUser(null); setPermissions({}); setFeatures({});
        });
    }, []);

    useEffect(() => {
        if (!user) return;
        const listener = AppState.addEventListener('change', state => { if (state === 'active') void loadAccess(); });
        const timer = setInterval(() => { if (AppState.currentState === 'active') void loadAccess(); }, 60000);
        return () => { listener.remove(); clearInterval(timer); };
    }, [user?.id, loadAccess]);
    const role = user?.role ?? null;
    const roleUpper = role?.toUpperCase() ?? null;
    const isAdmin = canSwitchBranch(role);
    const isPharmacist = roleUpper === 'PHARMACIST';
    const shell = getShell(role);
    const isPharmacistShell = shell === 'pharmacist';
    const branchId = user?.branchId ?? null;

    return (
        <AuthContext.Provider value={{ can: permission => permissions[permission] === true, features, user, role, isAdmin, isPharmacist, shell, isPharmacistShell, branchId, isLoading, refreshUser }}>
            {children}
        </AuthContext.Provider>
    );
};
