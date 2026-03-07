import { prisma } from "@/app/lib/prisma";


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
export async function getLowStockAlerts(branchId?: string, organizationId?: string): Promise<AlertItem[]> {
    const whereClause: any = {};
    if (branchId) whereClause.branchId = branchId;
    else if (organizationId) whereClause.branch = { organizationId: organizationId };

    const inventory = await prisma.inventory.findMany({
        where: whereClause,
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
        const totalQty = item.batches.reduce((acc: any, b: any) => acc + b.quantity, 0);

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
export async function getExpiryAlerts(branchId?: string, organizationId?: string): Promise<AlertItem[]> {
    const now = new Date();
    const ninetyDaysFromNow = new Date();
    ninetyDaysFromNow.setDate(ninetyDaysFromNow.getDate() + 90);

    const batchWhereClause: any = {
        expiryDate: { lte: ninetyDaysFromNow }
    };
    if (branchId) {
        batchWhereClause.inventory = { branchId: branchId };
    } else if (organizationId) {
        batchWhereClause.inventory = { branch: { organizationId: organizationId } };
    }

    const batches = await prisma.batch.findMany({
        where: batchWhereClause,
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

    return alerts.sort((a: any, b: any) => (a.daysLeft || 0) - (b.daysLeft || 0));
}

// جلب جميع الإشعارات
export async function getAllAlerts(branchId?: string, organizationId?: string): Promise<AlertItem[]> {
    const [lowStock, expiry] = await Promise.all([
        getLowStockAlerts(branchId, organizationId),
        getExpiryAlerts(branchId, organizationId)
    ]);

    return [...lowStock, ...expiry];
}

// إحصائيات الإشعارات
export async function getAlertStats(branchId?: string, organizationId?: string) {
    const alerts = await getAllAlerts(branchId, organizationId);

    return {
        total: alerts.length,
        lowStock: alerts.filter(a => a.type === 'low_stock').length,
        expired: alerts.filter(a => a.type === 'expired').length,
        expiring: alerts.filter(a => a.type === 'expiring').length,
        danger: alerts.filter(a => a.severity === 'danger').length,
        warning: alerts.filter(a => a.severity === 'warning').length
    };
}
