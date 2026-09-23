import {recordSyncSuccess} from "./sync-success";
import {recordSyncConflicts as recordConflicts} from "./sync-conflicts";
import {validateSnapshotBarcodes} from "./product-snapshot-validation";
import { prisma } from './db';
import { BrowserWindow, app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

import store from './store';
import { buildApiUrl, getApiBaseUrl, getApiCandidates, setApiBaseUrl } from './api-config';
import { storeOfflineToken } from './offline-token';
import { buildIdempotencyKey, buildBatchIdempotencyKey } from './idempotency';
import { changedProductSyncData } from './product-sync-diff';
import { createCoalescedRun } from './sync-coalescer';
import { fetchProductSyncSnapshotWithCache } from './product-sync-cache';
import {
    removeInventoryIdsFromProductSyncMaps,
    setDrugInventoriesInProductSyncMaps,
    upsertBatchInProductSyncMaps,
} from './product-sync-maps';

// SQLite has a max of 999 bind variables per statement. When using `{ in: [...] }`
// or `{ notIn: [...] }` with large arrays, Prisma generates one bind variable per
// element and exceeds this limit (P2029). This helper chunks the array.
const SQLITE_VAR_LIMIT = 900; // leave headroom for other params in the query

async function deleteManyChunked(
    model: any,
    field: string,
    ids: string[],
) {
    for (let i = 0; i < ids.length; i += SQLITE_VAR_LIMIT) {
        const chunk = ids.slice(i, i + SQLITE_VAR_LIMIT);
        await model.deleteMany({ where: { [field]: { in: chunk } } });
    }
}

async function updateManyChunked(
    model: any,
    field: string,
    ids: string[],
    data: any,
) {
    for (let i = 0; i < ids.length; i += SQLITE_VAR_LIMIT) {
        const chunk = ids.slice(i, i + SQLITE_VAR_LIMIT);
        await model.updateMany({ where: { [field]: { in: chunk } }, data });
    }
}

async function findManyByFieldChunked(
    model: any,
    field: string,
    ids: string[],
    options: Record<string, any> = {},
) {
    const rows: any[] = [];
    for (let i = 0; i < ids.length; i += SQLITE_VAR_LIMIT) {
        const chunk = ids.slice(i, i + SQLITE_VAR_LIMIT);
        if (chunk.length === 0) continue;
        rows.push(...await model.findMany({
            ...options,
            where: {
                ...(options.where || {}),
                [field]: { in: chunk },
            },
        }));
    }
    return rows;
}

// Debug log file — written to userData so the user can share it for troubleshooting.
const SYNC_LOG_PATH = path.join(app.getPath('userData'), 'sync-debug.log');
function syncLog(msg: string) {
    const line = `[${new Date().toISOString()}] ${msg}\n`;
    try { fs.appendFileSync(SYNC_LOG_PATH, line); } catch { /* ignore */ }
}

class SyncClientError extends Error {
    constructor(message: string, public status: number, public payload?: any) {
        super(message);
        this.name = 'SyncClientError';
    }
}

/**
 * Builds the device auth headers (HMAC sync token, else device license key)
 * that every cloud request must carry so the server can authenticate + scope it.
 */
function getDeviceAuthHeaders(): Record<string, string> {
    const licenseKey  = store.get('licenseKey')    as string | undefined;
    const branchId    = store.get('branchId')      as string | undefined;
    const syncToken   = store.get('syncToken')     as string | undefined;
    const syncUserId  = store.get('syncUserId')    as string | undefined;
    const syncOrgId   = store.get('syncOrgId')     as string | undefined;
    const syncUserRole = store.get('syncUserRole') as string | undefined;
    const deviceHeaders: Record<string, string> = {};
    if (branchId) deviceHeaders['x-branch-id'] = branchId;
    if (syncToken && syncUserId && branchId && syncOrgId && syncUserRole) {
        // Prefer HMAC sync token (user logged in via cloud)
        deviceHeaders['x-sync-token']  = syncToken;
        deviceHeaders['x-user-id']     = syncUserId;
        deviceHeaders['x-org-id']      = syncOrgId;
        deviceHeaders['x-user-role']   = syncUserRole;
        // Tokens issued before versioning have none stored and verify as version 0.
        const syncSessionVersion = Number(store.get('syncSessionVersion')) || 0;
        if (syncSessionVersion > 0) deviceHeaders['x-session-version'] = String(syncSessionVersion);
    } else if (licenseKey) {
        // Fallback to device license key
        deviceHeaders['x-device-license-key'] = licenseKey;
    }
    return deviceHeaders;
}

/**
 * Enhanced fetch with retry logic and timeout
 */
async function fetchWithRetry(url: string, options: RequestInit = {}, retries = 3, backoff = 1000) {
    // Inject device auth headers automatically
    const deviceHeaders = getDeviceAuthHeaders();

    const mergedOptions: RequestInit = {
        ...options,
        headers: { ...deviceHeaders, ...(options.headers as Record<string, string> || {}) },
    };

    for (let i = 0; i < retries; i++) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

            const response = await fetch(url, {
                ...mergedOptions,
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (response.ok || response.status === 304) return response;

            // If server error (5xx) or Rate Limit (429), retry
            if (response.status >= 500 || response.status === 429) {
                console.log(`[Sync] Server busy (${response.status}). Retry ${i + 1}/${retries} in ${backoff}ms...`);
                await new Promise(r => setTimeout(r, backoff));
                backoff *= 2;
                continue;
            }

            // Permanent Client Error (4xx aside from 429) -> DO NOT RETRY
            let errorMsg = response.statusText;
            try {
                const errBody = await response.json();
                errorMsg = errBody.error || errorMsg;
            } catch (e) {
                errorMsg = await response.text();
            }
            throw new SyncClientError(`Client Error ${response.status}: ${errorMsg}`, response.status);

        } catch (err: any) {
            if (err instanceof SyncClientError) {
                throw err; // Fast-fail Client Errors!
            }
            const isNetworkError = err.name === 'AbortError' || err.message.includes('fetch');
            if (i < retries - 1 && isNetworkError) {
                console.log(`[Sync] Network error. Retry ${i + 1}/${retries} in ${backoff}ms...`);
                await new Promise(r => setTimeout(r, backoff));
                backoff *= 2;
                continue;
            }
            throw err;
        }
    }
    throw new Error(`Failed after ${retries} retries`);
}
// const BRANCH_ID = "3e734b74-c4cf-4e5d-bf4f-6254c1426271"; // REMOVED hardcoded ID

function getBranchId() {
    return store.get('branchId');
}

let isOnline = false;
let wasOffline = true; // tracks previous state to detect reconnection
const runningSyncTasks = new Set<string>();
let syncServiceStarted = false;

export function isSyncRunning() { return runningSyncTasks.size > 0; }

export function getConnectionStatus() {
    return isOnline;
}

function beginSyncTask(taskName: string): boolean {
    if (runningSyncTasks.has(taskName)) {
        console.log(`[SyncLock] Skip '${taskName}' because it is already running.`);
        return false;
    }
    runningSyncTasks.add(taskName);
    return true;
}

function endSyncTask(taskName: string) {
    runningSyncTasks.delete(taskName);
}

async function checkConnection(): Promise<boolean> {
    console.log("[Connection] Starting connectivity check...");
    for (const base of getApiCandidates()) {
        try {
            console.log(`[Connection] Checking candidate: ${base}/health`);
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            const response = await fetch(`${base}/health`, {
                method: 'GET',
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (response.ok) {
                console.log(`[Connection] Success! Connected to ${base}`);
                setApiBaseUrl(base);
                const justReconnected = wasOffline;
                isOnline = true;
                wasOffline = false;
                BrowserWindow.getAllWindows().forEach(win => {
                    win.webContents.send('connection-status', true);
                });
                // Sync settings immediately on reconnection so loyalty/other
                // settings changes made on the web are applied without delay.
                if (justReconnected) {
                    setTimeout(() => void syncSettings(), 500);
                }
                return true;
            } else {
                console.log(`[Connection] Failed. Status: ${response.status} ${response.statusText}`);
            }
        } catch (error: any) {
            console.log(`[Connection] Error connecting to ${base}:`, error.message);
            // Try next candidate
        }
    }

    console.log("[Connection] All candidates failed. Setting Offline.");
    isOnline = false;
    wasOffline = true;
    BrowserWindow.getAllWindows().forEach(win => {
        win.webContents.send('connection-status', false);
    });
    return false;
}

// ... existing imports

export async function pushPatient(patient: any) {
    try {
        if (!isOnline) {
            console.log("[Sync] Offline. Patient created locally but not pushed.");
            return false;
        }

        console.log(`[Sync] Pushing patient ${patient.name} to cloud...`);
        const response = await fetchWithRetry(buildApiUrl('/patients'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patient)
        });

        if (response.ok) {
            console.log("[Sync] Patient pushed successfully.");
            return true;
        } else {
            console.error("[Sync] Failed to push patient:", response.status, response.statusText);
            return false;
        }
    } catch (error) {
        console.error("[Sync] Error pushing patient:", error);
        return false;
    }
}

export async function syncSales() {
    const taskName = "sales";
    if (!beginSyncTask(taskName)) return;

    try {
        // Check if we can connect to the server
        isOnline = await checkConnection();

        if (!isOnline) {
            console.log("[Sync] Server unavailable. Sales sync postponed.");
            return;
        }

        // 1. Get unsynced sales (include patient for credit sales)
        const unsyncedSales = await prisma.sale.findMany({
            where: { synced: false },
            include: { items: true, payment: true, patient: true },
            take: 10
        });

        if (unsyncedSales.length === 0) return;

        console.log(`[Sync] Syncing ${unsyncedSales.length} unsynced sale(s)...`);

        // 2. Push to Cloud
        const branchId = getBranchId();
        if (!branchId) {
            console.log("[Sync] Branch ID missing. Login is required before sync.");
            return;
        }

        // Map sales to include payment and patient data (patient data needed for credit sales)
        const salesPayload = unsyncedSales.map((sale: any) => ({
            id: sale.id,
            total: sale.total,
            discount: sale.discount || 0,
            hasPriceOverride: sale.hasPriceOverride === true,
            createdAt: sale.createdAt,
            userId: sale.userId,
            patientId: sale.patientId,
            paymentMethod: sale.payment?.method || "CASH",
            // Number allocated at sale time (online). Sent so the cloud reuses it
            // instead of assigning a different sequential number.
            invoiceNumber: sale.invoiceNumber ?? null,
            items: sale.items.map((item: any) => ({
                drugId: item.drugId,
                quantity: item.quantity,
                price: item.price,
                originalPrice: item.originalPrice ?? null,
                batchAllocations: item.batchAllocations ?? null,
            })),
            // Include patient snapshot so cloud can upsert before FK check
            patient: sale.patient ? {
                id: sale.patient.id,
                name: sale.patient.name,
                phone: (sale.patient as any).phone ?? null,
                branchId: (sale.patient as any).branchId ?? branchId,
            } : null,
        }));

        const salesIdempotencyKey = buildBatchIdempotencyKey('sync-sales', unsyncedSales.map((s: any) => s.id));

        const response = await fetchWithRetry(buildApiUrl('/sync/sales'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-idempotency-key': salesIdempotencyKey
            },
            body: JSON.stringify({
                branchId: branchId,
                sales: salesPayload
            })
        });

        const result = await response.json() as { syncedIds?: string[]; invoiceNumbers?: Record<string, number>; conflicts?: { id: string; message: string }[] };
        const syncedIds = result.syncedIds;

        // 3. Mark as synced
        if (syncedIds && syncedIds.length > 0) {
            await prisma.sale.updateMany({
                where: { id: { in: syncedIds } },
                data: { synced: true }
            });
        recordSyncSuccess("المبيعات");
            console.log(`[Sync] Sales sync completed. Marked ${syncedIds.length} sale(s) as synced.`);
        }

        for (const conflict of result.conflicts ?? []) {
            const local = unsyncedSales.find((s: any) => s.id === conflict.id);
            if (!local) continue;
            await prisma.$transaction(async (tx: any) => {
                const previous = await tx.syncFailure.findFirst({ where: { entityType: 'SALE', entityId: local.id } });
                if (!previous) await tx.syncFailure.create({ data: { entityType: 'SALE', entityId: local.id, payload: JSON.stringify(local), errorMessage: conflict.message } });
                await tx.sale.update({ where: { id: local.id }, data: { synced: true } });
            });
        }

        // 4. Reconcile invoice numbers: for offline sales the cloud allocated the
        // sequential number — pull it back so the local record matches the web.
        if (result.invoiceNumbers) {
            for (const [saleId, num] of Object.entries(result.invoiceNumbers)) {
                try {
                    await prisma.sale.update({
                        where: { id: saleId },
                        data: { invoiceNumber: String(num) },
                    });
                } catch { /* sale may have been removed locally — ignore */ }
            }
        }

    } catch (error: any) {
        if (error.name === 'SyncClientError') {
            console.error("[Sync DLQ] Permanent Client Error in Sales Sync:", error.message);

            // Re-fetch the sales we tried to push
            const unsyncedSales = await prisma.sale.findMany({
                where: { synced: false },
                include: { items: true, payment: true },
                take: 10
            });

            // Park them in the Dead-Letter Queue
            for (const sale of unsyncedSales) {
                await prisma.syncFailure.create({
                    data: {
                        entityType: "SALE",
                        entityId: sale.id,
                        payload: JSON.stringify(sale),
                        errorMessage: error.message
                    }
                });

                // Mark syned: true so they stop blocking the loop!
                await prisma.sale.update({
                    where: { id: sale.id },
                    data: { synced: true }
                });
            }

            // Notify UI
            store.set('syncFailureFlag', Date.now());
            BrowserWindow.getAllWindows().forEach((win) => {
                win.webContents.send('sync-failure-recorded');
            });
        } else {
            // Silent error in offline mode
            console.log("[Sync] Sales sync paused (offline mode).", error.message);
        }
    } finally {
        endSyncTask(taskName);
    }
}

export async function syncDebtPayments() {
    const taskName = 'debtPayments';
    if (!beginSyncTask(taskName)) return;

    try {
        if (!getConnectionStatus()) return;

        const unsyncedPayments = await prisma.debtPayment.findMany({
            where: { synced: false },
            take: 20
        });

        const branchId = getBranchId();
        if (!branchId) return;

        if (unsyncedPayments.length > 0) {
            console.log(`[Sync] Pushing ${unsyncedPayments.length} debt payments...`);

            const payload = unsyncedPayments.map((p: any) => ({
                id: p.id,
                saleId: p.saleId,
                userId: p.userId ?? null,
                amount: p.amount,
                method: p.method,
                note: p.note,
                createdAt: p.createdAt
            }));

            const debtIdempotencyKey = buildIdempotencyKey('sync-debt', `${branchId}-${Date.now()}`);

            const response = await fetchWithRetry(buildApiUrl('/sync/debt-payments'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-idempotency-key': debtIdempotencyKey
                },
                body: JSON.stringify({
                    branchId,
                    payments: payload
                })
            });

            const result = await response.json() as { syncedIds?: string[]; conflicts?: { id: string; message: string }[] };
            if (result.syncedIds && result.syncedIds.length > 0) {
                await prisma.debtPayment.updateMany({
                    where: { id: { in: result.syncedIds } },
                    data: { synced: true }
                });
        recordSyncSuccess("التحصيل");
                console.log(`[Sync] ${result.syncedIds.length} payments marked as synced.`);
            }

            // Refused payments go to the sync-failures review list (retryable there),
            // so they neither retry forever nor block the next batch of 20.
            for (const conflict of result.conflicts ?? []) {
                const local = unsyncedPayments.find((p: any) => p.id === conflict.id);
                if (!local) continue;
                await prisma.$transaction(async (tx: any) => {
                    const previous = await tx.syncFailure.findFirst({ where: { entityType: 'DEBT_PAYMENT', entityId: local.id } });
                    if (!previous) await tx.syncFailure.create({ data: { entityType: 'DEBT_PAYMENT', entityId: local.id, payload: JSON.stringify(local), errorMessage: conflict.message } });
                    await tx.debtPayment.update({ where: { id: local.id }, data: { synced: true } });
                });
            }
        }

        // ====== PULL PHASE ======
        console.log(`[Sync] Pulling debt payments from cloud...`);
        const responsePull = await fetchWithRetry(buildApiUrl(`/sync/debt-payments?branchId=${branchId}`));
        if (responsePull.ok) {
            const data = await responsePull.json() as { payments: any[] };
            const payments = data.payments || [];

            let pulled = 0;
            for (const payment of payments) {
                try {
                    await prisma.$transaction(async (tx: any) => {
                        const existing = await tx.debtPayment.findUnique({ where: { id: payment.id } });
                        if (existing) return;

                        // Verify the referenced sale exists locally (FK guard)
                        const localSale = await tx.sale.findUnique({ where: { id: payment.saleId }, select: { id: true } });
                        if (!localSale) return; // Sale not synced locally yet — skip

                        await tx.debtPayment.create({
                            data: {
                                id: payment.id,
                                saleId: payment.saleId,
                                amount: payment.amount,
                                method: payment.method,
                                note: payment.note,
                                createdAt: new Date(payment.createdAt),
                                synced: true,
                            },
                        });

                        // Decrement patient balance — never go below 0
                        if (payment.patientId) {
                            const patient = await tx.patient.findUnique({
                                where: { id: payment.patientId },
                                select: { balance: true },
                            });
                            if (patient) {
                                await tx.patient.update({
                                    where: { id: payment.patientId },
                                    data: { balance: Math.max(0, patient.balance - payment.amount) },
                                });
                            }
                        }
                    });
                    pulled++;
                } catch (pullErr: any) {
                    console.warn(`[Sync] Skipping cloud payment ${payment.id}: ${pullErr.message}`);
                }
            }

            if (pulled > 0) {
                console.log(`[Sync] Pulled ${pulled} new debt payment(s) from cloud.`);
            }
        } else {
            console.error(`[Sync] Failed to pull debt payments: HTTP ${responsePull.status}`);
        }

    } catch (error: any) {
        if (error.name === 'SyncClientError') {
            console.error("[Sync DLQ] Permanent Client Error in Debt Sync:", error.message);
            const unsyncedPayments = await prisma.debtPayment.findMany({ where: { synced: false }, take: 20 });

            for (const p of unsyncedPayments) {
                await prisma.syncFailure.create({
                    data: {
                        entityType: "DEBT_PAYMENT",
                        entityId: p.id,
                        payload: JSON.stringify(p),
                        errorMessage: error.message
                    }
                });
                await prisma.debtPayment.update({ where: { id: p.id }, data: { synced: true } });
            }
            BrowsersNotifyFailure();
        } else {
            console.error("[Sync] Error syncing debt payments:", error.message);
        }
    } finally {
        endSyncTask(taskName);
    }
}

