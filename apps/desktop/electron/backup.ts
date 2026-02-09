import { app } from 'electron';
import fs from 'fs';
import path from 'path';

// مسار قاعدة البيانات المحلية
const getDbPath = () => {
    return path.join(app.getPath('userData'), 'prisma', 'local.db');
};

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
        const dbPath = getDbPath();
        const backupDir = getBackupDir();

        // التحقق من وجود قاعدة البيانات
        // في وضع التطوير، قاعدة البيانات في مكان مختلف
        const devDbPath = path.join(process.cwd(), 'prisma', 'local.db');
        const sourcePath = fs.existsSync(dbPath) ? dbPath : devDbPath;

        if (!fs.existsSync(sourcePath)) {
            return { success: false, error: 'قاعدة البيانات غير موجودة' };
        }

        // اسم ملف النسخة الاحتياطية
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFileName = `backup-${timestamp}.db`;
        const backupPath = path.join(backupDir, backupFileName);

        // نسخ الملف
        fs.copyFileSync(sourcePath, backupPath);

        console.log(`Backup created: ${backupPath}`);
        return { success: true, path: backupPath };
    } catch (error) {
        console.error('Backup failed:', error);
        return { success: false, error: (error as Error).message };
    }
};

// استعادة نسخة احتياطية
export const restoreBackup = async (backupPath: string): Promise<{ success: boolean; error?: string }> => {
    try {
        const dbPath = getDbPath();
        const devDbPath = path.join(process.cwd(), 'prisma', 'local.db');
        const targetPath = fs.existsSync(dbPath) ? dbPath : devDbPath;

        if (!fs.existsSync(backupPath)) {
            return { success: false, error: 'ملف النسخة الاحتياطية غير موجود' };
        }

        // نسخ الملف
        fs.copyFileSync(backupPath, targetPath);

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
