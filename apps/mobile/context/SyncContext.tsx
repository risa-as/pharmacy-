import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

interface SyncContextValue {
    lastSyncedAt: Record<string, Date>;
    isSyncing: boolean;
    markSynced: (key: string) => void;
    setSyncing: (key: string, active: boolean) => void;
    registerTrigger: (key: string, fn: () => void) => void;
    triggerSync: (key: string) => void;
}

const SyncContext = createContext<SyncContextValue>({
    lastSyncedAt: {},
    isSyncing: false,
    markSynced: () => {},
    setSyncing: () => {},
    registerTrigger: () => {},
    triggerSync: () => {},
});

export function SyncProvider({ children }: { children: React.ReactNode }) {
    const [lastSyncedAt, setLastSyncedAt] = useState<Record<string, Date>>({});
    const [syncingKeys, setSyncingKeys] = useState<Set<string>>(new Set());
    const triggers = useRef<Record<string, () => void>>({});

    const markSynced = useCallback((key: string) => {
        setLastSyncedAt(prev => ({ ...prev, [key]: new Date() }));
        setSyncingKeys(prev => {
            const next = new Set(prev);
            next.delete(key);
            return next;
        });
    }, []);

    const setSyncing = useCallback((key: string, active: boolean) => {
        setSyncingKeys(prev => {
            const next = new Set(prev);
            if (active) next.add(key);
            else next.delete(key);
            return next;
        });
    }, []);

    const registerTrigger = useCallback((key: string, fn: () => void) => {
        triggers.current[key] = fn;
    }, []);

    const triggerSync = useCallback((key: string) => {
        const fn = triggers.current[key];
        if (fn) fn();
    }, []);

    return (
        <SyncContext.Provider value={{
            lastSyncedAt,
            isSyncing: syncingKeys.size > 0,
            markSynced,
            setSyncing,
            registerTrigger,
            triggerSync,
        }}>
            {children}
        </SyncContext.Provider>
    );
}

export function useSyncStatus() {
    return useContext(SyncContext);
}
