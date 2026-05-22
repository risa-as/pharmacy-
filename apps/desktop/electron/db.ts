import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { PrismaClient } from '../node_modules/.prisma/desktop-client';

// Point Prisma at the library engine (.dll.node) before creating PrismaClient.
// The library engine runs in-process (no separate exe, no TCP) which is far
// more reliable in packaged Electron apps on Windows.
if (app.isPackaged) {
    // Production: engine is in app.asar.unpacked (native .node files cannot
    // be required from inside an asar archive)
    process.env.PRISMA_QUERY_ENGINE_LIBRARY = path.join(
        process.resourcesPath,
        'app.asar.unpacked',
        'node_modules',
        '.prisma',
        'desktop-client',
        'query_engine-windows.dll.node'
    );
} else {
    // Development: engine is in node_modules
    process.env.PRISMA_QUERY_ENGINE_LIBRARY = path.join(
        __dirname,
        '..',
        'node_modules',
        '.prisma',
        'desktop-client',
        'query_engine-windows.dll.node'
    );
}

function getDbPath(): string {
    if (app.isPackaged) {
        // In production: store the database in the user's data directory
        // so it persists between updates and is writable
        const userDataPath = app.getPath('userData');
        const dbPath = path.join(userDataPath, 'local.db');

        // On first run, copy the initial (seeded) DB from our bundled resources
        if (!fs.existsSync(dbPath)) {
            const seedDbPath = path.join(process.resourcesPath, 'prisma', 'local.db');
            if (fs.existsSync(seedDbPath)) {
                fs.mkdirSync(path.dirname(dbPath), { recursive: true });
                fs.copyFileSync(seedDbPath, dbPath);
                console.log('[DB] Copied initial database to userData:', dbPath);
            } else {
                console.warn('[DB] No seed database found at:', seedDbPath);
            }
        }

        return dbPath;
    } else {
        // In development: use the local path relative to the project
        return path.join(__dirname, '../prisma/local.db');
    }
}

const dbUrl = `file:${getDbPath()}`;

export const prisma = new PrismaClient({
    datasources: {
        db: {
            url: dbUrl
        }
    }
});

/**
 * Runs additive schema migrations for existing databases.
 * Uses CREATE TABLE IF NOT EXISTS / ALTER TABLE ADD COLUMN so it's safe to call on every startup.
 * This handles cases where users installed the app before certain tables/columns were added.
 */