function BrowsersNotifyFailure() {
    store.set('syncFailureFlag', Date.now());
    BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send('sync-failure-recorded');
    });
}

export interface SaleReturnCloudPayload {
    id: string;
    saleId: string;
    branchId: string;
    safeId?: string | null;
    userId?: string | null;
    total: number;
    createdAt: string;
    notes?: string | null;
    items: Array<{ drugId: string; quantity: number; price: number }>;
}

/**
 * Commit one desktop return on the server before changing local cash/stock.
 * The sync endpoint re-checks sold and already-returned quantities under the
 * sale lock, so another device cannot win the same quantity concurrently.
 */
export async function pushSaleReturnToCloud(payload: SaleReturnCloudPayload) {
    const response = await fetchWithRetry(buildApiUrl('/sync/returns'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branchId: payload.branchId, returns: [{ ...payload, refundVersion: 2 }] }),
    });
    const result = await response.json() as {
        records?: Array<{ id: string; total: number; items: Array<{ drugId: string; quantity: number; price: number; stockStatus: string; batchAllocations: string | null }> }>;
        syncedIds?: string[];
        conflicts?: Array<{ id: string; message?: string }>;
    };
    const conflict = result.conflicts?.find(item => item.id === payload.id);
    if (conflict) return { success: false, error: conflict.message || 'تعارض في كمية الإرجاع.' };
    if (!result.syncedIds?.includes(payload.id)) {
        return { success: false, error: 'لم يؤكد الخادم تسجيل المرتجع.' };
    }
    const record = result.records?.find(r => r.id === payload.id);
    if (!record) return { success: false, error: 'يلزم تحديث الخادم لاستلام تفاصيل المرتجع المعتمدة. لا تعاود الدفع؛ أعد المحاولة بنفس العملية.' };
    return { success: true, record };
}

export async function syncSaleReturns() {
    const taskName = "saleReturns";
    if (!beginSyncTask(taskName)) return;

    try {
        isOnline = await checkConnection();
        if (!isOnline) {
            console.log("[Sync] Server unavailable. Sale returns sync postponed.");
            return;
        }

        const unsyncedReturns = await prisma.saleReturn.findMany({
            where: { synced: false },
            include: { items: true },
            take: 10
        });

        if (unsyncedReturns.length === 0) return;

        console.log(`[Sync] Syncing ${unsyncedReturns.length} unsynced sale return(s)...`);

        const branchId = getBranchId();
        if (!branchId) {
            console.log("[Sync] Branch ID missing. Login is required before sync.");
            return;
        }

        const returnsPayload = unsyncedReturns.map((ret: any) => ({
            id: ret.id,
            saleId: ret.saleId,
            safeId: ret.safeId,
            userId: ret.userId ?? null,
            total: ret.total,
            createdAt: ret.createdAt,
            notes: ret.notes,
            items: ret.items.map((item: any) => ({
                drugId: item.drugId,
                quantity: item.quantity,
                price: item.price
            }))
        }));

        const response = await fetchWithRetry(buildApiUrl('/sync/returns'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ branchId, returns: returnsPayload })
        });

        const result = await response.json() as {
            syncedIds?: string[];
            conflicts?: Array<{ id: string; message?: string }>;
        };
        const syncedIds = result.syncedIds;

        if (syncedIds && syncedIds.length > 0) {
            await prisma.saleReturn.updateMany({
                where: { id: { in: syncedIds } },
                data: { synced: true }
            });
        recordSyncSuccess("المرتجعات");
            console.log(`[Sync] Sale returns sync completed. Marked ${syncedIds.length} return(s) as synced.`);
        }

        // A conflict means another device already returned the available
        // quantity. Park it in the desktop review queue instead of retrying
        // the same rejected return forever.
        const conflicts = result.conflicts ?? [];
        for (const conflict of conflicts) {
            const localReturn = unsyncedReturns.find((ret: any) => ret.id === conflict.id);
            if (!localReturn) continue;
            await prisma.syncFailure.create({
                data: {
                    entityType: 'SALE_RETURN',
                    entityId: localReturn.id,
                    payload: JSON.stringify(localReturn),
                    errorMessage: conflict.message || 'تعارض في كمية الإرجاع: تم إرجاع الكمية من جهاز آخر.',
                },
            });
            // Stop the automatic retry loop; the original local return remains
            // available in the failure queue for an explicit review/retry.
            await prisma.saleReturn.update({ where: { id: localReturn.id }, data: { synced: true } });
        }
        if (conflicts.length > 0) {
            BrowsersNotifyFailure();
            console.warn(`[Sync] ${conflicts.length} sale return(s) require review due to server conflicts.`);
        }

    } catch (error: any) {
        if (error.name === 'SyncClientError') {
            console.error("[Sync DLQ] Permanent Client Error in Sale Returns Sync:", error.message);
        } else {
            console.log("[Sync] Sale returns sync paused (offline mode).", error.message);
        }
    } finally {
        endSyncTask(taskName);
    }
}

