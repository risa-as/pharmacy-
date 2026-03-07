import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { sendAndPersistNotification } from "@/app/lib/notifications/notificationTriggers";
import { getTenantContext } from "@/app/lib/tenant-utils";

export async function POST(req: Request) {
    try {
        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;

        const body = await req.json();
        const { branchId, supplierId, items } = body;

        if (!branchId || !supplierId || !items || !Array.isArray(items) || items.length === 0) {
            return NextResponse.json({ message: "Invalid request data" }, { status: 400 });
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
                        body: `تم إنشاء طلب شراء جديد بقيمة ${total.toLocaleString('ar-IQ')} د.ع`,
                        targetUserIds: managers.map(m => m.id),
                        branchId,
                        data: { purchaseId: purchase.id },
                    });
                }
            } catch (triggerErr) {
                console.error('[create-purchase] New-purchase trigger failed:', triggerErr);
            }
        })();

        return NextResponse.json({ success: true, purchaseId: purchase.id });
    } catch (error) {
        console.error("Create Purchase API Error:", error);
        return NextResponse.json({ message: "Failed to create purchase" }, { status: 500 });
    }
}
