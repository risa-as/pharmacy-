import * as SQLite from 'expo-sqlite';

let db: SQLite.SQLiteDatabase | null = null;

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
                CREATE TABLE IF NOT EXISTS offline_sales (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    items TEXT,
                    totalAmount REAL,
                    createdAt TEXT,
                    synced BOOLEAN DEFAULT 0
                );
            `);
            console.log('Database initialized');
        })();
        return dbPromise;
    },

    // Save products (Bulk insert/replace)
    isSaving: false, // Mutex flag

    async saveProducts(products: any[]) {
        if (!db) await this.init();
        if (!products || products.length === 0) return;

        // Prevent concurrent saves / transaction conflicts
        if (this.isSaving) {
            console.log('Skipping saveProducts: Already saving');
            return;
        }

        this.isSaving = true;

        try {
            await db!.withTransactionAsync(async () => {
                await db!.runAsync('DELETE FROM products');
                for (const p of products) {
                    await db!.runAsync(
                        `INSERT INTO products (id, drugName, tradeName, scientificName, quantity, price, reorderLevel, branchId, barcode)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
                        [
                            p.id ?? 'unknown',
                            p.drugName ?? null,
                            p.tradeName ?? p.drugName ?? null,
                            p.scientificName ?? null,
                            p.quantity ?? 0,
                            p.price ?? 0,
                            p.reorderLevel ?? 0,
                            p.branchId ?? null,
                            p.barcode ?? ''
                        ]
                    );
                }
            });
            console.log(`Saved ${products.length} products to local DB`);
        } catch (e) {
            console.error('Error saving products:', e);
        } finally {
            this.isSaving = false;
        }
    },

    // Search products locally
    async searchProducts(query: string) {
        if (!db) await this.init();
        const searchTerm = `%${query}%`;
        return await db!.getAllAsync(
            `SELECT * FROM products WHERE drugName LIKE ? OR tradeName LIKE ? OR barcode LIKE ?`,
            [searchTerm, searchTerm, searchTerm]
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

    // Save offline sale
    async saveOfflineSale(items: any[], totalAmount: number) {
        if (!db) await this.init();
        await db!.runAsync(
            `INSERT INTO offline_sales (items, totalAmount, createdAt, synced) VALUES (?, ?, ?, 0)`,
            [JSON.stringify(items), totalAmount, new Date().toISOString()]
        );
    },

    // Get pending sales
    async getPendingSales() {
        if (!db) await this.init();
        const rows = await db!.getAllAsync(`SELECT * FROM offline_sales WHERE synced = 0`);
        return rows.map((row: any) => ({
            ...row,
            items: JSON.parse(row.items)
        }));
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
