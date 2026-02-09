import { app, BrowserWindow, ipcMain, shell } from 'electron'
import path from 'node:path'
import { prisma } from './db';
import { startSyncService } from './sync';
import { createBackup, restoreBackup, getBackupList, cleanupOldBackups } from './backup';

const distPath = path.join(__dirname, '../dist');
process.env.DIST = distPath;
const publicPath = app.isPackaged ? distPath : path.join(distPath, '../public');
process.env.VITE_PUBLIC = publicPath;

let win: BrowserWindow | null
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

function createWindow() {
    win = new BrowserWindow({
        icon: path.join(publicPath, 'electron-vite.svg'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
        },
    })

    win.webContents.on('did-finish-load', () => {
        win?.webContents.send('main-process-message', (new Date).toLocaleString())
    })

    if (VITE_DEV_SERVER_URL) {
        win.loadURL(VITE_DEV_SERVER_URL)
    } else {
        win.loadFile(path.join(distPath, 'index.html'))
    }
}

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
    }
})

// نسخ احتياطي تلقائي عند إغلاق التطبيق
app.on('before-quit', async () => {
    console.log('Creating auto-backup before quit...');
    await createBackup();
    cleanupOldBackups(10);
});

app.whenReady().then(() => {
    createWindow();

    // Start Background Sync Service
    startSyncService();

    // IPC Handlers
    ipcMain.handle('get-users', async () => {
        return await prisma.user.findMany();
    });

    ipcMain.handle('get-products', async (event, searchTerm) => {
        try {
            const whereClause = searchTerm ? {
                OR: [
                    { tradeName: { contains: searchTerm } },
                    { barcode: { contains: searchTerm } }
                ]
            } : {};

            const products = await prisma.globalDrug.findMany({
                where: whereClause,
                include: {
                    inventory: true
                },
                take: 50
            });

            return products.map(p => ({
                id: p.id,
                name: p.tradeName,
                price: p.price,
                barcode: p.barcode,
                stock: p.inventory.reduce((acc, inv) => acc + inv.quantity, 0)
            }));
        } catch (error) {
            console.error("Error fetching products:", error);
            return [];
        }
    });

    ipcMain.handle('process-sale', async (event, { items, total }) => {
        try {
            return await prisma.$transaction(async (tx) => {
                const sale = await tx.sale.create({
                    data: {
                        total,
                        synced: false,
                        items: {
                            create: items.map((item: any) => ({
                                drugId: item.id,
                                quantity: item.quantity,
                                price: item.price
                            }))
                        }
                    }
                });

                for (const item of items) {
                    const inventory = await tx.inventory.findFirst({
                        where: { drugId: item.id }
                    });

                    if (inventory) {
                        await tx.inventory.update({
                            where: { id: inventory.id },
                            data: { quantity: { decrement: item.quantity } }
                        });
                    }
                }

                return { success: true, saleId: sale.id };
            });
        } catch (error) {
            console.error("Sale processing error:", error);
            return { success: false, error: "Transaction failed" };
        }
    });

    ipcMain.handle('seed-products', async () => {
        const count = await prisma.globalDrug.count();
        if (count === 0) {
            const drug1 = await prisma.globalDrug.create({
                data: {
                    id: '1', barcode: '111', tradeName: 'Panadol Extra', scientificName: 'Paracetamol', price: 15.0
                }
            });
            await prisma.inventory.create({
                data: { drugId: drug1.id, quantity: 100 }
            });

            const drug2 = await prisma.globalDrug.create({
                data: {
                    id: '2', barcode: '222', tradeName: 'Cataflam', scientificName: 'Diclofenac', price: 25.0
                }
            });
            await prisma.inventory.create({
                data: { drugId: drug2.id, quantity: 50 }
            });

            return "Seeded";
        }
        return "Already seeded";
    });

    // ===== IPC Handlers للنسخ الاحتياطي =====

    // إنشاء نسخة احتياطية
    ipcMain.handle('create-backup', async () => {
        const result = await createBackup();
        if (result.success && result.path) {
            return { success: true, message: 'تم إنشاء النسخة الاحتياطية بنجاح', path: result.path };
        }
        return { success: false, error: result.error };
    });

    // الحصول على قائمة النسخ الاحتياطية
    ipcMain.handle('get-backups', async () => {
        return getBackupList();
    });

    // استعادة نسخة احتياطية
    ipcMain.handle('restore-backup', async (event, backupPath) => {
        const result = await restoreBackup(backupPath);
        return result;
    });

    // فتح مجلد النسخ الاحتياطية
    ipcMain.handle('open-backup-folder', async () => {
        const backups = getBackupList();
        if (backups.length > 0) {
            const folderPath = path.dirname(backups[0].path);
            shell.openPath(folderPath);
            return true;
        }
        return false;
    });

    // Example: Seed if empty
    prisma.user.count().then(async (count) => {
        if (count === 0) {
            await prisma.user.create({
                data: {
                    id: '1',
                    name: 'Admin',
                    email: 'admin@local',
                    role: 'ADMIN',
                    password: 'admin' // In real app, hash this
                }
            });
            console.log("Seeded local admin user.");
        }
    });
});

