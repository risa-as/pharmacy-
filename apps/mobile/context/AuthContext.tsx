import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authService, MobileSessionLimitError, SessionInvalidError, User } from '../services/auth';
import { registerSessionExpiredHandler } from '../services/api';

interface AuthContextType {
    user: User | null;
    role: string | null;
    isAdmin: boolean;
    isPharmacist: boolean;
    branchId: string | null;
    isLoading: boolean;
    refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    role: null,
    isAdmin: false,
    isPharmacist: false,
    branchId: null,
    isLoading: true,
    refreshUser: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);

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

            setUser(currentUser);
        } catch (error) {
            console.error('AuthContext: failed to load user', error);
            setUser(null);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        refreshUser();
    }, [refreshUser]);

    // When the session expires (401 on any request), api.ts clears SecureStore
    // and calls this handler so we also wipe the React state. Without this,
    // the next user who logs in on the same device would still see the previous
    // user's role (e.g. admin) until AuthContext is remounted.
    useEffect(() => {
        registerSessionExpiredHandler(() => {
            setUser(null);
        });
    }, []);

    const role = user?.role ?? null;
    const roleUpper = role?.toUpperCase() ?? null;
    const isAdmin = roleUpper === 'ADMIN' || roleUpper === 'MANAGER';
    const isPharmacist = roleUpper === 'PHARMACIST';
    const branchId = user?.branchId ?? null;

    return (
        <AuthContext.Provider value={{ user, role, isAdmin, isPharmacist, branchId, isLoading, refreshUser }}>
            {children}
        </AuthContext.Provider>
    );
};
