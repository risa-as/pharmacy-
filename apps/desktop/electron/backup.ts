import { app } from 'electron';
import fs from 'fs';
import path from 'path';
// Single source of truth for the DB location — must match where Prisma actually
// reads/writes the database, otherwise backups silently target the wrong file.
import { getDbPath, prisma, openBackupReader } from './db';
import { randomUUID } from 'node:crypto';
import { validateBackupFile } from './backup-validation';
import { withDatabaseRestore } from './database-maintenance';

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
    let incomplete: string | undefined;
    try {
        const sourcePath = getDbPath();
        const backupDir = getBackupDir();

        if (!fs.existsSync(sourcePath)) {
            return { success: false, error: 'قاعدة البيانات غير موجودة' };
        }

        // اسم ملف النسخة الاحتياطية
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFileName = `backup-${timestamp}-${randomUUID().slice(0, 8)}.db`;
        const backupPath = path.join(backupDir, backupFileName);
        incomplete = backupPath;

        // Use SQLite "VACUUM INTO" so the snapshot is transactionally consistent
        // even while the database is open and being written (WAL mode). A raw
        // copyFileSync of a live WAL database can miss the last committed pages
        // or produce a corrupt file. Single quotes in the path are SQL-escaped;
        // backslashes are literal in SQLite string literals (Windows-safe).
        const escapedPath = backupPath.replace(/'/g, "''");
        // Never fall back to copying a live WAL database: that can silently
        // omit committed sales. Surface the failure and keep earlier backups.
        await prisma.$executeRawUnsafe(`VACUUM INTO '${escapedPath}'`);
        await validateBackupFile(backupPath, openBackupReader);
        incomplete = undefined;

        console.log(`Backup created: ${backupPath}`);
        return { success: true, path: backupPath };
    } catch (error) {
        if (incomplete && fs.existsSync(incomplete)) fs.unlinkSync(incomplete);
        console.error('Backup failed:', error);
        return { success: false, error: (error as Error).message };
    }
};

// استعادة نسخة احتياطية
// NOTE: the caller MUST relaunch the app after a successful restore — the
// Prisma engine is disconnected here and the DB file is swapped underneath it.
export const restoreBackup = async (backupPath: string): Promise<{ success: boolean; error?: string }> => withDatabaseRestore(async () => {
    try {
        const targetPath = getDbPath();

        if (!fs.existsSync(backupPath)) {
            return { success: false, error: 'ملف النسخة الاحتياطية غير موجود' };
        }

        // Validate an immutable staged copy before touching the active database.
        const staged = `${targetPath}.restore-${randomUUID()}`;
        fs.copyFileSync(backupPath, staged);
        try {
            await validateBackupFile(staged, openBackupReader);
            const safety = await createBackup();
            if (!safety.success) throw Error('تعذر حفظ نسخة أمان؛ لم تبدأ الاستعادة');
            // Abort if checkpoint cannot drain active WAL readers/writers.
            const checkpoint = await prisma.$queryRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE)');
            if (checkpoint.some((row: any) => Number(row.busy) !== 0))
                throw Error('قاعدة البيانات مشغولة؛ أعد المحاولة بعد اكتمال العمليات');
            await prisma.$disconnect();
            // Keep the old database intact for recovery even if replacement fails.
            const previous = `${targetPath}.pre-restore-${randomUUID()}`;
            fs.renameSync(targetPath, previous);
            try {
                for (const sidecar of [`${targetPath}-wal`, `${targetPath}-shm`]) {
                    if (fs.existsSync(sidecar)) fs.unlinkSync(sidecar);
                }
                fs.renameSync(staged, targetPath);
            } catch (error) {
                fs.renameSync(previous, targetPath);
                throw error;
            }
        } finally {
            if (fs.existsSync(staged)) fs.unlinkSync(staged);
        }

        console.log(`Backup restored from: ${backupPath}`);
        return { success: true };
    } catch (error) {
        console.error('Restore failed:', error);
        return { success: false, error: (error as Error).message };
    }
});

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
