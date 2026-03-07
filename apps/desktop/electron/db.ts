import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { PrismaClient } from '../node_modules/.prisma/desktop-client';

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
