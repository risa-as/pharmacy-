
import Store from 'electron-store';

interface StoreSchema {
    branchId: string;
    organizationId: string;
    organizationName: string;
    /** ISO timestamp of last successful online check-in (for clock-rollback detection). */
    lastSeenAt: string;
    pendingSyncActions: Array<{
        id: string;
        type: 'create-drug' | 'add-inventory' | 'delete-inventory';
        payload: Record<string, unknown>;
        createdAt: string;
        attempts: number;
        lastError?: string;
        nextRetryAt?: string;
    }>;
}

const store = new Store<StoreSchema>({
    defaults: {
        branchId: "",
        organizationId: "",
        organizationName: "",
        lastSeenAt: "",
        pendingSyncActions: []
    }
});

export default store;