// Start Sync Interval
export function startSyncService() {
    if (syncServiceStarted) {
        console.log("[Sync] startSyncService was already initialized. Skipping duplicate startup.");
        return;
    }
    syncServiceStarted = true;

    console.log("--- Starting Sync Service ---");

    // Warmup syncs on startup
    setTimeout(syncCurrentBranch, 1000); // Verify branch first!
    setTimeout(syncSettings, 3000); // Sync settings very early
    setTimeout(syncSuppliers, 4000); // Sync suppliers before products (FK dependency)
    setTimeout(syncProducts, 5000); // Sync products early
    setTimeout(syncPatients, 8000); // Sync patients
    setTimeout(syncUsers, 10000); // Sync users
    setTimeout(syncSales, 15000);
    setTimeout(syncSaleReturns, 17000); // Sync returns after sales
    setTimeout(syncLoyalty, 20000); // Sync loyalty
    setTimeout(syncDebtPayments, 25000); // Sync debt payments
    setTimeout(syncTransfers, 30000); // Sync transfers

    // Regular background intervals
    setInterval(syncCurrentBranch, 60 * 60 * 1000); // Check branch details hourly
    setInterval(syncSales, 2 * 60 * 1000);
    setInterval(syncSaleReturns, 2 * 60 * 1000); // Every 2 mins
    setInterval(syncSuppliers, 15 * 60 * 1000); // Sync suppliers every 15 mins
    setInterval(syncProducts, 5 * 60 * 1000); // Sync products every 5 mins
    setInterval(syncUsers, 5 * 60 * 1000); // Every 5 mins
    setInterval(syncPatients, 2 * 60 * 1000); // Every 2 mins
    setInterval(syncSettings, 2 * 60 * 1000); // Every 2 mins
    setInterval(syncDebtPayments, 2 * 60 * 1000); // Every 2 mins
    setInterval(syncLoyalty, 2 * 60 * 1000); // Every 2 mins
    setInterval(syncShifts, 5 * 60 * 1000); // Every 5 mins
    setInterval(syncTransactions, 5 * 60 * 1000); // Every 5 mins
    setInterval(syncTransfers, 10 * 60 * 1000); // Every 10 mins

    // Refresh offline subscription JWT once on startup, then every 6 hours
    setTimeout(() => void refreshOfflineToken(), 20000);
    setInterval(() => void refreshOfflineToken(), 6 * 60 * 60 * 1000);
}

/**
 * Fetches a fresh offline JWT from the server and persists it locally.
 * Should be called after any successful online check-in so the desktop
 * can verify subscription state without a network connection.
 */
export async function refreshOfflineToken(): Promise<void> {
    const branchId = getBranchId();
    const licenseKey = store.get('licenseKey') as string | undefined;
    if (!branchId || !licenseKey) return;

    try {
        const url = buildApiUrl(`/sync/offline-token?branchId=${encodeURIComponent(branchId)}&licenseKey=${encodeURIComponent(licenseKey)}`);
        const response = await fetch(url, { method: 'GET' });
        if (!response.ok) {
            // 503 = the license IS valid (it passed the server's license check) but
            // token signing isn't configured server-side. Treat the reachable, valid
            // license as a successful check-in so the desktop isn't wrongly locked
            // out later for "couldn't verify". Only a genuinely invalid/revoked
            // license (403) leaves lastSeenAt stale and eventually locks.
            if (response.status === 503) {
                store.set('lastSeenAt', new Date().toISOString());
                console.warn('[OfflineToken] Server cannot sign tokens (503) but license is valid — stamped check-in.');
            } else {
                console.warn('[OfflineToken] Server returned', response.status, '— skipping token refresh.');
            }
            return;
        }
        const data = await response.json() as { token?: string };
        if (data.token) {
            storeOfflineToken(data.token);
            // Update lastSeenAt for clock-rollback reference
            store.set('lastSeenAt', new Date().toISOString());
            console.log('[OfflineToken] Offline token refreshed successfully.');
        }
    } catch (err) {
        console.warn('[OfflineToken] Could not refresh offline token:', err);
    }
}

// Sync Transfers from Cloud
export async function syncTransfers() {
    const taskName = "transfers";
    if (!beginSyncTask(taskName)) return;

    try {
        if (!await checkConnection()) return;

        const branchId = getBranchId();
        if (!branchId) return;

        console.log(`[Sync] Pulling transfers for branch: ${branchId}...`);

        const response = await fetchWithRetry(
            buildApiUrl(`/inventory/transfers/sync?branchId=${branchId}`)
        );

        if (!response.ok) {
            console.error(`[Sync] Failed to fetch transfers: ${response.status}`);
            return;
        }

        const data = await response.json() as {
            transfers: Array<{
                id: string;
                fromBranchId: string;
                toBranchId: string;
                status: string;
                notes: string;
                createdAt: string;
                fromBranch: { name: string };
                toBranch: { name: string };
                items: Array<{
                    id: string;
                    drugId: string;
                    batchNumber: string;
                    expiryDate: string;
                    quantity: number;
                    costPrice: number;
                    drug: { tradeName: string; barcode: string };
                }>;
            }>;
        };

        const transfers = data.transfers || [];
        if (transfers.length === 0) {
            console.log('[Sync] No transfers to process.');
            return;
        }

        console.log(`[Sync] Retrieved ${transfers.length} transfer(s) from cloud.`);

        // Store transfers locally using the store (electron-store)
        const existingTransfers = store.get('transfers', []) as any[];
        const existingIds = new Set(existingTransfers.map((t: any) => t.id));

        let newCount = 0;
        for (const transfer of transfers) {
            if (!existingIds.has(transfer.id)) {
                existingTransfers.push(transfer);
                existingIds.add(transfer.id);
                newCount++;
            } else {
                // Update existing transfer status
                const idx = existingTransfers.findIndex((t: any) => t.id === transfer.id);
                if (idx >= 0) {
                    existingTransfers[idx] = transfer;
                }
            }
        }

        store.set('transfers', existingTransfers);

        if (newCount > 0) {
            console.log(`[Sync] ${newCount} new transfer(s) synced from cloud.`);
            // Notify UI about new transfers
            BrowserWindow.getAllWindows().forEach(win => {
                win.webContents.send('transfers-updated', { count: newCount });
            });
        }

    } catch (error: any) {
        console.error("[Sync] Error syncing transfers:", error.message);
    } finally {
        endSyncTask(taskName);
    }
}

export async function syncShifts() {
    const taskName = "shifts";
    if (!beginSyncTask(taskName)) return;

    try {
        isOnline = await checkConnection();
        if (!isOnline) {
            console.log("[Sync] Server unavailable. Shifts sync postponed.");
            return;
        }

        const unsyncedShifts = await prisma.shift.findMany({
            // @ts-ignore
            where: { synced: false },
            take: 20
        });

        if (unsyncedShifts.length === 0) return;

        console.log(`[Sync] Syncing ${unsyncedShifts.length} unsynced shift(s)...`);

        const branchId = getBranchId();
        if (!branchId) return;

        // Attach a user snapshot (email/name) to each shift so the cloud can
        // resolve the correct cloud user ID when the local user ID diverges from
        // the cloud one. This happens when the same email was created on both
        // sides — desktop keeps its local ID, so shift.userId won't exist in the
        // cloud and the FK on Shift.userId would otherwise fail the whole sync.
        const shiftUserIds = [...new Set(unsyncedShifts.map((s: any) => s.userId))];
        const shiftUsers = await prisma.user.findMany({
            where: { id: { in: shiftUserIds } },
            select: { id: true, email: true, name: true },
        });
        const shiftUserMap = new Map<string, { id: string; email: string | null; name: string | null }>(
            shiftUsers.map((u: any) => [u.id, u])
        );
        const shiftsPayload = unsyncedShifts.map((s: any) => ({
            ...s,
            userEmail: shiftUserMap.get(s.userId)?.email ?? null,
            userName: shiftUserMap.get(s.userId)?.name ?? null,
        }));

        const shiftsIdempotencyKey = buildIdempotencyKey('sync-shifts', `${branchId}-${Date.now()}`);

        const response = await fetchWithRetry(buildApiUrl('/sync/shifts'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-idempotency-key': shiftsIdempotencyKey
            },
            body: JSON.stringify({
                branchId: branchId,
                shifts: shiftsPayload
            })
        });

        const result = await response.json() as { syncedIds?: string[]; conflicts?: { id: string; message: string }[] };
        const syncedIds = result.syncedIds;
        await recordConflicts(prisma, 'SHIFT', unsyncedShifts, result.conflicts, (tx, id) => tx.shift.update({ where: { id }, data: { synced: true } }));

        if (syncedIds && syncedIds.length > 0) {
            await prisma.shift.updateMany({
                where: { id: { in: syncedIds } },
                // @ts-ignore
                data: { synced: true }
            });
            console.log(`[Sync] Shifts sync completed. Marked ${syncedIds.length} shift(s) as synced.`);
        }
    } catch (error: any) {
        if (error.name === 'SyncClientError') {
            console.error("[Sync DLQ] Permanent Client Error in Shifts Sync:", error.message);
        } else {
            console.error("[Sync] Error syncing shifts:", error.message);
        }
    } finally {
        endSyncTask(taskName);
    }
}

export async function syncTransactions() {
    const taskName = "transactions";
    if (!beginSyncTask(taskName)) return;

    try {
        isOnline = await checkConnection();
        if (!isOnline) {
            console.log("[Sync] Server unavailable. Transactions sync postponed.");
            return;
        }

        // @ts-ignore
        const unsyncedTxns = await prisma.transaction.findMany({
            where: { synced: false },
            take: 20
        });

        if (unsyncedTxns.length === 0) return;

        console.log(`[Sync] Syncing ${unsyncedTxns.length} unsynced transaction(s)...`);

        const branchId = getBranchId();
        if (!branchId) return;

        const txnsIdempotencyKey = buildIdempotencyKey('sync-transactions', `${branchId}-${Date.now()}`);

        const response = await fetchWithRetry(buildApiUrl('/sync/transactions'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-idempotency-key': txnsIdempotencyKey
            },
            body: JSON.stringify({
                branchId: branchId,
                transactions: unsyncedTxns
            })
        });

        const result = await response.json() as { syncedIds?: string[]; conflicts?: { id: string; message: string }[] };
        const syncedIds = result.syncedIds;
        await recordConflicts(prisma, 'TRANSACTION', unsyncedTxns, result.conflicts, (tx, id) => tx.transaction.update({ where: { id }, data: { synced: true } }));

        if (syncedIds && syncedIds.length > 0) {
            // @ts-ignore
            await prisma.transaction.updateMany({
                where: { id: { in: syncedIds } },
                data: { synced: true }
            });
            console.log(`[Sync] Transactions sync completed. Marked ${syncedIds.length} transaction(s) as synced.`);
        }
    } catch (error: any) {
        if (error.name === 'SyncClientError') {
            console.error("[Sync DLQ] Permanent Client Error in Transactions Sync:", error.message);
        } else {
            console.error("[Sync] Error syncing transactions:", error.message);
        }
    } finally {
        endSyncTask(taskName);
    }
}

