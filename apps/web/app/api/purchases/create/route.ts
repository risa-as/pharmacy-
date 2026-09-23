import { mobileOperation } from "@/app/lib/mobile-operation";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { sendAndPersistNotification } from "@/app/lib/notifications/notificationTriggers";
import { getTenantContext } from "@/app/lib/tenant-utils";

export async function POST(req: Request) {
  try {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return tenantCtx;
    if (!tenantCtx.userPermissions.canCreatePurchase) {
      return NextResponse.json(
        { message: "ليس لديك صلاحية لإنشاء طلبات الشراء." },
        { status: 403 },
      );
    }

    const body = await req.json();
    const { branchId, supplierId, items } = body;

    if (
      !branchId ||
      !supplierId ||
      !items ||
      !Array.isArray(items) ||
      items.length === 0
    ) {
      return NextResponse.json(
        { message: "Invalid request data" },
        { status: 400 },
      );
    }

    const branch = await prisma.branch.findFirst({
      where: { AND: [tenantCtx.branchModelWhere, { id: branchId }] },
    });
    if (!branch)
      return NextResponse.json(
        { message: "الفرع خارج نطاقك" },
        { status: 403 },
      );
    const supplier = await prisma.supplier.findFirst({
      where: { id: supplierId, organizationId: branch.organizationId },
    });
    if (!supplier)
      return NextResponse.json(
        { message: "المورد خارج المؤسسة" },
        { status: 403 },
      );
    if (
      items.length > 500 ||
      items.some(
        (i: any) =>
          !i ||
          typeof i.drugId !== "string" ||
          !Number.isSafeInteger(i.quantity) ||
          i.quantity <= 0 ||
          typeof i.cost !== "number" ||
          !Number.isFinite(i.cost) ||
          i.cost < 0 ||
          i.cost > 1000000000,
      ) ||
      new Set(items.map((i: any) => i.drugId)).size !== items.length
    )
      return NextResponse.json({ message: "بنود غير صالحة" }, { status: 400 });
    const count = await prisma.globalDrug.count({
      where: {
        id: { in: items.map((i: any) => i.drugId) },
        OR: [
          { organizationId: null, warehouseId: null },
          { organizationId: branch.organizationId },
        ],
      },
    });
    if (count !== items.length)
      return NextResponse.json(
        { message: "صنف خارج المؤسسة" },
        { status: 403 },
      );

    // Calculate total
    const total = items.reduce(
      (sum: number, item: any) => sum + item.quantity * item.cost,
      0,
    );

    let createdNow = false;
    const purchase = await prisma.$transaction(
      (tx) =>
        mobileOperation(
          tx,
          tenantCtx.user.id,
          "purchase-create",
          body,
          async () => {
            const created = await tx.purchase.create({
              data: {
                branchId,
                supplierId,
                total,
                status: "PENDING",
                items: {
                  create: items.map((item: any) => ({
                    drugId: item.drugId,
                    quantity: item.quantity,
                    cost: item.cost,
                  })),
                },
              },
            });
            await tx.auditLog.create({
              data: {
                userId: tenantCtx.user.id,
                userName: tenantCtx.user.name ?? tenantCtx.user.id,
                action: "CREATE",
                entity: "PURCHASE",
                entityId: created.id,
                branchId,
                details: JSON.stringify({
                  supplierId,
                  total,
                  itemCount: items.length,
                }),
              },
            });
            createdNow = true;
            return created;
          },
        ),
      { maxWait: 20000, timeout: 30000 },
    );

    // T034 — New-purchase trigger: notify managers/admins in the branch
    if (createdNow)
      void (async () => {
        try {
          const managers = await prisma.user.findMany({
            where: {
              branchId,
              role: { in: ["ADMIN", "MANAGER"] as any[] },
            },
            select: { id: true },
          });
          if (managers.length > 0) {
            await sendAndPersistNotification({
              type: "NEW_PURCHASE",
              title: "طلب شراء جديد",
              body: `تم إنشاء طلب شراء جديد بقيمة ${total.toLocaleString("en-US")} د.ع`,
              targetUserIds: managers.map((m: any) => m.id),
              branchId,
              data: { purchaseId: purchase.id },
            });
          }
        } catch (triggerErr) {
          console.error(
            "[create-purchase] New-purchase trigger failed:",
            triggerErr,
          );
        }
      })();

    return NextResponse.json({ success: true, purchaseId: purchase.id });
  } catch (error) {
    console.error("Create Purchase API Error:", error);
    return NextResponse.json(
      { message: "Failed to create purchase" },
      { status: 500 },
    );
  }
}
