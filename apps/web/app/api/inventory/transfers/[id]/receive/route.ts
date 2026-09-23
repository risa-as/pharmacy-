import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { decideNewInventoryPricing } from "@/app/lib/inventory-pricing";
import { transferAccess } from "@/app/lib/transfer-access";
export const dynamic = "force-dynamic";
export async function PUT(
  _req: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const ctx = await transferAccess();
  if (ctx instanceof NextResponse) return ctx;
  const { id } = await props.params;
  try {
    const result = await prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Transfer" WHERE id=${id} FOR UPDATE`;
        const transfer = await tx.transfer.findFirst({
          where: { id, toBranch: ctx.branchModelWhere },
          include: { items: true },
        });
        if (!transfer)
          throw new Error("التحويل غير موجود في فروع الاستلام المصرح بها");
        if (transfer.status === "COMPLETED")
          return { success: true, replayed: true };
        if (transfer.status !== "IN_TRANSIT")
          throw new Error("لا يمكن استلام هذه الحالة");
        const destination = await tx.branch.findUniqueOrThrow({
          where: { id: transfer.toBranchId },
          select: { organization: { select: { minProfitMargin: true } } },
        });
        for (const item of transfer.items) {
          const sourceInventory = await tx.inventory.findUnique({
            where: {
              drugId_branchId: {
                drugId: item.drugId,
                branchId: transfer.fromBranchId,
              },
            },
            select: { price: true },
          });
          const pricing = decideNewInventoryPricing({
            cost: item.costPrice,
            minProfitMargin: destination.organization.minProfitMargin,
          });
          const price =
            sourceInventory && sourceInventory.price > 0
              ? sourceInventory.price
              : pricing.price;
          const inv = await tx.inventory.upsert({
            where: {
              drugId_branchId: {
                drugId: item.drugId,
                branchId: transfer.toBranchId,
              },
            },
            create: {
              drugId: item.drugId,
              branchId: transfer.toBranchId,
              cost: item.costPrice,
              price,
            },
            update: {},
          });
          // Keep each receipt separate so supplier/purchase provenance is never merged accidentally.
          await tx.batch.create({
            data: {
              inventoryId: inv.id,
              batchNumber: item.batchNumber,
              expiryDate: item.expiryDate,
              quantity: item.quantity,
              initialQuantity: item.quantity,
              costPrice: item.costPrice,
            },
          });
        }
        await tx.transfer.update({
          where: { id },
          data: { status: "COMPLETED" },
        });
        await tx.auditLog.create({
          data: {
            userId: ctx.user.id,
            userName: ctx.user.name || ctx.user.id,
            action: "UPDATE",
            entity: "TRANSFER",
            entityId: id,
            branchId: transfer.toBranchId,
            details: "received",
          },
        });
        return { success: true };
      },
      { maxWait: 20000, timeout: 30000 },
    );
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "تعذر الاستلام" },
      { status: 409 },
    );
  }
}