export async function syncCurrentBranch() {
    const taskName = 'currentBranch';
    if (!beginSyncTask(taskName)) return;

    try {
        if (!await checkConnection()) return;

        const branchId = getBranchId();
        if (!branchId) {
            console.log("[Sync] No branch ID configured locally yet.");
            return;
        }

        console.log(`[Sync] Verifying local branch record for ID: ${branchId}...`);

        // Fetch branches from API (pass branchId so server can resolve org without session)
        const response = await fetchWithRetry(buildApiUrl(`/branches?branchId=${encodeURIComponent(branchId)}`));
        if (!response.ok) throw new Error("Failed to fetch branches");

        const branches = await response.json();
        // The API returns { id, name } objects
        const myBranch = branches.find((b: any) => b.id === branchId);

        if (myBranch) {
            await prisma.branch.upsert({
                where: { id: myBranch.id },
                update: {
                    name: myBranch.name,
                },
                create: {
                    id: myBranch.id,
                    name: myBranch.name
                }
            });
            console.log(`[Sync] Branch verified/updated: ${myBranch.name}`);
        } else {
            console.warn(`[Sync] Branch ID ${branchId} not found in server response.`);
        }
    } catch (e) {
        console.error("[Sync] Error syncing branch:", e);
    } finally {
        endSyncTask(taskName);
    }
}

// ... existing code ...

export async function syncLoyalty() {
    const taskName = "loyalty";
    if (!beginSyncTask(taskName)) return;

    try {
        if (!await checkConnection()) return;

        const unsyncedTx = await prisma.loyaltyTransaction.findMany({
            where: { synced: false },
            include: { account: true }
        });

        if (unsyncedTx.length === 0) return;

        console.log(`[Sync] Syncing ${unsyncedTx.length} loyalty transaction(s)...`);

        const branchId = getBranchId();
        if (!branchId) return;

        const payload = unsyncedTx.map((tx: any) => ({
            id: tx.id,
            patientId: tx.account.patientId,
            type: tx.type,
            points: tx.points,
            description: tx.description,
            saleId: tx.saleId,
            createdAt: tx.createdAt
        }));

        const response = await fetchWithRetry(buildApiUrl('/sync/loyalty'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                branchId: branchId,
                transactions: payload
            })
        });

        if (!response.ok) throw new Error("Loyalty sync failed");

        const result = await response.json();
        const syncedIds = result.syncedIds as string[];
        await recordConflicts(prisma, 'LOYALTY', unsyncedTx.map(({ account, ...tx }: any) => tx), result.conflicts, (tx, id) => tx.loyaltyTransaction.update({ where: { id }, data: { synced: true } }));
        const accountBalances = result.accountBalances as {
            patientId: string;
            totalPoints: number;
            lifetimePoints: number;
            tier: string;
        }[] | undefined;

        if (syncedIds && syncedIds.length > 0) {
            await prisma.loyaltyTransaction.updateMany({
                where: { id: { in: syncedIds } },
                data: { synced: true }
            });
            console.log(`[Sync] Loyalty sync completed. Marked ${syncedIds.length} transaction(s) as synced.`);
        }

        // Reconcile local account balances with the authoritative web values.
        // This corrects any drift caused by web-originated transactions that
        // never sync back to the desktop.
        if (accountBalances && accountBalances.length > 0) {
            for (const wb of accountBalances) {
                const localAccount = await prisma.loyaltyAccount.findUnique({
                    where: { patientId: wb.patientId }
                });
                if (localAccount) {
                    await prisma.loyaltyAccount.update({
                        where: { patientId: wb.patientId },
                        data: {
                            totalPoints: wb.totalPoints,
                            lifetimePoints: wb.lifetimePoints,
                            tier: wb.tier,
                        }
                    });
                }
            }
            console.log(`[Sync] Reconciled ${accountBalances.length} loyalty account(s) from web.`);
        }

    } catch (error) {
        console.error("[Sync] Loyalty sync error:", error);
    } finally {
        endSyncTask(taskName);
    }
}
export async function syncSuppliers() {
    const taskName = "suppliers";
    if (!beginSyncTask(taskName)) return;
    try {
        if (!await checkConnection()) return;
        const branchId = getBranchId();
        if (!branchId) return;
        console.log('[Sync] Syncing suppliers list...');
        // Tag every synced supplier with the current organization. The cloud
        // endpoint already scopes by branch, so all returned suppliers belong to
        // this org. The tag lets get-local-suppliers filter out suppliers left
        // over from a different organization that previously used this machine.
        const orgId = (store.get('syncOrgId') as string) || null;
        const response = await fetchWithRetry(buildApiUrl(`/suppliers?branchId=${encodeURIComponent(branchId)}`));
        if (!response.ok) throw new Error('Suppliers fetch failed');
        const suppliers = await response.json() as Array<{ id: string; name: string; phone?: string }>;
        if (Array.isArray(suppliers)) {
            for (const s of suppliers) {
                await prisma.supplier.upsert({
                    where: { id: s.id },
                    update: { name: s.name, phone: s.phone ?? null, organizationId: orgId },
                    create: { id: s.id, name: s.name, phone: s.phone ?? null, organizationId: orgId },
                });
            }
            console.log(`[Sync] Suppliers synced: ${suppliers.length} records (org ${orgId ?? 'n/a'})`);
        }
    } catch (err) {
        console.error('[Sync] Supplier sync failed:', err);
    } finally {
        endSyncTask(taskName);
    }
}

export type SyncProductsResult = {
    success: boolean;
    reason?: string;
    count?: number;
};

export const syncProducts = createCoalescedRun<SyncProductsResult>(
    syncProductsExclusive,
    {
        timeoutMs: 60_000,
        timeoutResult: { success: false, reason: 'lock_timeout' },
        onJoin: () => console.log('[Sync] Product sync already running — joining current snapshot sync.'),
        onTimeout: () => console.warn('[Sync] Product sync wait timed out after 60 s'),
    },
);

