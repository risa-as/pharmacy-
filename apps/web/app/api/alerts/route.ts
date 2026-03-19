export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getTenantContext } from '@/app/lib/tenant-utils';

export async function GET(req: Request) {
    try {
        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;
        const { tenantBranchWhere } = tenantCtx;

        const { searchParams } = new URL(req.url);
        const branchId = searchParams.get('branchId');

        const today = new Date();
        const ninetyDaysFromNow = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000);

        const branchFilter = {
            ...tenantBranchWhere,
            ...(branchId ? { branchId } : {}),
        };

        // ── 1. Expiry alerts: batches expiring within 90 days (including already expired) ──
        const expiringBatches = await prisma.batch.findMany({
            where: {
                expiryDate: { lte: ninetyDaysFromNow },
                quantity: { gt: 0 },
                inventory: branchFilter,
            },
            include: {
                inventory: {
                    include: {
                        drug: { select: { tradeName: true, scientificName: true } },
                        branch: { select: { name: true } },
                    },
                },
            },
            orderBy: { expiryDate: 'asc' },
        });

        // ── 2. Stock alerts: all inventories to check quantity vs minStock ──
        const inventories = await prisma.inventory.findMany({
            where: branchFilter,
            include: {
                batches: { select: { quantity: true }, where: { quantity: { gt: 0 } } },
                drug: { select: { tradeName: true, scientificName: true } },
                branch: { select: { name: true } },
            },
        });

        const alerts: any[] = [];

        // ── Build expiry alerts ──
        for (const batch of expiringBatches) {
            const isExpired = new Date(batch.expiryDate) < today;
            const daysDiff = Math.ceil(
                (new Date(batch.expiryDate).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
            );
            const drugName = batch.inventory?.drug?.tradeName ?? 'دواء غير معروف';
            const branchName = batch.inventory?.branch?.name ?? 'فرع غير معروف';
            const dateStr = batch.expiryDate.toISOString().split('T')[0];

            if (isExpired) {
                alerts.push({
                    id: `exp-${batch.id}`,
                    type: 'EXPIRED',
                    title: `منتهي الصلاحية: ${drugName}`,
                    description: `الكمية المتبقية: ${batch.quantity} · ${branchName}`,
                    date: `انتهى منذ ${Math.abs(daysDiff)} يوم (${dateStr})`,
                    priority: 1,
                });
            } else {
                alerts.push({
                    id: `exp-${batch.id}`,
                    type: 'EXPIRY',
                    title: `يقترب من الانتهاء: ${drugName}`,
                    description: `الكمية: ${batch.quantity} · ${branchName}`,
                    date: `ينتهي خلال ${daysDiff} يوم (${dateStr})`,
                    priority: daysDiff <= 30 ? 3 : 4,
                });
            }
        }

        // ── Build stock alerts ──
        for (const inv of inventories) {
            const totalQty = inv.batches.reduce((sum: number, b: any) => sum + b.quantity, 0);
            const drugName = inv.drug?.tradeName ?? 'دواء غير معروف';
            const branchName = inv.branch?.name ?? 'فرع غير معروف';

            if (totalQty === 0) {
                alerts.push({
                    id: `stock-${inv.id}`,
                    type: 'OUT_OF_STOCK',
                    title: `نفاد المخزون: ${drugName}`,
                    description: `لا يوجد مخزون متاح · ${branchName}`,
                    date: null,
                    priority: 0,
                });
            } else if (inv.minStock > 0 && totalQty < inv.minStock) {
                alerts.push({
                    id: `stock-${inv.id}`,
                    type: 'LOW_STOCK',
                    title: `مخزون منخفض: ${drugName}`,
                    description: `المتبقي: ${totalQty} · الحد الأدنى: ${inv.minStock} · ${branchName}`,
                    date: null,
                    priority: 2,
                });
            }
        }

        // ── Sort: OUT_OF_STOCK → EXPIRED → LOW_STOCK → EXPIRY (nearest first) ──
        alerts.sort((a, b) => {
            if (a.priority !== b.priority) return a.priority - b.priority;
            return a.title.localeCompare(b.title, 'ar');
        });

        return NextResponse.json(alerts);
    } catch (error: any) {
        console.error('Alerts API Error:', error);
        return NextResponse.json({ message: 'Failed to fetch alerts' }, { status: 500 });
    }
}
