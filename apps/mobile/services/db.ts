import * as SQLite from 'expo-sqlite';
import { getProductSnapshotChanges, type LocalProductRow } from './productSyncDiff';

let db: SQLite.SQLiteDatabase | null = null;
let productSaveQueue: Promise<void> = Promise.resolve();

export interface OfflineSalePayload {
    // originalPrice is present only on a line whose price the cashier changed;
    // the server derives the sale's price-override flag from it.
    items: Array<{ drugId: string; quantity: number; price: number; originalPrice?: number | null }>;
    totalAmount: number;
    paymentMethod: 'CASH' | 'CARD' | 'CREDIT';
    patientId?: string | null;
    discount?: number;
    branchId?: string | null;
}

export interface PendingSale {
    id: number;
    createdAt: string;
    idempotencyKey: string | null;
    payload: OfflineSalePayload;
}

let dbPromise: Promise<void> | null = null;

export const dbService = {
    async init() {
        if (dbPromise) return dbPromise;
        dbPromise = (async () => {
            if (db) return;
            db = await SQLite.openDatabaseAsync('faramace_mobile.db');

            // Create tables
            await db.execAsync(`
                PRAGMA journal_mode = WAL;
                CREATE TABLE IF NOT EXISTS products (
                    id TEXT PRIMARY KEY,
                    drugName TEXT,
                    tradeName TEXT,
                    scientificName TEXT,
                    quantity INTEGER,
                    price REAL,
                    reorderLevel INTEGER,
                    branchId TEXT,
                    barcode TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
                CREATE INDEX IF NOT EXISTS idx_products_branch ON products(branchId);
                CREATE TABLE IF NOT EXISTS offline_sales (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    items TEXT,
                    totalAmount REAL,
                    createdAt TEXT,
                    synced BOOLEAN DEFAULT 0
                );
            `);
            // Migration (012): keep the full sale payload + a stable idempotency
            // key so a queued sale replays with its customer, method and discount,
            // and a retry of an uncertain request is deduplicated by the server.
            for (const column of ['payload TEXT', 'idempotencyKey TEXT']) {
                try {
                    await db!.execAsync(`ALTER TABLE offline_sales ADD COLUMN ${column};`);
                } catch { /* column already exists */ }
            }
            console.log('Database initialized');
        })();
        return dbPromise;
    },

    // Save a complete product snapshot, applying only row-level changes.
    isSaving: false,

    async saveProducts(products: any[]) {
        if (!Array.isArray(products)) throw new TypeError('Product snapshot must be an array');
        const snapshot = products;
        const save = productSaveQueue.then(
            () => saveProductsSnapshot(snapshot),
            () => saveProductsSnapshot(snapshot),
        );
        productSaveQueue = save.catch(() => {});
        return save;
    },

    // Search products locally
    async searchProducts(query: string, branchId?: string | null) {
        if (!db) await this.init();
        const searchTerm = `%${query}%`;
        const params: Array<string | null> = [searchTerm, searchTerm, searchTerm];
        const branchFilter = branchId ? ' AND branchId = ?' : '';
        if (branchId) params.push(branchId);

        return await db!.getAllAsync(
            `SELECT * FROM products WHERE (drugName LIKE ? OR tradeName LIKE ? OR barcode LIKE ?)${branchFilter}`,
            params
        );
    },

    // Get product by barcode
    async getProductByBarcode(barcode: string) {
        if (!db) await this.init();
        return await db!.getFirstAsync(
            `SELECT * FROM products WHERE barcode = ?`,
            [barcode]
        );
    },

    // Save offline sale — the complete payload the server expects, plus the
    // idempotency key generated once for this checkout attempt.
    async saveOfflineSale(payload: OfflineSalePayload, idempotencyKey: string) {
        if (!db) await this.init();
        await db!.runAsync(
            `INSERT INTO offline_sales (items, totalAmount, createdAt, synced, payload, idempotencyKey) VALUES (?, ?, ?, 0, ?, ?)`,
            [JSON.stringify(payload.items), payload.totalAmount, new Date().toISOString(), JSON.stringify(payload), idempotencyKey]
        );
    },

    // Get pending sales (legacy rows without a payload replay as cash sales)
    async getPendingSales(): Promise<PendingSale[]> {
        if (!db) await this.init();
        const rows = await db!.getAllAsync(`SELECT * FROM offline_sales WHERE synced = 0`);
        return rows.map((row: any) => {
            let payload: OfflineSalePayload;
            try {
                payload = row.payload
                    ? JSON.parse(row.payload)
                    : { items: JSON.parse(row.items), totalAmount: row.totalAmount, paymentMethod: 'CASH' };
            } catch {
                payload = { items: [], totalAmount: row.totalAmount ?? 0, paymentMethod: 'CASH' };
            }
            return { id: row.id as number, createdAt: row.createdAt as string, idempotencyKey: row.idempotencyKey ?? null, payload };
        });
    },

    // Mark sale as synced (or delete)
    async deleteOfflineSale(id: number) {
        if (!db) await this.init();
        await db!.runAsync(`DELETE FROM offline_sales WHERE id = ?`, [id]);
    },

    // Stubs for data types not yet stored locally.
    // sync.ts calls these; they are no-ops until local tables are added.
    async saveDebts(_debts: any[]): Promise<void> {
        // TODO: persist to local debts table when offline debt view is needed
    },

    async savePatients(_patients: any[]): Promise<void> {
        // TODO: persist to local patients table when offline patient lookup is needed
    },

    async saveLoyalty(_loyalty: any): Promise<void> {
        // TODO: persist to local loyalty table when offline loyalty is needed
    },
};

async function saveProductsSnapshot(products: any[]): Promise<void> {
    if (!db) await dbService.init();

    dbService.isSaving = true;

    try {
        const currentRows = await db!.getAllAsync<LocalProductRow>(
            `SELECT id, drugName, tradeName, scientificName, quantity, price, reorderLevel, branchId, barcode FROM products`
        );
        const { upserts, deleteIds } = getProductSnapshotChanges(products, currentRows);

        if (upserts.length === 0 && deleteIds.length === 0) {
            console.log(`Products already up to date (${products.length} rows)`);
            return;
        }

        await db!.withTransactionAsync(async () => {
            for (const id of deleteIds) {
                await db!.runAsync('DELETE FROM products WHERE id = ?', [id]);
            }

            for (const row of upserts) {
                await db!.runAsync(
                    `INSERT INTO products (id, drugName, tradeName, scientificName, quantity, price, reorderLevel, branchId, barcode)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                     ON CONFLICT(id) DO UPDATE SET
                        drugName = excluded.drugName,
                        tradeName = excluded.tradeName,
                        scientificName = excluded.scientificName,
                        quantity = excluded.quantity,
                        price = excluded.price,
                        reorderLevel = excluded.reorderLevel,
                        branchId = excluded.branchId,
                        barcode = excluded.barcode;`,
                    [
                        row.id,
                        row.drugName,
                        row.tradeName,
                        row.scientificName,
                        row.quantity,
                        row.price,
                        row.reorderLevel,
                        row.branchId,
                        row.barcode,
                    ]
                );
            }
        });

        console.log(`Saved product snapshot: ${upserts.length} upserted, ${deleteIds.length} deleted, ${products.length} received`);
    } catch (e) {
        console.error('Error saving products:', e);
        throw e;
    } finally {
        dbService.isSaving = false;
    }
}
