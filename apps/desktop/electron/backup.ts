import { app } from 'electron';
import fs from 'fs';
import path from 'path';
// Single source of truth for the DB location — must match where Prisma actually
// reads/writes the database, otherwise backups silently target the wrong file.
import { getDbPath, prisma } from './db';

// مسار مجلد النسخ الاحتياطي
const getBackupDir = () => {
    const backupDir = path.join(app.getPath('documents'), 'Faramace Backups');
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
    }
    return backupDir;
};

// إنشاء نسخة احتياطية
export const createBackup = async (): Promise<{ success: boolean; path?: string; error?: string }> => {
    try {
        const sourcePath = getDbPath();
        const backupDir = getBackupDir();

        if (!fs.existsSync(sourcePath)) {
            return { success: false, error: 'قاعدة البيانات غير موجودة' };
        }

        // اسم ملف النسخة الاحتياطية
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFileName = `backup-${timestamp}.db`;
        const backupPath = path.join(backupDir, backupFileName);

        // Use SQLite "VACUUM INTO" so the snapshot is transactionally consistent
        // even while the database is open and being written (WAL mode). A raw
        // copyFileSync of a live WAL database can miss the last committed pages
        // or produce a corrupt file. Single quotes in the path are SQL-escaped;
        // backslashes are literal in SQLite string literals (Windows-safe).
        const escapedPath = backupPath.replace(/'/g, "''");
        try {
            await prisma.$executeRawUnsafe(`VACUUM INTO '${escapedPath}'`);
        } catch (vacuumErr) {
            console.warn('[Backup] VACUUM INTO failed, falling back to file copy:', vacuumErr);
            fs.copyFileSync(sourcePath, backupPath);
        }

        console.log(`Backup created: ${backupPath}`);
        return { success: true, path: backupPath };
    } catch (error) {
        console.error('Backup failed:', error);
        return { success: false, error: (error as Error).message };
    }
};

// استعادة نسخة احتياطية
// NOTE: the caller MUST relaunch the app after a successful restore — the
// Prisma engine is disconnected here and the DB file is swapped underneath it.
export const restoreBackup = async (backupPath: string): Promise<{ success: boolean; error?: string }> => {
    try {
        const targetPath = getDbPath();

        if (!fs.existsSync(backupPath)) {
            return { success: false, error: 'ملف النسخة الاحتياطية غير موجود' };
        }

        // Safety snapshot of the current DB so a bad backup file is recoverable.
        try {
            if (fs.existsSync(targetPath)) {
                fs.copyFileSync(targetPath, `${targetPath}.pre-restore`);
            }
        } catch (snapErr) {
            console.warn('[Restore] Could not create pre-restore snapshot:', snapErr);
        }

        // Release the engine's handle before swapping the file (Windows locks it
        // otherwise) and so stale WAL pages can't be replayed over the new DB.
        try { await prisma.$disconnect(); } catch { /* already disconnected */ }

        fs.copyFileSync(backupPath, targetPath);

        // Remove sidecar WAL/SHM files belonging to the OLD database — leaving
        // them would let SQLite replay stale changes over the restored data.
        for (const sidecar of [`${targetPath}-wal`, `${targetPath}-shm`]) {
            try { if (fs.existsSync(sidecar)) fs.unlinkSync(sidecar); } catch { /* ignore */ }
        }

        console.log(`Backup restored from: ${backupPath}`);
        return { success: true };
    } catch (error) {
        console.error('Restore failed:', error);
        return { success: false, error: (error as Error).message };
    }
};

// الحصول على قائمة النسخ الاحتياطية
export const getBackupList = (): { name: string; path: string; date: Date; size: number }[] => {
    try {
        const backupDir = getBackupDir();
        const files = fs.readdirSync(backupDir);

        return files
            .filter(file => file.endsWith('.db'))
            .map(file => {
                const filePath = path.join(backupDir, file);
                const stats = fs.statSync(filePath);
                return {
                    name: file,
                    path: filePath,
                    date: stats.mtime,
                    size: stats.size
                };
            })
            .sort((a, b) => b.date.getTime() - a.date.getTime());
    } catch (error) {
        console.error('Error getting backup list:', error);
        return [];
    }
};

// حذف نسخ احتياطية قديمة (الاحتفاظ بآخر 10)
export const cleanupOldBackups = (keepCount: number = 10): void => {
    try {
        const backups = getBackupList();
        if (backups.length > keepCount) {
            const toDelete = backups.slice(keepCount);
            toDelete.forEach(backup => {
                fs.unlinkSync(backup.path);
                console.log(`Deleted old backup: ${backup.name}`);
            });
        }
    } catch (error) {
        console.error('Error cleaning up backups:', error);
    }
};
