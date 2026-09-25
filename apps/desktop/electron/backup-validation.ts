import fs from 'node:fs';

export async function validateBackupFile(file: string, open: (file: string) => any): Promise<void> {
    const fd = fs.openSync(file, 'r');
    const header = Buffer.alloc(16);
    try { fs.readSync(fd, header, 0, 16, 0); } finally { fs.closeSync(fd); }
    if (!header.equals(Buffer.from('SQLite format 3\0'))) throw Error('ملف النسخة ليس قاعدة SQLite صالحة');
    const db = open(file);
    try {
        const rows = await db.$queryRawUnsafe('PRAGMA integrity_check');
        if (rows.length !== 1 || Object.values(rows[0])[0] !== 'ok') throw Error('فشل فحص سلامة النسخة');
        const tables = await db.$queryRawUnsafe("SELECT name FROM sqlite_master WHERE type='table'");
        const names = new Set(tables.map((row: any) => row.name));
        if (!['Sale', 'SaleItem', 'Inventory', 'Batch', 'User'].every(name => names.has(name)))
            throw Error('النسخة لا تحتوي جداول فاراماس المطلوبة');
    } finally { await db.$disconnect(); }
}
