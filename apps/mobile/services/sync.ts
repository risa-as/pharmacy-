import NetInfo from '@react-native-community/netinfo';
import { dbService } from './db';
import { apiService } from './api';
import { authService } from './auth';

interface SyncCallbacks {
    onStart?: (key: string) => void;
    onDone?: (key: string) => void;
}

// Global callbacks — set by SyncContext bridge in app root
let globalCallbacks: SyncCallbacks = {};

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

        // Don't sync if user is not authenticated or token is invalid
        const currentUser = await authService.getCurrentUser();
        const token = await authService.getToken();
        // JWT tokens have 3 base64url parts separated by dots; old tokens don't
        if (!currentUser || !token || token.split('.').length !== 3) {
            console.log('Not authenticated or invalid token: Skipping sync');
            if (currentUser && token && token.split('.').length !== 3) {
                // Clear stale non-JWT token so user is redirected to login cleanly
                await authService.logout();
            }
            return;
        }

        if (!(await this.isOnline())) {
            console.log('Offline: Skipping sync');
            return;
        }

        this.isSyncing = true;
        globalCallbacks.onStart?.('sync');
        console.log('Starting sync...');

        try {
            // 1. Upload Pending Sales
            try {
                const pendingSales = await dbService.getPendingSales();
                if (pendingSales.length > 0) {
                    console.log(`Found ${pendingSales.length} pending sales to sync`);
                    for (const sale of pendingSales) {
                        try {
                            // sale.items is already parsed by getPendingSales
                            await apiService.createSale({
                                items: sale.items,
                                totalAmount: sale.totalAmount
                            });
                            // If successful, delete from local DB
                            await dbService.deleteOfflineSale(sale.id);
                            console.log(`Synced sale ${sale.id}`);
                        } catch (error) {
                            console.error(`Failed to sync sale ${sale.id}`, error);
                            // Continue to next sale, don't block everything
                        }
                    }
                }
            } catch (e) {
                console.error('Error syncing sales:', e);
            }

            // 2. Download Products (Inventory)
            try {
                // Fetch products for current user's branch if applicable
                const user = await authService.getCurrentUser();
                const branchId = user?.branchId || undefined;
                const products = await apiService.getInventory(branchId);

                if (products && products.length > 0) {
                    await dbService.saveProducts(products);
                    console.log('Inventory synced to local DB');
                }
            } catch (e) {
                console.error('Error syncing inventory:', e);
            }

            // 3. Download Debts
            try {
                const user = await authService.getCurrentUser();
                const branchId = user?.branchId || undefined;
                const debts = await apiService.getDebts(branchId);
                if (debts && debts.length > 0) {
                    await dbService.saveDebts(debts);
                    console.log(`Debts synced: ${debts.length} records`);
                }
            } catch (e) {
                console.error('Error syncing debts:', e);
            }

            // 4. Download Patients
            try {
                const user = await authService.getCurrentUser();
                const branchId = user?.branchId || undefined;
                const patients = await apiService.getPatients(branchId);
                if (patients && patients.length > 0) {
                    await dbService.savePatients(patients);
                    console.log(`Patients synced: ${patients.length} records`);
                }
            } catch (e) {
                console.error('Error syncing patients:', e);
            }

            // 5. Download Loyalty Settings
            try {
                const loyaltySettings = await apiService.getLoyaltySettings();
                if (loyaltySettings) {
                    await dbService.saveLoyalty(loyaltySettings);
                    console.log('Loyalty settings synced');
                }
            } catch (e) {
                console.error('Error syncing loyalty settings:', e);
            }

            // 6. Retry pending loyalty earns (queued when offline/failed during sale)
            try {
                const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
                const raw = await AsyncStorage.getItem('pendingLoyaltyEarns');
                if (raw) {
                    const queue: { patientId: string; amount: number; ts: number }[] = JSON.parse(raw);
                    const failed: typeof queue = [];
                    for (const earn of queue) {
                        try {
                            await apiService.earnLoyaltyPoints(earn.patientId, null, earn.amount);
                        } catch {
                            failed.push(earn);
                        }
                    }
                    if (failed.length > 0) await AsyncStorage.setItem('pendingLoyaltyEarns', JSON.stringify(failed));
                    else await AsyncStorage.removeItem('pendingLoyaltyEarns');
                    console.log(`Loyalty earn retry: ${queue.length - failed.length} succeeded, ${failed.length} still pending`);
                }
            } catch (e) {
                console.error('Error retrying pending loyalty earns:', e);
            }

            console.log('Sync completed');
            globalCallbacks.onDone?.('sync');
        } catch (error) {
            console.error('Sync failed:', error);
            globalCallbacks.onDone?.('sync'); // mark done even on error
        } finally {
            this.isSyncing = false;
        }
    }
};