async function syncProductsExclusive(): Promise<SyncProductsResult> {
    const taskName = "products";

    if (!beginSyncTask(taskName)) {
        return { success: false, reason: 'lock_contention' };
    }

    try {
        if (!await checkConnection()) {
            return { success: false, reason: 'offline' };
        }

        const branchId = String(getBranchId() || '').trim();
        if (!branchId) {
            return { success: false, reason: 'no_branch_id' };
        }

        console.log(`[Sync] Starting product snapshot sync for branch: ${branchId}`);

        const snapshotResult = await fetchProductSyncSnapshotWithCache(
            {
                apiBaseUrl: getApiBaseUrl(),
                branchId,
                authHeaders: getDeviceAuthHeaders(),
            },
            (conditionalHeaders) => fetchWithRetry(buildApiUrl(`/sync/products?branchId=${branchId}`), {
                headers: conditionalHeaders,
            }),
        );
        if (snapshotResult.fromCache) {
            console.log(`[Sync] Product snapshot unchanged by ETag; reapplying cached snapshot for branch: ${branchId}`);
        }

        const data = snapshotResult.snapshot as {
            drugs?: Array<{
                id: string;
                inventoryId?: string;
                barcode: string;
                tradeName: string;
                scientificName: string;
                price?: number;
                costPrice?: number;
                purchasePrice?: number;
                buyPrice?: number;
                isQuickSale?: boolean;
                /**
                 * ميزة وحدة التسعير. التمييز بين undefined وnull مقصود:
                 * undefined = خادم أقدم لا يرسل الحقل فتُترك القيمة المحلية،
                 * null = الخادم يقول صراحةً إنها غير معروفة فتُمسح.
                 */
                unitsPerPack?: number | null;
                unitsPerPackConfirmedAt?: string | null;
                stock?: number;
                minStock?: number;
                maxStock?: number;
                batches?: Array<{
                    id: string;
                    batchNumber: string;
                    quantity: number;
                    expiryDate: string;
                    costPrice: number;
                }>;
            }>;
        };

        const drugs = Array.isArray(data?.drugs) ? data.drugs : [];
        validateSnapshotBarcodes(drugs);

        // Safety guard: empty response from cloud should not wipe local inventory.
        // This protects against transient server errors returning an empty snapshot.
        if (drugs.length === 0) {
            console.log('[Sync] Cloud returned 0 products — skipping local inventory deletion to prevent data loss.');
            return { success: true, reason: 'empty_cloud', count: 0 };
        }

        const fetchedDrugIds: string[] = [];
        const fetchedInventoryIds: string[] = [];
        const hasCompleteInventoryIds =
            drugs.every((drug) => String(drug?.inventoryId || '').trim().length > 0);
        const snapshotDrugIds = Array.from(new Set(
            drugs
                .map((drug) => String(drug?.id || '').trim())
                .filter(Boolean),
        ));
        const snapshotBarcodes = Array.from(new Set(
            drugs
                .map((drug) => String(drug?.barcode ?? `NOBARCODE_${drug?.id || ''}`))
                .filter(Boolean),
        ));

        // Use generous timeout — large inventories (hundreds of drugs+batches)
        // can exceed Prisma's 5s default.
        await prisma.$transaction(async (tx: any) => {
            const drugSelect = {
                id: true,
                barcode: true,
                tradeName: true,
                scientificName: true,
                price: true,
                isActive: true,
                isQuickSale: true,
                unitsPerPack: true,
                unitsPerPackConfirmedAt: true,
            };
            const drugsById = new Map<string, any>();
            const drugsByBarcode = new Map<string, any>();
            const prefetchedDrugsById = await findManyByFieldChunked(
                tx.globalDrug,
                'id',
                snapshotDrugIds,
                { select: drugSelect },
            );
            const prefetchedDrugsByBarcode = await findManyByFieldChunked(
                tx.globalDrug,
                'barcode',
                snapshotBarcodes,
                { select: drugSelect },
            );
            for (const row of [...prefetchedDrugsById, ...prefetchedDrugsByBarcode]) {
                drugsById.set(row.id, row);
                drugsByBarcode.set(row.barcode, row);
            }
            const prefetchedInventories = await findManyByFieldChunked(
                tx.inventory,
                'drugId',
                snapshotDrugIds,
                {
                    where: { branchId },
                    select: {
                        id: true,
                        branchId: true,
                        drugId: true,
                        quantity: true,
                        costPrice: true,
                        minStock: true,
                        maxStock: true,
                        syncPending: true,
                    },
                },
            );
            const inventoriesByDrugId = new Map<string, any[]>();
            for (const inventory of prefetchedInventories) {
                const rows = inventoriesByDrugId.get(inventory.drugId) || [];
                rows.push(inventory);
                inventoriesByDrugId.set(inventory.drugId, rows);
            }
            const prefetchedInventoryIds = prefetchedInventories.map((row: any) => row.id);
            const prefetchedBatches = prefetchedInventoryIds.length > 0
                ? await findManyByFieldChunked(
                    tx.batch,
                    'inventoryId',
                    prefetchedInventoryIds,
                    {
                        select: {
                            id: true,
                            inventoryId: true,
                            batchNumber: true,
                            quantity: true,
                            expiryDate: true,
                            costPrice: true,
                        }
                    },
                )
                : [];
            const batchesByInventoryId = new Map<string, any[]>();
            const batchesById = new Map<string, any>();
            for (const batch of prefetchedBatches) {
                const rows = batchesByInventoryId.get(batch.inventoryId) || [];
                rows.push(batch);
                batchesByInventoryId.set(batch.inventoryId, rows);
                batchesById.set(batch.id, batch);
            }

            for (const drug of drugs) {
                if (!drug?.id) continue;
              try {
                // Guard against null/undefined on required String fields —
                // Prisma rejects null for non-optional columns (Invalid invocation).
                const safeBarcode = String(drug.barcode ?? `NOBARCODE_${drug.id}`);
                const safeTradeName = String(drug.tradeName ?? 'Unknown');
                const safeScientificName = String(drug.scientificName ?? '');

                const cloudInventoryId = String(drug.inventoryId || '').trim();
                fetchedDrugIds.push(drug.id);
                if (cloudInventoryId) {
                    fetchedInventoryIds.push(cloudInventoryId);
                }

                const collisionCandidate = drugsByBarcode.get(safeBarcode);
                const collision = collisionCandidate?.id !== drug.id ? collisionCandidate : null;

                if (collision) {
                    console.log(`[Sync] Barcode collision '${safeBarcode}'. Replacing local ID ${collision.id} with cloud ID ${drug.id}.`);
                    const collisionInventories = await tx.inventory.findMany({
                        where: { drugId: collision.id },
                        select: { id: true }
                    });
                    const collisionInventoryIds = collisionInventories.map((row: any) => row.id);
                    if (collisionInventoryIds.length > 0) {
                        await tx.batch.deleteMany({
                            where: { inventoryId: { in: collisionInventoryIds } }
                        });
                        await tx.inventory.deleteMany({
                            where: { id: { in: collisionInventoryIds } }
                        });
                        removeInventoryIdsFromProductSyncMaps(
                            { inventoriesByDrugId, batchesByInventoryId, batchesById },
                            collisionInventoryIds,
                        );
                    }
                    await tx.globalDrug.update({
                        where: { id: collision.id },
                        data: { barcode: `__REPLACED_${collision.id}`, isActive: false }
                    });
                    drugsByBarcode.delete(safeBarcode);
                    drugsById.set(collision.id, {
                        ...collision,
                        barcode: `__REPLACED_${collision.id}`,
                        isActive: false,
                    });
                }

                // ميزة وحدة التسعير: التعبئة تُسحب من السحابة ليعرف الجهاز أوفلاين
                // أُعُدّت أشرطة هذا الدواء أم لا. غياب الحقل في الرد (خادم أقدم) يُبقي
                // القيمة المحلية كما هي بدل أن يمسحها — undefined في Prisma يعني «لا تغيّر»،
                // وهذا مقصود: تأكيد وصل سابقاً لا يُفقَد بمزامنة مع نسخة لا ترسله.
                const cloudUnits =
                    Number.isInteger(Number(drug.unitsPerPack)) && Number(drug.unitsPerPack) > 0
                        ? Number(drug.unitsPerPack)
                        : drug.unitsPerPack === null
                            ? null
                            : undefined;
                const cloudUnitsConfirmedAt =
                    drug.unitsPerPackConfirmedAt === undefined
                        ? undefined
                        : drug.unitsPerPackConfirmedAt
                            ? new Date(drug.unitsPerPackConfirmedAt)
                            : null;

                const desiredDrugData = {
                    barcode: safeBarcode,
                    tradeName: safeTradeName,
                    scientificName: safeScientificName,
                    price: Number(drug.price || 0),
                    isActive: true,
                    isQuickSale: drug.isQuickSale ?? false,
                    unitsPerPack: cloudUnits,
                    unitsPerPackConfirmedAt: cloudUnitsConfirmedAt,
                };
                const desiredNewDrugData = {
                    ...desiredDrugData,
                    unitsPerPack: cloudUnits ?? null,
                    unitsPerPackConfirmedAt: cloudUnitsConfirmedAt ?? null,
                };
                const existingDrug = drugsById.get(drug.id) || null;

                if (existingDrug) {
                    const drugChanges = changedProductSyncData(existingDrug, desiredDrugData);
                    if (Object.keys(drugChanges).length > 0) {
                        await tx.globalDrug.update({
                            where: { id: drug.id },
                            data: drugChanges,
                        });
                        const updatedDrug = { ...existingDrug, ...drugChanges };
                        drugsById.set(drug.id, updatedDrug);
                        drugsByBarcode.delete(existingDrug.barcode);
                        drugsByBarcode.set(updatedDrug.barcode, updatedDrug);
                    }
                } else {
                    await tx.globalDrug.create({
                        data: {
                            id: drug.id,
                            ...desiredNewDrugData,
                        }
                    });
                    const createdDrug = { id: drug.id, ...desiredNewDrugData };
                    drugsById.set(drug.id, createdDrug);
                    drugsByBarcode.set(createdDrug.barcode, createdDrug);
                }

                const branchInventories = inventoriesByDrugId.get(drug.id) || [];

                const cloudCost = Number(
                    (drug.costPrice && drug.costPrice > 0)
                        ? drug.costPrice
                        : (drug.purchasePrice && drug.purchasePrice > 0)
                            ? drug.purchasePrice
                            : (drug.buyPrice && drug.buyPrice > 0)
                                ? drug.buyPrice
                                : 0
                );

                // Prefer the record whose ID matches the cloud ID; fall back to first local record.
                // This prevents creating duplicate inventory records when IDs diverge
                // (e.g. item created on desktop then re-created on web with a different UUID).
                const existingByCloudId = branchInventories.find((row: any) => row.id === cloudInventoryId);
                const existingInventory = existingByCloudId || branchInventories[0] || null;

                // If the local record has unsaved edits (syncPending=true), the user has
                // changed costPrice/minStock/maxStock on desktop but those changes haven't
                // reached the cloud yet. Overwriting them here would destroy the pending edit.
                // Only sync those fields from cloud once the push succeeds (syncPending=false).
                const hasPendingLocalEdits = !!existingInventory?.syncPending;

                // Remove orphan duplicates created by previous buggy syncs
                if (branchInventories.length > 1 && existingInventory) {
                    const orphanIds = branchInventories
                        .map((r: any) => r.id)
                        .filter((id: string) => id !== existingInventory.id);
                    await tx.batch.deleteMany({ where: { inventoryId: { in: orphanIds } } });
                    await tx.inventory.deleteMany({ where: { id: { in: orphanIds } } });
                    removeInventoryIdsFromProductSyncMaps(
                        { inventoriesByDrugId, batchesByInventoryId, batchesById },
                        orphanIds,
                    );
                    setDrugInventoriesInProductSyncMaps(
                        { inventoriesByDrugId },
                        drug.id,
                        [existingInventory],
                    );
                }

                const safeCost = isNaN(cloudCost) ? 0 : cloudCost;
                const safeMinStock = drug.minStock != null ? Math.round(Number(drug.minStock)) : 10;
                const safeMaxStock = drug.maxStock != null ? Math.round(Number(drug.maxStock)) : 100;
                const safeQuantity = Math.round(Number(drug.stock || 0));

                const cloudEditableFields = {
                    costPrice: safeCost,
                    minStock: isNaN(safeMinStock) ? 10 : safeMinStock,
                    maxStock: isNaN(safeMaxStock) ? 100 : safeMaxStock,
                };

                let targetInventoryId: string;
                if (existingInventory) {
                    const inventoryChanges = changedProductSyncData(existingInventory, {
                        quantity: isNaN(safeQuantity) ? 0 : safeQuantity,
                        branchId,
                        // Skip editable fields if local has unsaved changes (syncPending=true)
                        ...(hasPendingLocalEdits ? {} : cloudEditableFields),
                    });
                    if (Object.keys(inventoryChanges).length > 0) {
                        await tx.inventory.update({
                            where: { id: existingInventory.id },
                            data: inventoryChanges,
                        });
                        Object.assign(existingInventory, inventoryChanges);
                    }
                    targetInventoryId = existingInventory.id;
                } else {
                    // New record: always use full cloud payload (no local edits exist yet)
                    const newInv = await tx.inventory.create({
                        data: {
                            id: cloudInventoryId || undefined,
                            drugId: drug.id,
                            quantity: isNaN(safeQuantity) ? 0 : safeQuantity,
                            branchId,
                            ...cloudEditableFields,
                        }
                    });
                    targetInventoryId = newInv.id;
                    setDrugInventoriesInProductSyncMaps({ inventoriesByDrugId }, drug.id, [newInv]);
                }

                // Sync Batches
                if (drug.batches && Array.isArray(drug.batches) && targetInventoryId) {
                    // Filter out batches with missing IDs — Prisma requires a
                    // non-null primary key for upsert's `where` clause.
                    const validBatches = drug.batches.filter((b: any) => b && typeof b.id === 'string' && b.id.trim().length > 0);

                    const existingBatches = batchesByInventoryId.get(targetInventoryId) || [];

                    const cloudBatchIds = validBatches.map((b: any) => b.id);
                    const staleBatchIds = existingBatches.map((b: any) => b.id).filter((id: string) => !cloudBatchIds.includes(id));

                    if (staleBatchIds.length > 0) {
                        await tx.batch.deleteMany({ where: { id: { in: staleBatchIds } } });
                        for (const staleBatchId of staleBatchIds) {
                            batchesById.delete(staleBatchId);
                        }
                        batchesByInventoryId.set(
                            targetInventoryId,
                            existingBatches.filter((batch: any) => cloudBatchIds.includes(batch.id)),
                        );
                    }

                    for (const b of validBatches) {
                        // Guard against invalid dates — use epoch fallback
                        const parsedDate = new Date(b.expiryDate);
                        const safeExpiryDate = isNaN(parsedDate.getTime()) ? new Date(0) : parsedDate;

                        const cloudQuantity = Math.round(Number(b.quantity || 0));

                        // Don't overwrite a locally-decremented quantity with the cloud value.
                        // If the local quantity is lower, it means a sale deducted it locally
                        // but the cloud hasn't reflected that deduction yet (sync lag).
                        // Overwriting would silently restore stock that was already sold.
                        const mappedBatch = batchesById.get(b.id);
                        const existingBatch = !mappedBatch || mappedBatch.inventoryId === targetInventoryId
                            ? mappedBatch
                            : await tx.batch.findUnique({
                                where: { id: b.id },
                                select: {
                                    id: true,
                                    inventoryId: true,
                                    batchNumber: true,
                                    quantity: true,
                                    expiryDate: true,
                                    costPrice: true,
                                }
                            });
                        const localQuantity = existingBatch?.quantity ?? cloudQuantity;
                        const safeQuantityToApply = existingBatch && localQuantity < cloudQuantity
                            ? localQuantity   // keep the locally-decremented value
                            : cloudQuantity;  // new batch or cloud quantity is lower (e.g. return was processed)

                        const batchPayload = {
                            inventoryId: targetInventoryId,
                            batchNumber: String(b.batchNumber || ''),
                            quantity: safeQuantityToApply,
                            expiryDate: safeExpiryDate,
                            costPrice: Number(b.costPrice || 0)
                        };

                        if (existingBatch) {
                            const batchChanges = changedProductSyncData(existingBatch, batchPayload);
                            if (Object.keys(batchChanges).length > 0) {
                                await tx.batch.update({
                                    where: { id: b.id },
                                    data: batchChanges,
                                });
                                upsertBatchInProductSyncMaps(
                                    { batchesByInventoryId, batchesById },
                                    { ...existingBatch, ...batchChanges },
                                );
                            } else {
                                upsertBatchInProductSyncMaps(
                                    { batchesByInventoryId, batchesById },
                                    existingBatch,
                                );
                            }
                        } else {
                            const createdBatch = {
                                id: b.id,
                                ...batchPayload,
                                quantity: cloudQuantity, // for new batches always use cloud value
                            };
                            await tx.batch.create({
                                data: createdBatch
                            });
                            upsertBatchInProductSyncMaps(
                                { batchesByInventoryId, batchesById },
                                createdBatch,
                            );
                        }
                    }

                    // After syncing all batches, ensure their total quantity matches
                    // inventory.quantity. If the cloud sends no batches (or batches with
                    // quantity=0) but inventory.quantity > 0, create a synthetic batch so
                    // the FEFO deduction in process-sale can proceed correctly.
                    const syncedBatchTotal = validBatches.reduce(
                        (sum: number, b: any) => sum + Math.round(Number(b.quantity || 0)), 0
                    );
                    if (safeQuantity > 0 && syncedBatchTotal === 0) {
                        const createdSyntheticBatch = await tx.batch.create({
                            data: {
                                inventoryId: targetInventoryId,
                                batchNumber: 'SYNCED',
                                quantity: safeQuantity,
                                expiryDate: new Date('2099-12-31'),
                                costPrice: safeCost,
                            }
                        });
                        upsertBatchInProductSyncMaps(
                            { batchesByInventoryId, batchesById },
                            createdSyntheticBatch,
                        );
                        console.log(`[Sync] Created synthetic batch for drug ${drug.id} qty=${safeQuantity} (no batches from cloud)`);
                    }
                } else if (safeQuantity > 0 && targetInventoryId) {
                    // No batches field at all from cloud — ensure at least one batch exists
                    const existingBatches = batchesByInventoryId.get(targetInventoryId) || [];
                    const existingTotal = existingBatches.reduce((s: number, b: any) => s + b.quantity, 0);
                    if (existingTotal === 0) {
                        const createdSyntheticBatch = await tx.batch.create({
                            data: {
                                inventoryId: targetInventoryId,
                                batchNumber: 'SYNCED',
                                quantity: safeQuantity,
                                expiryDate: new Date('2099-12-31'),
                                costPrice: safeCost,
                            }
                        });
                        upsertBatchInProductSyncMaps(
                            { batchesByInventoryId, batchesById },
                            createdSyntheticBatch,
                        );
                        console.log(`[Sync] Created synthetic batch for drug ${drug.id} qty=${safeQuantity} (no batch data)`);
                    }
                }

                const duplicateInventoryIds = branchInventories
                    .map((row: any) => row.id)
                    .filter((inventoryId: string) => inventoryId !== targetInventoryId);

                if (duplicateInventoryIds.length > 0) {
                    await tx.batch.deleteMany({
                        where: { inventoryId: { in: duplicateInventoryIds } }
                    });
                    await tx.inventory.deleteMany({
                        where: { id: { in: duplicateInventoryIds } }
                    });
                    removeInventoryIdsFromProductSyncMaps(
                        { inventoriesByDrugId, batchesByInventoryId, batchesById },
                        duplicateInventoryIds,
                    );
                    setDrugInventoriesInProductSyncMaps(
                        { inventoriesByDrugId },
                        drug.id,
                        [existingInventory].filter(Boolean),
                    );
                }
              } catch (drugErr) {
                console.error(`[Sync] Failed to process drug id=${drug.id} barcode=${drug.barcode}:`, drugErr);
                // Continue with remaining drugs instead of aborting the whole transaction
              }
            }

            // Remove local inventory rows deleted remotely for this branch.
            // Delete batches first to satisfy FK constraints.
            // Use Set for O(1) lookups instead of `notIn` which can exceed
            // SQLite's 999-variable limit (P2029).
            const fetchedInvSet = new Set(fetchedInventoryIds);
            const fetchedDrugSet = new Set(fetchedDrugIds);

            const allBranchInventories = await tx.inventory.findMany({
                where: { branchId },
                select: { id: true, drugId: true }
            });

            let staleInventoryIds: string[];
            if (hasCompleteInventoryIds) {
                staleInventoryIds = allBranchInventories
                    .filter((row: any) => !fetchedInvSet.has(row.id))
                    .map((row: any) => row.id);
            } else if (fetchedDrugIds.length > 0) {
                staleInventoryIds = allBranchInventories
                    .filter((row: any) => !fetchedDrugSet.has(row.drugId))
                    .map((row: any) => row.id);
            } else {
                staleInventoryIds = allBranchInventories.map((row: any) => row.id);
            }

            if (staleInventoryIds.length > 0) {
                await deleteManyChunked(tx.batch, 'inventoryId', staleInventoryIds);
                await deleteManyChunked(tx.inventory, 'id', staleInventoryIds);
            }

            // Keep drug activation consistent with current branch snapshot.
            await updateManyChunked(tx.globalDrug, 'id', fetchedDrugIds, { isActive: true });

            // Deactivate drugs not in cloud and not linked to any local inventory
            const allDrugs = await tx.globalDrug.findMany({ select: { id: true } });
            const inactiveDrugIds = allDrugs
                .map((d: any) => d.id)
                .filter((id: string) => !fetchedDrugSet.has(id));
            if (inactiveDrugIds.length > 0) {
                // Only deactivate if they have no inventory at all
                for (let i = 0; i < inactiveDrugIds.length; i += SQLITE_VAR_LIMIT) {
                    const chunk = inactiveDrugIds.slice(i, i + SQLITE_VAR_LIMIT);
                    await tx.globalDrug.updateMany({
                        where: { id: { in: chunk }, inventory: { none: {} } },
                        data: { isActive: false }
                    });
                }
            }
        }, { timeout: 120_000 });

        // After a successful pull, clear syncPending for ALL inventory items.
        // This is safe because:
        //   1. During the pull above, editable fields were preserved for syncPending=true items
        //   2. The push action (if it existed) has already been processed or is still queued
        //   3. On the NEXT pull, syncPending=false lets cloud values through — by then
        //      the cloud will have committed any pushed writes
        // If the push permanently fails (DLQ), we still want cloud values to eventually
        // win to avoid permanent data divergence.
        try {
            await prisma.inventory.updateMany({
                where: { syncPending: true },
                data: { syncPending: false },
            });
        } catch { /* non-critical */ }

        recordSyncSuccess("المخزون");
        console.log(`[Sync] Product snapshot sync completed. ${drugs.length} cloud product(s) processed.`);
        return { success: true, count: drugs.length };
    } catch (error: any) {
        console.error("[Sync] Product sync error:", error);
        // Include Prisma's detailed meta if available (field name, model, etc.)
        let reason = error instanceof Error ? error.message : String(error);
        if (error?.meta) {
            reason += ' | meta: ' + JSON.stringify(error.meta);
        }
        if (error?.code) {
            reason = `[${error.code}] ${reason}`;
        }
        return { success: false, reason };
    } finally {
        endSyncTask(taskName);
    }
}
export async function syncUsers() {
    const taskName = "users";
    if (!beginSyncTask(taskName)) return;

    try {
        if (!await checkConnection()) return;

        const branchId = getBranchId();
        if (!branchId) return;

        const response = await fetchWithRetry(buildApiUrl(`/sync/users?branchId=${branchId}`));
        if (!response.ok) throw new Error("User sync failed");

        const data = await response.json();
        const users = data.users as any[];

        if (users.length > 0) {
            const cloudUserIds = users.map((u: any) => u.id);
            await prisma.$transaction(async (tx: any) => {
                for (const user of users) {
                    if (!user?.id || !user?.email) {
                        console.log("[Sync] Skipping invalid user payload:", user);
                        continue;
                    }

                    const userData = {
                        name: user.name,
                        email: user.email,
                        role: user.role,
                        password: user.password,
                        branchId: user.branchId,
                        // Default true for older cloud payloads that omit the field.
                        isActive: user.isActive ?? true
                    };

                    const existingById = await tx.user.findUnique({
                        where: { id: user.id }
                    });

                    if (existingById) {
                        await tx.user.update({
                            where: { id: user.id },
                            data: userData
                        });
                        continue;
                    }

                    const existingByEmail = await tx.user.findUnique({
                        where: { email: user.email }
                    });

                    if (existingByEmail) {
                        await tx.user.update({
                            where: { id: existingByEmail.id },
                            data: userData
                        });

                        if (existingByEmail.id !== user.id) {
                            console.log(`[Sync] Email collision for ${user.email}. Keeping local ID ${existingByEmail.id} instead of cloud ID ${user.id}.`);
                        }
                        continue;
                    }

                    await tx.user.create({
                        data: {
                            id: user.id,
                            ...userData
                        }
                    });
                }

                // Deactivate local users that are no longer in the cloud snapshot
                // (we don't delete them to preserve sales history referencing their ID)
                if (cloudUserIds.length > 0) {
                    const deactivated = await tx.user.updateMany({
                        where: {
                            id: { notIn: cloudUserIds },
                            role: { not: 'INACTIVE' }
                        },
                        data: { role: 'INACTIVE' }
                    });
                    if (deactivated.count > 0) {
                        console.log(`[Sync] Deactivated ${deactivated.count} local user(s) missing from cloud.`);
                    }
                }
            });
            console.log(`[Sync] User sync completed. ${users.length} user(s) processed.`);
        }
    } catch (error) {
        console.error("[Sync] User sync error:", error);
    } finally {
        endSyncTask(taskName);
    }
}
export async function syncPatients() {
    const taskName = "patients";
    if (!beginSyncTask(taskName)) return;

    try {
        if (!await checkConnection()) return;

        const branchId = getBranchId();
        if (!branchId) return;

        const response = await fetchWithRetry(buildApiUrl(`/sync/patients?branchId=${branchId}`));
        if (!response.ok) throw new Error("Patient sync failed");

        const data = await response.json();
        const patients = data.patients as any[];
        const cloudIds = patients.map((p: any) => p.id);

        // Safety guard: if cloud returns an empty list, skip all deletion to prevent
        // accidental data loss from transient API errors or filtering edge cases.
        if (patients.length === 0) {
            console.log('[Sync] Cloud returned 0 patients — skipping local deletion to prevent data loss.');
            return;
        }

        await prisma.$transaction(async (tx: any) => {
            for (const patient of patients) {
                await tx.patient.upsert({
                    where: { id: patient.id },
                    update: {
                        name: patient.name,
                        phone: patient.phone,
                        dateOfBirth: patient.dateOfBirth ? new Date(patient.dateOfBirth) : null,
                        gender: patient.gender,
                        allergies: patient.allergies?.join(',') || "",
                        chronicDiseases: patient.chronicDiseases?.join(',') || "",
                        notes: patient.notes,
                        branchId: patient.branchId || null
                    },
                    create: {
                        id: patient.id,
                        name: patient.name,
                        phone: patient.phone,
                        dateOfBirth: patient.dateOfBirth ? new Date(patient.dateOfBirth) : null,
                        gender: patient.gender,
                        allergies: patient.allergies?.join(',') || "",
                        chronicDiseases: patient.chronicDiseases?.join(',') || "",
                        notes: patient.notes,
                        branchId: patient.branchId || null
                    }
                });
            }

            // Use Set-based filtering to avoid SQLite's 999-variable limit (P2029)
            const cloudIdSet = new Set(cloudIds);

            // Protect freshly-created local patients (e.g. a new credit customer)
            // from being wiped before their push to the cloud has propagated.
            // Without this, a brand-new debtor — and their sale's patient link —
            // would vanish until the sale itself synced and the cloud returned them.
            const PATIENT_SYNC_GRACE_MS = 10 * 60 * 1000;
            const recentCutoff = Date.now() - PATIENT_SYNC_GRACE_MS;
            const localPatients = await tx.patient.findMany({ select: { id: true, createdAt: true } });
            const protectedIds = new Set<string>(
                localPatients
                    .filter((p: any) => new Date(p.createdAt).getTime() >= recentCutoff)
                    .map((p: any) => p.id)
            );

            // Nullify patientId on sales whose patient is genuinely gone from cloud
            // (never for protected, just-created patients).
            const orphanSales = await tx.sale.findMany({
                where: { patientId: { not: null } },
                select: { id: true, patientId: true }
            });
            const orphanSaleIds = orphanSales
                .filter((s: any) => s.patientId && !cloudIdSet.has(s.patientId) && !protectedIds.has(s.patientId))
                .map((s: any) => s.id);
            if (orphanSaleIds.length > 0) {
                await updateManyChunked(tx.sale, 'id', orphanSaleIds, { patientId: null });
            }

            // Delete loyalty accounts for patients no longer in cloud
            const allAccounts = await tx.loyaltyAccount.findMany({
                select: { id: true, patientId: true }
            });
            const accountsToDelete = allAccounts.filter(
                (a: any) => !cloudIdSet.has(a.patientId) && !protectedIds.has(a.patientId)
            );
            const accountIds = accountsToDelete.map((a: any) => a.id);
            if (accountIds.length > 0) {
                await deleteManyChunked(tx.loyaltyTransaction, 'accountId', accountIds);
                await deleteManyChunked(tx.loyaltyAccount, 'id', accountIds);
            }

            // Delete patients no longer in cloud (excluding protected new ones).
            const patientIdsToDelete = localPatients
                .filter((p: any) => !cloudIdSet.has(p.id) && !protectedIds.has(p.id))
                .map((p: any) => p.id);
            let deletedCount = 0;
            if (patientIdsToDelete.length > 0) {
                for (let i = 0; i < patientIdsToDelete.length; i += SQLITE_VAR_LIMIT) {
                    const chunk = patientIdsToDelete.slice(i, i + SQLITE_VAR_LIMIT);
                    const r = await tx.patient.deleteMany({ where: { id: { in: chunk } } });
                    deletedCount += r.count;
                }
            }
            const deleted = { count: deletedCount };
            if (deleted.count > 0) {
                console.log(`[Sync] Removed ${deleted.count} local patient record(s) missing from cloud.`);
            }
        });

        if (patients.length > 0) {
            console.log(`[Sync] Patient sync completed. ${patients.length} patient(s) processed.`);
        }
    } catch (error) {
        console.error("[Sync] Patient sync error:", error);
    } finally {
        endSyncTask(taskName);
    }
}
export async function syncSettings() {
    const taskName = "settings";
    if (!beginSyncTask(taskName)) return;

    try {
        if (!await checkConnection()) return;

        const branchId = getBranchId();
        const settingsUrl = branchId
            ? buildApiUrl(`/sync/settings?branchId=${encodeURIComponent(branchId)}`)
            : buildApiUrl('/sync/settings');
        const response = await fetchWithRetry(settingsUrl);
        if (!response.ok) throw new Error("Settings sync failed");

        const settings = await response.json();
        if (!settings || !settings.id) return;

        await prisma.companySettings.upsert({
            where: { id: settings.id },
            update: {
                name: settings.name,
                phone: settings.phone,
                address: settings.address,
                email: settings.email,
                website: settings.website,
                logoUrl: settings.logoUrl,
                taxNumber: settings.taxNumber,
                facebookUrl: settings.facebookUrl,
                instagramUrl: settings.instagramUrl,
                currency: settings.currency,
                loyaltyEnabled: settings.loyaltyEnabled,
                loyaltyPointsPerDinar: settings.loyaltyPointsPerDinar,
                loyaltyRedemptionValue: settings.loyaltyRedemptionValue,
                loyaltyMinRedemption: settings.loyaltyMinRedemption,
                maxDiscountPercent: settings.maxDiscountPercent ?? 10,
            },
            create: {
                id: settings.id,
                name: settings.name,
                phone: settings.phone,
                address: settings.address,
                email: settings.email,
                website: settings.website,
                logoUrl: settings.logoUrl,
                taxNumber: settings.taxNumber,
                facebookUrl: settings.facebookUrl,
                instagramUrl: settings.instagramUrl,
                currency: settings.currency,
                loyaltyEnabled: settings.loyaltyEnabled,
                loyaltyPointsPerDinar: settings.loyaltyPointsPerDinar,
                loyaltyRedemptionValue: settings.loyaltyRedemptionValue,
                loyaltyMinRedemption: settings.loyaltyMinRedemption,
                maxDiscountPercent: settings.maxDiscountPercent ?? 10,
            }
        });

        // Keep a single settings row locally.
        await prisma.companySettings.deleteMany({
            where: { id: { not: settings.id } }
        });

        console.log("[Sync] Company settings synced successfully.");
    } catch (error) {
        console.error("[Sync] Settings sync error:", error);
    } finally {
        endSyncTask(taskName);
    }
}

