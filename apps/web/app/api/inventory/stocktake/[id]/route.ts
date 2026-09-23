import {
  readStocktakeReason,
  stocktakeReasons,
} from "@/app/lib/stocktake-reasons";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getTenantContext } from "@/app/lib/tenant-utils";
export const dynamic = "force-dynamic";
export async function GET(
  _req: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const ctx = await getTenantContext();
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.userPermissions.canDoStocktake)
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  const { id } = await props.params;
  const stocktake = await prisma.stocktake.findFirst({
    where: { AND: [ctx.tenantBranchWhere, { id }] },
    include: {
      items: {
        include: {
          batch: { include: { inventory: { include: { drug: true } } } },
        },
      },
      user: { select: { name: true, email: true } },
    },
  });
  return stocktake
    ? NextResponse.json({ stocktake })
    : NextResponse.json({ error: "الجرد غير موجود" }, { status: 404 });
}
async function change(
  req: NextRequest,
  props: { params: Promise<{ id: string }> },
  cancel = false,
) {
  const ctx = await getTenantContext();
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.userPermissions.canDoStocktake)
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  const { id } = await props.params;
  try {
    const body = cancel ? { status: "CANCELLED" } : await req.json();
    if (body.reviewNote != null && (typeof body.reviewNote !== "string" || body.reviewNote.length > 1000)) throw new Error("ملاحظة المراجعة غير صالحة");
    const reviewing = body.action === "APPROVE" || body.action === "RECOUNT";
    if (body.action && !reviewing)
      return NextResponse.json({ error: "إجراء غير صالح" }, { status: 400 });
    if (
      reviewing &&
      !["ADMIN", "MANAGER", "SUPER_ADMIN"].includes(ctx.user.role)
    )
      return NextResponse.json(
        { error: "اعتماد العجز وطلب إعادة العد متاحان للمدير فقط" },
        { status: 403 },
      );
    if (
      !["PENDING", "COMPLETED", "CANCELLED"].includes(body.status || "PENDING")
    )
      throw new Error("حالة غير صالحة");
    const stocktake = await prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Stocktake" WHERE id=${id} FOR UPDATE`;
        const current = await tx.stocktake.findFirst({
          where: { AND: [ctx.tenantBranchWhere, { id }] },
          include: { items: true },
        });
        if (!current) throw new Error("الجرد خارج نطاقك");
        if (reviewing) {
          if (body.action === "APPROVE" && current.status === "COMPLETED")
            return current;
          if (body.action === "RECOUNT" && current.status === "PENDING")
            return current;
          if (current.status !== "REVIEW")
            throw new Error("الجرد ليس بانتظار المراجعة");
          if (body.action === "RECOUNT") {
            await tx.auditLog.create({
              data: {
                userId: ctx.user.id,
                userName: ctx.user.name || ctx.user.id,
                action: "UPDATE",
                entity: "STOCKTAKE",
                entityId: id,
                branchId: current.branchId,
                details: JSON.stringify({
                  action: "RECOUNT",
                  reviewNote: body.reviewNote?.trim() || null,
                  previousItems: current.items,
                }),
              },
            });
            // No stock was posted: reset to a fresh count, retaining the previous count in the audit.
            await tx.stocktakeItem.deleteMany({ where: { stocktakeId: id } });
            return tx.stocktake.update({
              where: { id },
              data: { status: "PENDING", totalDiscrepancyAmount: 0, notes: [current.notes, `طلب المدير إعادة العد${body.reviewNote?.trim() ? ": " + body.reviewNote.trim() : ""}`].filter(Boolean).join("\n") },
            });
          }
          body.status = "COMPLETED";
          body.items = current.items.map((item) => ({
            ...item,
            ...readStocktakeReason(item.reason),
          }));
        } else if (current.status !== "PENDING") {
          if (
            current.status === body.status ||
            (current.status === "REVIEW" && body.status === "COMPLETED")
          )
            return current;
          throw new Error("الجرد مغلق للتحرير؛ راجع المدير");
        }
        if (cancel)
          return tx.stocktake.update({
            where: { id },
            data: { status: "CANCELLED" },
          });
        if (
          !Array.isArray(body.items) ||
          body.items.length > 3000 ||
          new Set(body.items.map((i: any) => i.batchId)).size !==
            body.items.length
        )
          throw new Error("بنود غير صالحة أو مكررة");
        if (body.status === "COMPLETED" && !body.items.length)
          throw new Error("أضف دفعة معدودة قبل الاعتماد");
        const lines = [];
        let total = 0;
        let confirmedDamage = 0;
        const classifications: {
          batchId: string;
          reasonCode: string;
          difference: number;
        }[] = [];
        for (const input of [...body.items].sort((a: any, b: any) =>
          String(a.batchId).localeCompare(String(b.batchId)),
        )) {
          if (
            typeof input.batchId !== "string" ||
            !Number.isSafeInteger(input.actualQuantity) ||
            input.actualQuantity < 0 ||
            !Number.isSafeInteger(input.systemQuantity)
          )
            throw new Error("أدخل أعداداً صحيحة غير سالبة");
          await tx.$queryRaw`SELECT id FROM "Batch" WHERE id=${input.batchId} FOR UPDATE`;
          const batch = await tx.batch.findFirst({
            where: {
              id: input.batchId,
              inventory: { branchId: current.branchId },
            },
          });
          if (!batch) throw new Error("الدفعة لا تنتمي لفرع الجرد");
          if (batch.quantity !== input.systemQuantity)
            throw new Error(
              "تغير مخزون إحدى الدفعات منذ عرضها؛ حدّث وأعد العد قبل الحفظ.",
            );
          const difference = input.actualQuantity - batch.quantity;
          const unitCost = reviewing ? input.costPrice : batch.costPrice;
          const code = input.reasonCode ?? "UNKNOWN";
          const classification = stocktakeReasons.find(
            (option) => option.value === code,
          );
          if (!classification) throw new Error("تصنيف فرق الجرد غير صالح");
          if (
            input.reason != null &&
            (typeof input.reason !== "string" || input.reason.length > 2000)
          )
            throw new Error("الملاحظة يجب أن تكون نصاً لا يتجاوز 2000 حرف");
          if (difference)
            classifications.push({
              batchId: batch.id,
              reasonCode: code,
              difference,
            });
          if (difference < 0 && code === "DAMAGE")
            confirmedDamage += -difference * unitCost;
          total += difference * unitCost;
          lines.push({
            stocktakeId: id,
            batchId: batch.id,
            systemQuantity: batch.quantity,
            actualQuantity: input.actualQuantity,
            difference,
            costPrice: unitCost,
            reason: difference
              ? `تصنيف الجرد: ${classification.label}\n${(input.reason || "").trim()}`
              : (input.reason || "").trim() || null,
          });
        }
        const needsReview =
          body.status === "COMPLETED" &&
          !reviewing &&
          lines.some((line) => line.difference < 0);
        const finalStatus = needsReview ? "REVIEW" : body.status || "PENDING";
        const shortage = lines.reduce(
          (sum, line) =>
            sum + (line.difference < 0 ? -line.difference * line.costPrice : 0),
          0,
        );
        await tx.stocktakeItem.deleteMany({ where: { stocktakeId: id } });
        if (lines.length) await tx.stocktakeItem.createMany({ data: lines });
        if (finalStatus === "COMPLETED") {
          for (const line of lines)
            await tx.batch.update({
              where: { id: line.batchId },
              data: {
                quantity: line.actualQuantity,
                ...(line.difference > 0
                  ? { initialQuantity: { increment: line.difference } }
                  : {}),
              },
            });
          if (shortage - confirmedDamage > 0)
            await tx.expense.create({
              data: {
                branchId: current.branchId,
                amount: shortage - confirmedDamage,
                category: "عجز جرد",
                description: `عجز معتمد ضمن الجرد ${current.documentNumber || id}`,
                date: new Date(),
              },
            });
          if (confirmedDamage > 0)
            await tx.expense.create({
              data: {
                branchId: current.branchId,
                amount: confirmedDamage,
                category: "توالف مؤكدة بالجرد",
                description: `تلف مؤكد ضمن الجرد ${current.documentNumber || id}`,
                date: new Date(),
              },
            });
        }
        await tx.auditLog.create({
          data: {
            userId: ctx.user.id,
            userName: ctx.user.name || ctx.user.id,
            action: "UPDATE",
            entity: "STOCKTAKE",
            entityId: id,
            branchId: current.branchId,
            details: JSON.stringify({
              status: finalStatus,
              total,
              confirmedDamage,
              action: body.action || "COUNT",
              shortage,
              classifications,
            }),
          },
        });
        return tx.stocktake.update({
          where: { id },
          data: {
            status: finalStatus,
            totalDiscrepancyAmount: total,
            notes: typeof body.notes === "string" ? body.notes : current.notes,
          },
          include: { items: true },
        });
      },
      { maxWait: 20000, timeout: 30000 },
    );
    return NextResponse.json({ success: true, stocktake });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "تعذر تحديث الجرد" },
      { status: 409 },
    );
  }
}
export async function PUT(
  req: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  return change(req, props);
}
export async function DELETE(
  req: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  return change(req, props, true);
}
