"use server";

import { prisma } from "@/app/lib/prisma";
import { revalidatePath } from "next/cache";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { NextResponse } from "next/server";
import { logAudit } from "@/app/lib/audit";

/**
 * Write off (dispose) an expired or damaged batch.
 *
 * Mechanism:
 *  - Zeroes the batch quantity so it leaves available stock.
 *  - Records the lost value (quantity × cost price) as an Expense in the
 *    "إتلاف مخزون" category for P&L visibility. This does NOT touch any cash
 *    safe — the loss is a book write-down, not a cash outflow.
 *  - Writes an audit-log entry. The action cannot be undone.
 */
export async function writeOffExpiredBatch(batchId: string) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return { success: false, message: "غير مصرح" };
    if (!tenantCtx.userPermissions.canDoStocktake) {
        return { success: false, message: "ليس لديك صلاحية لشطب الدفعات." };
    }

    const { user } = tenantCtx;

    // Scope the batch to the caller's tenant via the inventory's branch.
    const batch = await prisma.batch.findFirst({
        where: { id: batchId, inventory: tenantCtx.tenantBranchWhere },
        include: { inventory: { include: { drug: true } } },
    });

    if (!batch) return { success: false, message: "الدفعة غير موجودة أو لا تخص حسابك" };
    if (batch.quantity <= 0) return { success: false, message: "هذه الدفعة مشطوبة بالفعل" };

    const quantity = batch.quantity;
    const lossValue = quantity * batch.costPrice;
    const branchId = batch.inventory.branchId;
    const drugName = batch.inventory.drug.tradeName;

    try {
        await prisma.$transaction([
            // 1. Zero the batch — it leaves available stock.
            prisma.batch.update({ where: { id: batchId }, data: { quantity: 0 } }),
            // 2. Record the loss as an expense (only when it has value).
            ...(lossValue > 0
                ? [
                    prisma.expense.create({
                        data: {
                            branchId,
                            amount: lossValue,
                            category: "إتلاف مخزون",
                            description: `شطب دفعة منتهية: ${drugName} (دفعة ${batch.batchNumber}) — الكمية ${quantity}`,
                            date: new Date(),
                        },
                    }),
                ]
                : []),
        ]);

        await logAudit({
            userId: user.id,
            userName: user.name ?? user.email ?? "Unknown",
            action: "WRITE_OFF",
            entity: "INVENTORY",
            entityId: batchId,
            details: JSON.stringify({ drugName, batchNumber: batch.batchNumber, quantity, lossValue }),
            branchId,
        });

        revalidatePath("/dashboard/inventory/expired-damaged");
        revalidatePath("/dashboard/expenses");
        revalidatePath("/dashboard/alerts");

        return { success: true, quantity, lossValue };
    } catch (error: any) {
        console.error("writeOffExpiredBatch error:", error);
        return { success: false, message: error.message || "فشل شطب الدفعة" };
    }
}