type SyncAckStatus = 'processed' | 'duplicate' | 'noop' | 'already_deleted';
type SyncAckPayload = {
    status?: SyncAckStatus | string;
    idempotencyKey?: string | null;
    message?: string;
};


async function parseResponseBody<T = any>(response: Response): Promise<T | null> {
    try {
        return await response.json() as T;
    } catch {
        return null;
    }
}

function isAckSuccess(ack?: SyncAckPayload | null): boolean {
    const status = String(ack?.status || '').toLowerCase();
    return status === 'processed' || status === 'duplicate' || status === 'already_deleted' || status === 'noop';
}
/**
 * Pushes a newly created drug from desktop to cloud immediately.
 */
export async function pushCreateDrugToCloud(data: {
    id: string;
    barcode: string;
    tradeName: string;
    scientificName: string;
    origin?: string;
    price: number;
    cost: number;
    minStock: number;
    maxStock: number;
    branchId: string;
    quantity?: number;
    expiryDate?: string;
    inventoryId?: string;
    supplierId?: string | null;
    /** تعبئة الدواء الجديد — تُكتب مؤكّدة عند إنشائه في السحابة. */
    unitsPerPack?: number | null;
}, options?: { actionId?: string }): Promise<boolean> {
    try {
        if (!await checkConnection()) return false;

        console.log(`[CloudSync] Pushing new drug to cloud: ${data.tradeName} (ID: ${data.id})`);
        const idempotencyKey = options?.actionId
            ? buildIdempotencyKey('create-drug', options.actionId)
            : buildIdempotencyKey('create-drug', data.id);

        const response = await fetchWithRetry(buildApiUrl('/inventory/create-quick'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-idempotency-key': idempotencyKey
            },
            body: JSON.stringify({
                clientActionId: idempotencyKey,
                id: data.id,
                barcode: data.barcode,
                tradeName: data.tradeName,
                scientificName: data.scientificName,
                origin: data.origin || "unknown",
                branchId: data.branchId,
                price: data.price,
                cost: data.cost,
                minStock: data.minStock,
                maxStock: data.maxStock,
                quantity: data.quantity || 0,
                expiryDate: data.expiryDate || new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString(),
                inventoryId: data.inventoryId,
                supplierId: data.supplierId ?? null,
                unitsPerPack: data.unitsPerPack ?? null
            })
        });

        const body = await parseResponseBody<{ message?: string; ack?: SyncAckPayload }>(response);
        const ack = body?.ack;

        if (!response.ok) {
            let errorMessage = `HTTP ${response.status}`;
            errorMessage = body?.message || errorMessage;
            console.error("[CloudSync] Failed to push drug:", errorMessage);
            return false;
        }

        if (isAckSuccess(ack)) {
            console.log(`[CloudSync] Drug push acknowledged (${ack?.status ?? 'processed'}) [key=${ack?.idempotencyKey ?? idempotencyKey}]`);
            return true;
        }

        console.log("[CloudSync] Drug pushed successfully.");
        return true;
    } catch (error) {
        console.error("[CloudSync] Error pushing drug:", error);
        return false;
    }
}

