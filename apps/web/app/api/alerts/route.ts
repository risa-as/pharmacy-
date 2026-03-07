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

        const whereClause: any = {
            expiryDate: {
                lte: ninetyDaysFromNow, // Expiring in next 90 days OR already expired
            },
            quantity: { gt: 0 }
        };

        whereClause.inventory = {
            ...tenantBranchWhere,
            ...(branchId ? { branchId } : {})
        };

        const batches = await prisma.batch.findMany({
            where: whereClause,
            include: {
                inventory: {
                    include: {
                        drug: {
                            select: {
                                tradeName: true,
                                scientificName: true
                            }
                        },
                        branch: {
                            select: { name: true }
                        }
                    }
                }
            },
            orderBy: {
                expiryDate: 'asc'
            }
        });

        // Format for mobile
        const alerts = batches.map(batch => {
            const isExpired = new Date(batch.expiryDate) < today;
            const daysDiff = Math.ceil((new Date(batch.expiryDate).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

            let title = '';
            let type = 'warning';
            let dateText = batch.expiryDate.toISOString().split('T')[0];

            const drugName = batch.inventory?.drug?.tradeName || 'دواء غير معروف';
            const branchName = batch.inventory?.branch?.name || 'فرع غير معروف';

            if (isExpired) {
                title = `منتهي الصلاحية: ${drugName}`;
                type = 'critical';
                const daysAgo = Math.abs(daysDiff);
                dateText = `منتهي منذ ${daysAgo} يوم (${dateText})`;
            } else {
                title = `قارب على الانتهاء: ${drugName}`;
                type = 'warning';
                dateText = `ينتهي خلال ${daysDiff} يوم (${dateText})`;
            }

            return {
                id: batch.id,
                title: title,
                description: `الكمية: ${batch.quantity} - ${branchName}`,
                date: dateText,
                type: type
            };
        });

        return NextResponse.json(alerts);
    } catch (error) {
        console.error("Alerts API Error:", error);
        return NextResponse.json({ message: "Failed to fetch alerts" }, { status: 500 });
    }
}
