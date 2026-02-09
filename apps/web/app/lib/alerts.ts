import { PrismaClient } from "@prisma/client";

const globalForPrisma = global as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export interface AlertItem {
    id: string;
    type: 'low_stock' | 'expiring' | 'expired';
    drugName: string;
    branchName: string;
    quantity?: number;
    minStock?: number;
    expiryDate?: Date;
    daysLeft?: number;
    severity: 'warning' | 'danger';
}

// جلب إشعارات نقص المخزون
export async function getLowStockAlerts(): Promise<AlertItem[]> {
    const inventory = await prisma.inventory.findMany({
        include: {
            branch: true,
            batches: true
        }
    });

    // جلب الأدوية
    const drugIds = inventory.map(i => i.drugId);
    const uniqueDrugIds = drugIds.filter((id, index) => drugIds.indexOf(id) === index);
    const drugs = await prisma.globalDrug.findMany({
        where: { id: { in: uniqueDrugIds } },
        select: { id: true, tradeName: true }
    });
    const drugMap = new Map(drugs.map(d => [d.id, d]));

    const alerts: AlertItem[] = [];

    for (const item of inventory) {
        const totalQty = item.batches.reduce((acc, b) => acc + b.quantity, 0);

        if (totalQty <= item.minStock) {
            const drug = drugMap.get(item.drugId);
            alerts.push({
                id: item.id,
                type: 'low_stock',
                drugName: drug?.tradeName || 'غير معروف',
                branchName: item.branch?.name || 'غير معروف',
                quantity: totalQty,
                minStock: item.minStock,
                severity: totalQty === 0 ? 'danger' : 'warning'
            });
        }
    }

    return alerts;
}

// جلب إشعارات الأدوية منتهية أو قاربت على انتهاء الصلاحية
export async function getExpiryAlerts(): Promise<AlertItem[]> {
    const now = new Date();
    const ninetyDaysFromNow = new Date();
    ninetyDaysFromNow.setDate(ninetyDaysFromNow.getDate() + 90);

    const batches = await prisma.batch.findMany({
        where: {
            expiryDate: { lte: ninetyDaysFromNow }
        },
        include: {
            inventory: {
                include: {
                    branch: true
                }
            }
        }
    });

    // جلب الأدوية
    const drugIds = batches.map(b => b.inventory.drugId);
    const uniqueDrugIds = drugIds.filter((id, index) => drugIds.indexOf(id) === index);
    const drugs = await prisma.globalDrug.findMany({
        where: { id: { in: uniqueDrugIds } },
        select: { id: true, tradeName: true }
    });
    const drugMap = new Map(drugs.map(d => [d.id, d]));

    const alerts: AlertItem[] = [];

    for (const batch of batches) {
        const drug = drugMap.get(batch.inventory.drugId);
        const expiryDate = new Date(batch.expiryDate);
        const isExpired = expiryDate < now;
        const daysLeft = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        alerts.push({
            id: batch.id,
            type: isExpired ? 'expired' : 'expiring',
            drugName: drug?.tradeName || 'غير معروف',
            branchName: batch.inventory.branch?.name || 'غير معروف',
            quantity: batch.quantity,
            expiryDate: expiryDate,
            daysLeft: daysLeft,
            severity: isExpired || daysLeft <= 30 ? 'danger' : 'warning'
        });
    }

    return alerts.sort((a, b) => (a.daysLeft || 0) - (b.daysLeft || 0));
}

// جلب جميع الإشعارات
export async function getAllAlerts(): Promise<AlertItem[]> {
    const [lowStock, expiry] = await Promise.all([
        getLowStockAlerts(),
        getExpiryAlerts()
    ]);

    return [...lowStock, ...expiry];
}

// إحصائيات الإشعارات
export async function getAlertStats() {
    const alerts = await getAllAlerts();

    return {
        total: alerts.length,
        lowStock: alerts.filter(a => a.type === 'low_stock').length,
        expired: alerts.filter(a => a.type === 'expired').length,
        expiring: alerts.filter(a => a.type === 'expiring').length,
        danger: alerts.filter(a => a.severity === 'danger').length,
        warning: alerts.filter(a => a.severity === 'warning').length
    };
}