/**
 * Pushes inventory addition from desktop to cloud immediately.
 */
export async function pushAddToInventoryToCloud(data: {
    id: string; // The local inventory ID
    drugId: string;
    branchId: string;
    costPrice: number;
    price?: number;
    quantity: number;
    minStock: number;
    maxStock: number;
    expiryDate?: string;
}, options?: { actionId?: string }): Promise<boolean> {
    try {
        if (!await checkConnection()) return false;

        console.log(`[CloudSync] Pushing inventory addition to cloud for drug: ${data.drugId}`);
        const idempotencyKey = options?.actionId
            ? buildIdempotencyKey('add-inventory', options.actionId)
            : buildIdempotencyKey('add-inventory', data.id);

        const response = await fetchWithRetry(buildApiUrl('/inventory/add-to-branch'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-idempotency-key': idempotencyKey
            },
            body: JSON.stringify({
                clientActionId: idempotencyKey,
                id: data.id,
                drugId: data.drugId,
                branchId: data.branchId,
                cost: data.costPrice,
                price: data.price || 0,
                quantity: data.quantity,
                minStock: data.minStock,
                maxStock: data.maxStock,
                expiryDate: data.expiryDate || null
            })
        });

        const body = await parseResponseBody<{ message?: string; ack?: SyncAckPayload }>(response);
        const ack = body?.ack;

        if (!response.ok) {
            let errorMessage = `HTTP ${response.status}`;
            errorMessage = body?.message || errorMessage;
            console.error("[CloudSync] Failed to push inventory:", errorMessage);
            return false;
        }

        if (isAckSuccess(ack)) {
            console.log(`[CloudSync] Inventory addition acknowledged (${ack?.status ?? 'processed'}) [key=${ack?.idempotencyKey ?? idempotencyKey}]`);
            return true;
        }

        console.log("[CloudSync] Inventory addition pushed successfully.");
        return true;
    } catch (error) {
        console.error("[CloudSync] Error pushing inventory:", error);
        return false;
    }
}

/**
 * Pushes inventory deletion from desktop to cloud immediately.
 */
