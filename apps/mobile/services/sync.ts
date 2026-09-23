import NetInfo from '@react-native-community/netinfo';
import { dbService } from './db';
import { apiService, request, getSessionGeneration, SessionChangedError } from './api';
import { authService } from './auth';

interface SyncCallbacks {
    onStart?: (key: string) => void;
    onDone?: (key: string) => void;
    onStop?: (key:string) => void;
}

// Global callbacks — set by SyncContext bridge in app root
let globalCallbacks: SyncCallbacks = {};

function notifySyncStart() {
    try {
        globalCallbacks.onStart?.('sync');
    } catch (error) {
        console.error('Error notifying sync start:', error);
    }
}

function notifySyncDone() {
    try {
        globalCallbacks.onDone?.('sync');
    } catch (error) {
        console.error('Error notifying sync completion:', error);
    }
}

export const syncService = {
    /** Register SyncContext callbacks so syncData() can report status reactively. */
    setCallbacks(cbs: SyncCallbacks) {
        globalCallbacks = cbs;
    },

    // Check if we are online
    async isOnline(): Promise<boolean> {
        const state = await NetInfo.fetch();
        return state.isConnected === true && state.isInternetReachable === true;
    },

    isSyncing: false,

    // Sync Data (Upload Sales, Download Products)
    async syncData() {
        if (this.isSyncing) {
            console.log('Sync already in progress, skipping.');
            return;
        }

        this.isSyncing = true;
        const generation = getSessionGeneration();
        let hadErrors = false;

        // Don't sync if user is not authenticated or token is invalid
        let currentUser: Awaited<ReturnType<typeof authService.getCurrentUser>>;
        let token: string | null;
        try {
            currentUser = await authService.getCurrentUser();
            token = await authService.getToken();
        } catch (error) {
            console.error('Error preparing sync:', error);
            this.isSyncing = false;
            return;
        }
        // JWT tokens have 3 base64url parts separated by dots; old tokens don't
        if (!currentUser || !token || token.split('.').length !== 3) {
            console.log('Not authenticated or invalid token: Skipping sync');
            try {
                if (currentUser && token && token.split('.').length !== 3) {
                    // Clear stale non-JWT token so user is redirected to login cleanly
                    await authService.logout();
                }
            } catch (error) {
                console.error('Error clearing invalid sync session:', error);
            } finally {
                this.isSyncing = false;
            }
            return;
        }

        let online = false;
        try {
            online = await this.isOnline();
        } catch (error) {
            console.error('Error checking network state:', error);
        }

        if (!online) {
            console.log('Offline: Skipping sync');
            this.isSyncing = false;
            return;
        }

        notifySyncStart();
        console.log('Starting sync...');

        try {
            const isCurrentSession = async () => generation === getSessionGeneration();

            // 1. Upload Pending Sales
            try {
                if (!(await isCurrentSession())) throw new SessionChangedError('Session changed before sale sync');
                const pendingSales = await dbService.getPendingSales();
                if (pendingSales.length > 0) {
                    console.log(`Found ${pendingSales.length} pending sales to sync`);
                    for (const sale of pendingSales) {
                        if (!(await isCurrentSession())) throw new SessionChangedError('Session changed during sale sync');
                        try {
                            // Replay the full payload with the key minted at checkout,
                            // so a sale whose first request did reach the server is
                            // acknowledged as a duplicate instead of recorded twice.
                            await apiService.createSale(
                                sale.payload,
                                sale.idempotencyKey ?? `offline-${sale.id}-${sale.createdAt}`,
                            );
                            if (!(await isCurrentSession())) throw new SessionChangedError('Session changed before deleting synced sale');
                            await dbService.deleteOfflineSale(sale.id);
                            console.log(`Synced sale ${sale.id}`);
                        } catch (error) {
                            if (error instanceof SessionChangedError) throw error;
                            hadErrors = true;
                            console.error(`Failed to sync sale ${sale.id}`, error);
                            // Continue to next sale, don't block everything
                        }
                    }
                }
            } catch (e) {
                if (e instanceof SessionChangedError) throw e;
                hadErrors = true;
                console.error('Error syncing sales:', e);
            }

            // 2. Download Products (Inventory)
            try {
                // Fetch products for current user's branch if applicable
                if (!(await isCurrentSession())) throw new SessionChangedError('Session changed before inventory sync');
                const branchId = currentUser.branchId || undefined;
                const products = await apiService.getInventory(branchId);

                if (Array.isArray(products)) {
                    if (!(await isCurrentSession())) throw new SessionChangedError('Session changed during inventory sync');
                    await dbService.saveProducts(products);
                    console.log('Inventory synced to local DB');
                }
            } catch (e) {
                if (e instanceof SessionChangedError) throw e;
                hadErrors = true;
                console.error('Error syncing inventory:', e);
            }

            // 3. Download Debts
            try {
                if (!(await isCurrentSession())) throw new SessionChangedError('Session changed before debt sync');
                const branchId = currentUser.branchId || undefined;
                const debts = await request<any[]>(`/debts${branchId ? '?branchId='+encodeURIComponent(branchId) : ''}`);
                if (debts && debts.length > 0) {
                    if (!(await isCurrentSession())) throw new SessionChangedError('Session changed during debt sync');
                    await dbService.saveDebts(debts);
                    console.log(`Debts synced: ${debts.length} records`);
                }
            } catch (e) {
                if (e instanceof SessionChangedError) throw e;
                hadErrors = true;
                console.error('Error syncing debts:', e);
            }

            // 4. Download Patients
            try {
                if (!(await isCurrentSession())) throw new SessionChangedError('Session changed before patient sync');
                const branchId = currentUser.branchId || undefined;
                const patients = await request<any[]>(`/patients${branchId ? '?branchId='+encodeURIComponent(branchId) : ''}`);
                if (patients && patients.length > 0) {
                    if (!(await isCurrentSession())) throw new SessionChangedError('Session changed during patient sync');
                    await dbService.savePatients(patients);
                    console.log(`Patients synced: ${patients.length} records`);
                }
            } catch (e) {
                if (e instanceof SessionChangedError) throw e;
                hadErrors = true;
                console.error('Error syncing patients:', e);
            }

            // 5. Download Loyalty Settings
            try {
                if (!(await isCurrentSession())) throw new SessionChangedError('Session changed before loyalty sync');
                const loyaltySettings = await request<any>('/loyalty');
                if (loyaltySettings) {
                    if (!(await isCurrentSession())) throw new SessionChangedError('Session changed during loyalty sync');
                    await dbService.saveLoyalty(loyaltySettings);
                    console.log('Loyalty settings synced');
                }
            } catch (e) {
                if (e instanceof SessionChangedError) throw e;
                hadErrors = true;
                console.error('Error syncing loyalty settings:', e);
            }

            // 6. Retry pending loyalty earns (queued when offline/failed during sale)
            try {
                if (!(await isCurrentSession())) throw new SessionChangedError('Session changed before loyalty retry sync');
                const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
                const raw = await AsyncStorage.getItem('pendingLoyaltyEarns');
                if (raw) {
                    const queue: { patientId: string; amount: number; ts: number }[] = JSON.parse(raw);
                    const failed: typeof queue = [];
                    for (const earn of queue) {
                        if (!(await isCurrentSession())) throw new SessionChangedError('Session changed during loyalty retry sync');
                        try {
                            await apiService.earnLoyaltyPoints(earn.patientId, null, earn.amount);
                        } catch (error) {
                            if(error instanceof SessionChangedError) throw error;
                            hadErrors = true;
                            failed.push(earn);
                        }
                    }
                    if (!(await isCurrentSession())) throw new SessionChangedError();
                    if (failed.length > 0) await AsyncStorage.setItem('pendingLoyaltyEarns', JSON.stringify(failed));
                    else await AsyncStorage.removeItem('pendingLoyaltyEarns');
                    console.log(`Loyalty earn retry: ${queue.length - failed.length} succeeded, ${failed.length} still pending`);
                }
            } catch (e) {
                if (e instanceof SessionChangedError) throw e;
                hadErrors = true;
                console.error('Error retrying pending loyalty earns:', e);
            }

            if (!(await isCurrentSession())) throw new SessionChangedError();
            if (hadErrors) console.warn('Sync finished with errors');
            else { console.log('Sync completed'); notifySyncDone(); }
        } catch (error) {
            if (error instanceof SessionChangedError) console.log('Sync cancelled: session changed');
            else console.error('Sync failed:', error);
        } finally {
            this.isSyncing = false;
            try { globalCallbacks.onStop?.('sync'); } catch (error) { console.error('Error stopping sync indicator:', error); }
        }
    }
};
