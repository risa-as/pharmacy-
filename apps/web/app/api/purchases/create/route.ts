export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { sendAndPersistNotification } from "@/app/lib/notifications/notificationTriggers";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { logAudit } from "@/app/lib/audit";

export async function POST(req: Request) {
    try {
        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;
        if (!tenantCtx.userPermissions.canCreatePurchase) {
            return NextResponse.json({ message: 'ليس لديك صلاحية لإنشاء طلبات الشراء.' }, { status: 403 });
        }

        const body = await req.json();
        const { branchId, supplierId, items } = body;

        if (!branchId || !supplierId || !items || !Array.isArray(items) || items.length === 0) {
            return NextResponse.json({ message: "Invalid request data" }, { status: 400 });
        }

        // Validate branchId belongs to the authenticated user's organization
        if (tenantCtx.user.role !== 'SUPER_ADMIN') {
            const branch = await prisma.branch.findUnique({
                where: { id: branchId },
                select: { organizationId: true }
            });
            if (!branch) {
                return NextResponse.json({ message: "Branch not found" }, { status: 404 });
            }
            if (tenantCtx.user.role === 'ADMIN') {
                if (branch.organizationId !== tenantCtx.user.organizationId) {
                    return NextResponse.json({ message: "Unauthorized: branch does not belong to your organization" }, { status: 403 });
                }
            } else {
                if (branchId !== tenantCtx.user.branchId) {
                    return NextResponse.json({ message: "Unauthorized: cannot create purchase for another branch" }, { status: 403 });
                }
            }
        }

        // Calculate total
        const total = items.reduce((sum: number, item: any) => sum + (item.quantity * item.cost), 0);

        const purchase = await prisma.purchase.create({
            data: {
                branchId,
                supplierId,
                total,
                status: 'PENDING',
                items: {
                    create: items.map((item: any) => ({
                        drugId: item.drugId,
                        quantity: item.quantity,
                        cost: item.cost
                    }))
                }
            }
        });

        // T034 — New-purchase trigger: notify managers/admins in the branch
        void (async () => {
            try {
                const managers = await prisma.user.findMany({
                    where: {
                        branchId,
                        role: { in: ['ADMIN', 'MANAGER'] as any[] },
                    },
                    select: { id: true },
                });
                if (managers.length > 0) {
                    await sendAndPersistNotification({
                        type: 'NEW_PURCHASE',
                        title: 'طلب شراء جديد',
                        body: `تم إنشاء طلب شراء جديد بقيمة ${total.toLocaleString('en-US')} د.ع`,
                        targetUserIds: managers.map((m: any) => m.id),
                        branchId,
                        data: { purchaseId: purchase.id },
                    });
                }
            } catch (triggerErr) {
                console.error('[create-purchase] New-purchase trigger failed:', triggerErr);
            }
        })();

        await logAudit({
            userId: tenantCtx.user.id,
            userName: tenantCtx.user.name ?? tenantCtx.user.email ?? 'Unknown',
            action: 'CREATE',
            entity: 'PURCHASE',
            entityId: purchase.id,
            details: JSON.stringify({ branchId, supplierId, total, itemCount: items.length }),
            branchId,
        });

        return NextResponse.json({ success: true, purchaseId: purchase.id });
    } catch (error) {
        console.error("Create Purchase API Error:", error);
        return NextResponse.json({ message: "Failed to create purchase" }, { status: 500 });
    }
}