export async function pushDeleteInventoryFromCloud(inventoryId: string, options?: { actionId?: string }) {
    try {
        if (!await checkConnection()) return false;

        console.log(`[CloudSync] Pushing inventory deletion to cloud: ${inventoryId}`);
        const idempotencyKey = options?.actionId
            ? buildIdempotencyKey('delete-inventory', options.actionId)
            : buildIdempotencyKey('delete-inventory', inventoryId);
        let backoff = 1000;
        for (let attempt = 1; attempt <= 3; attempt++) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);
            try {
                const response = await fetch(buildApiUrl('/inventory/delete'), {
                    method: 'POST',
                    headers: {
                        ...getDeviceAuthHeaders(),
                        'Content-Type': 'application/json',
                        'x-idempotency-key': idempotencyKey
                    },
                    body: JSON.stringify({
                        inventoryId,
                        clientActionId: idempotencyKey
                    }),
                    signal: controller.signal
                });
                clearTimeout(timeoutId);

                const body = await parseResponseBody<{ message?: string; ack?: SyncAckPayload }>(response);
                const ack = body?.ack;

                if (response.ok) {
                    if (isAckSuccess(ack)) {
                        console.log(`[CloudSync] Inventory deletion acknowledged (${ack?.status ?? 'processed'}) [key=${ack?.idempotencyKey ?? idempotencyKey}]`);
                    } else {
                        console.log("[CloudSync] Inventory deleted from cloud successfully.");
                    }
                    return true;
                }

                let errorMessage = `HTTP ${response.status}`;
                errorMessage = body?.message || errorMessage;

                const lowerMessage = errorMessage.toLowerCase();
                if (
                    response.status === 404 ||
                    lowerMessage.includes('not found') ||
                    lowerMessage.includes('record to delete does not exist') ||
                    lowerMessage.includes('p2025')
                ) {
                    console.log("[CloudSync] Inventory already absent in cloud. Treating delete as synced.");
                    return true;
                }

                const shouldRetry = (response.status >= 500 || response.status === 429) && attempt < 3;
                if (shouldRetry) {
                    console.log(`[Sync] Server busy (${response.status}). Retry ${attempt}/3 in ${backoff}ms...`);
                    await new Promise(r => setTimeout(r, backoff));
                    backoff *= 2;
                    continue;
                }

                console.error("[CloudSync] Failed to delete inventory from cloud:", errorMessage);
                // Permission denied: permanent, surface it for review (see _doSyncActions)
                // rather than silently dropping the delete after repeated attempts.
                if (response.status === 403) throw new SyncClientError(`Client Error 403: ${errorMessage}`, 403);
                return false;
            } catch (error: any) {
                if (error instanceof SyncClientError) throw error;
                clearTimeout(timeoutId);
                const shouldRetry = attempt < 3 && (error?.name === 'AbortError' || String(error?.message || '').includes('fetch'));
                if (shouldRetry) {
                    console.log(`[Sync] Network error. Retry ${attempt}/3 in ${backoff}ms...`);
                    await new Promise(r => setTimeout(r, backoff));
                    backoff *= 2;
                    continue;
                }
                console.error("[CloudSync] Error deleting inventory from cloud:", error);
                return false;
            }
        }
        return false;
    } catch (error) {
        if (error instanceof SyncClientError) throw error;
        console.error("[CloudSync] Error deleting inventory from cloud:", error);
        return false;
    }
}

/**
 * Pushes a new batch from desktop to cloud immediately.
 */
export async function pushAddBatchToCloud(data: {
    inventoryId: string;
    batchNumber: string;
    quantity: number;
    expiryDate: string;
    drugId?: string;
    branchId?: string;
    supplierId?: string | null;
    costPrice?: number;
    /** عدد الأشرطة في الباكيت — يُثبّت على الدواء في السحابة عند الوصول. */
    unitsPerPack?: number | null;
}, options?: { actionId?: string }): Promise<boolean> {
    try {
        if (!await checkConnection()) return false;

        console.log(`[CloudSync] Pushing batch to cloud: inventoryId=${data.inventoryId}, qty=${data.quantity}`);
        const idempotencyKey = options?.actionId
            ? buildIdempotencyKey('add-batch', options.actionId)
            : buildIdempotencyKey('add-batch', `${data.inventoryId}-${data.batchNumber}`);

        const response = await fetchWithRetry(buildApiUrl('/inventory/add-batch'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-idempotency-key': idempotencyKey
            },
            body: JSON.stringify({
                clientActionId: idempotencyKey,
                inventoryId: data.inventoryId,
                batchNumber: data.batchNumber,
                quantity: data.quantity,
                expiryDate: data.expiryDate,
                drugId: data.drugId || null,
                branchId: data.branchId || null,
                supplierId: data.supplierId ?? null,
                costPrice: data.costPrice ?? 0,
                unitsPerPack: data.unitsPerPack ?? null,
            })
        });

        const body = await parseResponseBody<{ message?: string; ack?: SyncAckPayload }>(response);
        const ack = body?.ack;

        if (!response.ok) {
            let errorMessage = `HTTP ${response.status}`;
            errorMessage = body?.message || errorMessage;
            console.error("[CloudSync] Failed to push batch:", errorMessage);
            throw new Error(errorMessage);
        }

        if (isAckSuccess(ack)) {
            console.log(`[CloudSync] Batch push acknowledged (${ack?.status ?? 'processed'}) [key=${ack?.idempotencyKey ?? idempotencyKey}]`);
            return true;
        }

        console.log("[CloudSync] Batch pushed successfully.");
        return true;
    } catch (error) {
        console.error("[CloudSync] Error pushing batch:", error);
        throw error;
    }
}

/**
 * Pushes inventory item updates (price, cost, min/max stock) to cloud.
 */
export async function pushUpdateInventoryToCloud(data: {
    inventoryId: string;
    drugId: string;
    branchId?: string;
    price?: number;
    costPrice?: number;
    minStock?: number;
    maxStock?: number;
}, options?: { actionId?: string }): Promise<boolean> {
    try {
        if (!await checkConnection()) {
            syncLog(`✗ pushUpdateInventory: checkConnection FAILED — offline`);
            return false;
        }

        const targetUrl = buildApiUrl('/inventory/update-item');
        const payload = {
            inventoryId: data.inventoryId,
            drugId: data.drugId,
            branchId: data.branchId || null,
            price: data.price,
            costPrice: data.costPrice,
            minStock: data.minStock,
            maxStock: data.maxStock
        };

        console.log(`[CloudSync] ▶ PUSH inventory update to ${targetUrl}`);
        console.log(`[CloudSync]   payload:`, JSON.stringify(payload));
        syncLog(`▶ PUSH to ${targetUrl}`);
        syncLog(`  payload: ${JSON.stringify(payload)}`);

        const idempotencyKey = options?.actionId
            ? buildIdempotencyKey('update-inventory', options.actionId)
            : buildIdempotencyKey('update-inventory', data.inventoryId);

        const response = await fetchWithRetry(targetUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-idempotency-key': idempotencyKey
            },
            body: JSON.stringify({
                clientActionId: idempotencyKey,
                ...payload
            })
        });

        const body = await parseResponseBody<{
            message?: string;
            ack?: SyncAckPayload;
            success?: boolean;
            data?: { id?: string; minStock?: number; maxStock?: number; cost?: number; price?: number };
        }>(response);
        const ack = body?.ack;

        console.log(`[CloudSync]   response status=${response.status} ok=${response.ok}`);
        console.log(`[CloudSync]   response body:`, JSON.stringify(body));
        syncLog(`  response: status=${response.status} ok=${response.ok}`);
        syncLog(`  body: ${JSON.stringify(body)}`);

        if (!response.ok) {
            let errorMessage = `HTTP ${response.status}`;
            errorMessage = body?.message || errorMessage;
            console.error("[CloudSync] ✗ PUSH FAILED:", errorMessage);
            syncLog(`  ✗ FAILED: ${errorMessage}`);
            return false;
        }

        // Verify: compare what we sent with what the cloud returned
        if (body?.data) {
            const cloud = body.data;
            const mismatches: string[] = [];
            if (data.minStock !== undefined && cloud.minStock !== data.minStock)
                mismatches.push(`minStock: sent=${data.minStock} cloud=${cloud.minStock}`);
            if (data.maxStock !== undefined && cloud.maxStock !== data.maxStock)
                mismatches.push(`maxStock: sent=${data.maxStock} cloud=${cloud.maxStock}`);
            if (data.costPrice !== undefined && cloud.cost !== data.costPrice)
                mismatches.push(`cost: sent=${data.costPrice} cloud=${cloud.cost}`);
            if (mismatches.length > 0) {
                console.error(`[CloudSync] ⚠ MISMATCH after push! ${mismatches.join(', ')}`);
                syncLog(`  ⚠ MISMATCH! ${mismatches.join(', ')}`);
            } else {
                console.log(`[CloudSync] ✓ Verified: cloud values match sent values`);
                syncLog(`  ✓ Verified OK`);
            }
        }

        if (isAckSuccess(ack)) {
            console.log(`[CloudSync] ✓ PUSH acknowledged (${ack?.status ?? 'processed'}) [key=${ack?.idempotencyKey ?? idempotencyKey}]`);
            return true;
        }

        console.log("[CloudSync] ✓ PUSH succeeded.");
        return true;
    } catch (error) {
        console.error("[CloudSync] Error pushing inventory update:", error);
        syncLog(`  ✗ EXCEPTION: ${error instanceof Error ? error.message : String(error)}`);
        // Re-throw network/transient errors so _doSyncActions can detect them
        // and skip the DLQ / bypass backoff on the next retry attempt.
        if (error instanceof Error && /retries|fetch|network|abort|timeout|econnrefused|enotfound/i.test(error.message)) {
            throw error;
        }
        // A permission denial is permanent: re-throw so the queue routes it to the
        // sync-failures review list instead of retrying it forever.
        if (error instanceof SyncClientError && error.status === 403) throw error;
        return false;
    }
}

/**
 * Allocate the next per-organization sequential invoice number from the cloud,
 * so the printed receipt matches the number shown on the web dashboard.
 * Returns the number on success, or null when offline / on any failure — callers
 * must fall back to a local number in that case.
 */
/**
 * Invoice-number prefetch cache: one number is allocated in the background
 * (after each sale / at startup) and persisted in the store, so checkout can
 * consume it instantly instead of waiting a network round-trip. Persisting it
 * means an unused number survives app restarts and is used by the next sale —
 * sequence gaps only occur if the device never sells again.
 */
export function takeCachedInvoiceNumber(): string | null {
    const cached = String(store.get('nextInvoiceNumber') || '');
    if (!cached) return null;
    store.set('nextInvoiceNumber', '');
    return cached;
}

export async function prefetchInvoiceNumber(): Promise<void> {
    try {
        if (store.get('nextInvoiceNumber')) return; // already have one banked
        const n = await allocateInvoiceNumber();
        if (n != null) {
            store.set('nextInvoiceNumber', String(n));
            console.log(`[Sale] Prefetched next invoice number: ${n}`);
        }
    } catch {
        // Purely opportunistic — checkout falls back to inline allocation.
    }
}

export async function allocateInvoiceNumber(): Promise<number | null> {
    if (!isOnline) return null;
    // Direct fetch with a short timeout and NO retries: allocating a number must
    // never stall the checkout. If it can't return quickly we fall back to a
    // local number and let /sync/sales assign the sequential one later.
    // 1.5s cap — a slow/cold server must not hold the cashier hostage; the
    // reconciliation path exists precisely for this case.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);
    try {
        const response = await fetch(buildApiUrl('/sales/allocate-number'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getDeviceAuthHeaders() },
            body: JSON.stringify({ branchId: getBranchId() }),
            signal: controller.signal,
        });
        if (!response.ok) {
            console.error(`[CloudSync] allocate-number failed: ${response.status}`);
            return null;
        }
        const data = await response.json() as { invoiceNumber?: number };
        return typeof data.invoiceNumber === 'number' ? data.invoiceNumber : null;
    } catch (error) {
        console.error('[CloudSync] allocateInvoiceNumber error:', error);
        return null;
    } finally {
        clearTimeout(timeoutId);
    }
}

/**
 * Push a quick-sale toggle to the cloud API.
 * Called after the local SQLite is already updated.
 */
export async function pushQuickSaleToggle(drugId: string, isQuickSale: boolean): Promise<boolean> {
    try {
        if (!await checkConnection()) return false;
        const response = await fetchWithRetry(buildApiUrl('/inventory/quick-sale'), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ drugId, isQuickSale }),
        });
        if (!response.ok) {
            console.error(`[CloudSync] quick-sale toggle failed: ${response.status}`);
            return false;
        }
        console.log(`[CloudSync] quick-sale toggle synced — drugId=${drugId} isQuickSale=${isQuickSale}`);
        return true;
    } catch (error) {
        console.error('[CloudSync] pushQuickSaleToggle error:', error);
        return false;
    }
}
