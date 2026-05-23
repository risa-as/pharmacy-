
import Store from 'electron-store';

interface StoreSchema {
    branchId: string;
    organizationId: string;
    organizationName: string;
    /** ISO timestamp of last successful online check-in (for clock-rollback detection). */
    lastSeenAt: string;
    /** ID of the last successfully logged-in user — used to restore session on app restart. */
    loggedInUserId: string;
    /** Whether to show the receipt/invoice preview after completing a sale. Default: true. */
    showReceiptAfterSale: boolean;
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
        loggedInUserId: "",
        showReceiptAfterSale: true,
        pendingSyncActions: []
    }
});

export default store;