export async function runMigrations(): Promise<void> {
    const exec = (sql: string) => prisma.$executeRawUnsafe(sql);

    // Helper: try to add a column; silently ignore if it already exists
    const addColumn = async (table: string, column: string, definition: string) => {
        try {
            await exec(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${definition}`);
            console.log(`[DB Migration] Added column: ${table}.${column}`);
        } catch {
            // Column already exists — ignore
        }
    };

    // ── New tables ──────────────────────────────────────────────────────────

    await exec(`CREATE TABLE IF NOT EXISTS "Safe" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "name" TEXT NOT NULL,
        "type" TEXT NOT NULL DEFAULT 'CASH_DRAWER',
        "balance" REAL NOT NULL DEFAULT 0,
        "branchId" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);

    await exec(`CREATE TABLE IF NOT EXISTS "Transaction" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "safeId" TEXT NOT NULL,
        "type" TEXT NOT NULL,
        "amount" REAL NOT NULL,
        "referenceType" TEXT NOT NULL,
        "referenceId" TEXT,
        "description" TEXT,
        "userId" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "synced" BOOLEAN NOT NULL DEFAULT false
    )`);

    await exec(`CREATE TABLE IF NOT EXISTS "Expense" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "branchId" TEXT NOT NULL,
        "safeId" TEXT,
        "amount" REAL NOT NULL,
        "category" TEXT NOT NULL,
        "description" TEXT,
        "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "synced" BOOLEAN NOT NULL DEFAULT false
    )`);

    await exec(`CREATE TABLE IF NOT EXISTS "SupplierPayment" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "supplierId" TEXT NOT NULL,
        "branchId" TEXT NOT NULL,
        "safeId" TEXT,
        "amount" REAL NOT NULL,
        "method" TEXT NOT NULL DEFAULT 'CASH',
        "reference" TEXT,
        "notes" TEXT,
        "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "synced" BOOLEAN NOT NULL DEFAULT false
    )`);

    await exec(`CREATE TABLE IF NOT EXISTS "DebtPayment" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "saleId" TEXT NOT NULL,
        "amount" REAL NOT NULL,
        "method" TEXT NOT NULL DEFAULT 'CASH',
        "note" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "synced" BOOLEAN NOT NULL DEFAULT false
    )`);

    await exec(`CREATE TABLE IF NOT EXISTS "LoyaltyAccount" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "patientId" TEXT NOT NULL UNIQUE,
        "totalPoints" INTEGER NOT NULL DEFAULT 0,
        "lifetimePoints" INTEGER NOT NULL DEFAULT 0,
        "tier" TEXT NOT NULL DEFAULT 'BRONZE',
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);

    await exec(`CREATE TABLE IF NOT EXISTS "LoyaltyTransaction" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "accountId" TEXT NOT NULL,
        "type" TEXT NOT NULL,
        "points" INTEGER NOT NULL,
        "description" TEXT,
        "saleId" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "synced" BOOLEAN NOT NULL DEFAULT false
    )`);

    await exec(`CREATE TABLE IF NOT EXISTS "SaleReturn" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "saleId" TEXT NOT NULL,
        "branchId" TEXT,
        "safeId" TEXT,
        "total" REAL NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "notes" TEXT,
        "synced" BOOLEAN NOT NULL DEFAULT false
    )`);

    await exec(`CREATE TABLE IF NOT EXISTS "SaleReturnItem" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "saleReturnId" TEXT NOT NULL,
        "drugId" TEXT NOT NULL,
        "quantity" INTEGER NOT NULL,
        "price" REAL NOT NULL
    )`);

    await exec(`CREATE TABLE IF NOT EXISTS "DrugInteraction" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "drug1" TEXT NOT NULL,
        "drug2" TEXT NOT NULL,
        "severity" TEXT NOT NULL,
        "description" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);

    await exec(`CREATE TABLE IF NOT EXISTS "SyncFailure" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "entityType" TEXT NOT NULL,
        "entityId" TEXT NOT NULL,
        "payload" TEXT NOT NULL,
        "errorMessage" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);

    await exec(`CREATE TABLE IF NOT EXISTS "Stocktake" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "branchId" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'PENDING',
        "totalDiscrepancyAmount" REAL NOT NULL DEFAULT 0,
        "notes" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "userId" TEXT NOT NULL,
        "synced" BOOLEAN NOT NULL DEFAULT false
    )`);

    await exec(`CREATE TABLE IF NOT EXISTS "StocktakeItem" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "stocktakeId" TEXT NOT NULL,
        "batchId" TEXT NOT NULL,
        "systemQuantity" INTEGER NOT NULL,
        "actualQuantity" INTEGER NOT NULL,
        "difference" INTEGER NOT NULL,
        "costPrice" REAL NOT NULL,
        "reason" TEXT
    )`);

    await exec(`CREATE TABLE IF NOT EXISTS "Transfer" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "fromBranchId" TEXT NOT NULL,
        "toBranchId" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'PENDING',
        "notes" TEXT,
        "synced" BOOLEAN NOT NULL DEFAULT false,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);

    await exec(`CREATE TABLE IF NOT EXISTS "TransferItem" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "transferId" TEXT NOT NULL,
        "drugId" TEXT NOT NULL,
        "batchNumber" TEXT NOT NULL,
        "expiryDate" DATETIME NOT NULL,
        "quantity" INTEGER NOT NULL,
        "costPrice" REAL NOT NULL DEFAULT 0
    )`);

    await exec(`CREATE TABLE IF NOT EXISTS "LocalLicense" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "licenseKey" TEXT NOT NULL UNIQUE,
        "hardwareId" TEXT,
        "deviceName" TEXT,
        "isActive" BOOLEAN NOT NULL DEFAULT false,
        "expiresAt" DATETIME,
        "lastChecked" DATETIME,
        "synced" BOOLEAN NOT NULL DEFAULT true
    )`);

    // ── New columns on existing tables ──────────────────────────────────────

    await addColumn('Sale', 'safeId', 'TEXT');
    await addColumn('Sale', 'discount', 'REAL NOT NULL DEFAULT 0');
    await addColumn('Sale', 'invoiceNumber', 'TEXT');
    await addColumn('Sale', 'patientId', 'TEXT');
    await addColumn('Inventory', 'branchId', 'TEXT');
    await addColumn('Inventory', 'costPrice', 'REAL NOT NULL DEFAULT 0');
    await addColumn('Inventory', 'minStock', 'INTEGER NOT NULL DEFAULT 10');
    await addColumn('Inventory', 'maxStock', 'INTEGER NOT NULL DEFAULT 100');
    await addColumn('Inventory', 'syncPending', 'BOOLEAN NOT NULL DEFAULT false');
    await addColumn('Batch', 'costPrice', 'REAL NOT NULL DEFAULT 0');
    await addColumn('Batch', 'supplierId', 'TEXT');
    await addColumn('GlobalDrug', 'isQuickSale', 'BOOLEAN NOT NULL DEFAULT false');
    await addColumn('GlobalDrug', 'organizationId', 'TEXT');
    await addColumn('Patient', 'branchId', 'TEXT');
    await addColumn('Shift', 'safeId', 'TEXT');
    await addColumn('Shift', 'synced', 'BOOLEAN NOT NULL DEFAULT false');
    await addColumn('Shift', 'branchId', 'TEXT NOT NULL DEFAULT \'\'');

    console.log('[DB Migration] Schema migrations complete.');
}
