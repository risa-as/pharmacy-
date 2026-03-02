import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authService, User } from '../services/auth';
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
            const currentUser = await authService.getCurrentUser();
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
