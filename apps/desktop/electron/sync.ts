import { prisma } from './db';

const API_URL = "http://localhost:3000/api/sync/sales";
const BRANCH_ID = "e9e8f4c2-9547-4180-873b-555555555555";

let isOnline = false;

async function checkConnection(): Promise<boolean> {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        const response = await fetch(API_URL.replace('/sync/sales', '/health'), {
            method: 'GET',
            signal: controller.signal
        });

        clearTimeout(timeoutId);
        return response.ok;
    } catch {
        return false;
    }
}

export async function syncSales() {
    try {
        // Check if we can connect to the server
        isOnline = await checkConnection();

        if (!isOnline) {
            console.log("الخادم غير متاح - سيتم المزامنة لاحقاً");
            return;
        }

        // 1. Get unsynced sales
        const unsyncedSales = await prisma.sale.findMany({
            where: { synced: false },
            include: { items: true },
            take: 10
        });

        if (unsyncedSales.length === 0) return;

        console.log(`جاري مزامنة ${unsyncedSales.length} عملية بيع...`);

        // 2. Push to Cloud
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                branchId: BRANCH_ID,
                sales: unsyncedSales
            })
        });

        if (!response.ok) {
            throw new Error(`فشلت المزامنة: ${response.statusText}`);
        }

        const result = await response.json() as { syncedIds?: string[] };
        const syncedIds = result.syncedIds;

        // 3. Mark as synced
        if (syncedIds && syncedIds.length > 0) {
            await prisma.sale.updateMany({
                where: { id: { in: syncedIds } },
                data: { synced: true }
            });
            console.log(`تمت مزامنة ${syncedIds.length} عملية بيع بنجاح.`);
        }

    } catch (error) {
        // Silent error in offline mode
        console.log("وضع العمل بدون إنترنت - المزامنة معلقة");
    }
}

// Start Sync Interval
export function startSyncService() {
    // Run every 2 minutes
    setInterval(syncSales, 2 * 60 * 1000);
    // Run after 15 seconds on start
    setTimeout(syncSales, 15000);
}
