import { transferAccess } from "@/app/lib/transfer-access";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { mobileOperation } from "@/app/lib/mobile-operation";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const ctx = await transferAccess();
  if (ctx instanceof NextResponse) return ctx;
  const p = req.nextUrl.searchParams;
  const branchId = p.get("branchId") || ctx.user.branchId;
  if (
    !branchId ||
    !(await prisma.branch.findFirst({
      where: { AND: [ctx.branchModelWhere, { id: branchId }] },
    }))
  )
    return NextResponse.json({ error: "الفرع خارج نطاقك" }, { status: 403 });
  const type = p.get("type");
  if (type === "destinations") {
    const source = await prisma.branch.findUniqueOrThrow({
      where: { id: branchId },
    });
    return NextResponse.json({
      branches: await prisma.branch.findMany({
        where: { organizationId: source.organizationId, id: { not: branchId } },
        select: { id: true, name: true },
      }),
    });
  }
  const where =
    type === "incoming"
      ? { toBranchId: branchId }
      : type === "outgoing"
        ? { fromBranchId: branchId }
        : { OR: [{ fromBranchId: branchId }, { toBranchId: branchId }] };
  const page = Math.max(1, Math.min(100000, Math.floor(Number(p.get("page"))) || 1));
  const id = p.get("id");
  const transfers = await prisma.transfer.findMany({
    where: {AND:[where, ...(id ? [{id}] : [])]},
    include: {
      fromBranch: { select: { name: true } },
      toBranch: { select: { name: true } },
      items: {
        include: { drug: { select: { tradeName: true, barcode: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 201,
    skip: (page-1)*200,
  });
  return NextResponse.json({ transfers: transfers.slice(0,200), page, hasMore:transfers.length>200 });
}
export async function POST(req: NextRequest) {
  const ctx = await transferAccess();
  if (ctx instanceof NextResponse) return ctx;
  try {
    const body = await req.json();
    const fromBranchId = body.fromBranchId || ctx.user.branchId;
    if (
      typeof fromBranchId !== "string" ||
      !fromBranchId ||
      typeof body.toBranchId !== "string" ||
      !body.toBranchId
    )
      throw new Error("حدد فرعي الإرسال والاستلام");
    const source = await prisma.branch.findFirst({
      where: { AND: [ctx.branchModelWhere, { id: fromBranchId }] },
    });
    if (!source) throw new Error("فرع الإرسال خارج نطاقك");
    const target = await prisma.branch.findFirst({
      where: { id: body.toBranchId, organizationId: source.organizationId },
    });
    if (!target || target.id === source.id)
      throw new Error("اختر فرعاً آخر داخل المؤسسة");
    if (
      !Array.isArray(body.items) ||
      !body.items.length ||
      body.items.length > 500
    )
      throw new Error("أصناف غير صالحة");
    const transfer = await prisma.$transaction(
      (tx) =>
        mobileOperation(tx, ctx.user.id, "transfer", body, async () => {
          const lines = [];
          const seen = new Set<string>();
          for (const input of body.items) {
            if (
              !input ||
              !(
                (typeof input.batchId === "string" && input.batchId) ||
                (typeof input.batchNumber === "string" &&
                  input.batchNumber &&
                  typeof input.drugId === "string" &&
                  input.drugId)
              )
            )
              throw new Error("حدد الدواء والدفعة الأصلية");
            if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0)
              throw new Error("الكمية يجب أن تكون عدداً صحيحاً موجباً");
            const candidates = await tx.batch.findMany({
              where: {
                ...(input.batchId
                  ? { id: input.batchId }
                  : { batchNumber: input.batchNumber }),
                inventory: {
                  branchId: source.id,
                  ...(input.drugId ? { drugId: input.drugId } : {}),
                },
              },
              include: { inventory: true },
              take: 2,
            });
            if (candidates.length !== 1)
              throw new Error("حدد دفعة أصلية غير ملتبسة");
            const batch = candidates[0];
            if (seen.has(batch.id)) throw new Error("دفعة مكررة");
            seen.add(batch.id);
            if (batch.expiryDate <= new Date())
              throw new Error("لا يمكن تحويل دفعة منتهية");
            lines.push({ batch, quantity: input.quantity });
          }
          for (const line of lines.sort((a, b) =>
            a.batch.id.localeCompare(b.batch.id),
          )) {
            const changed = await tx.batch.updateMany({
              where: { id: line.batch.id, quantity: { gte: line.quantity } },
              data: { quantity: { decrement: line.quantity } },
            });
            if (changed.count !== 1)
              throw new Error("الكمية المتاحة لا تكفي؛ حدّث المخزون");
          }
          const created = await tx.transfer.create({
            data: {
              fromBranchId: source.id,
              toBranchId: target.id,
              status: "IN_TRANSIT",
              notes: typeof body.notes === "string" ? body.notes : null,
              items: {
                create: lines.map(({ batch, quantity }) => ({
                  drugId: batch.inventory.drugId,
                  batchNumber: batch.batchNumber,
                  expiryDate: batch.expiryDate,
                  quantity,
                  costPrice: batch.costPrice,
                })),
              },
            },
            include: { items: true },
          });
          await tx.auditLog.create({
            data: {
              userId: ctx.user.id,
              userName: ctx.user.name || ctx.user.id,
              action: "CREATE",
              entity: "TRANSFER",
              entityId: created.id,
              branchId: source.id,
              details: JSON.stringify({
                source: source.id,
                target: target.id,
                batches: lines.map((l) => ({
                  id: l.batch.id,
                  quantity: l.quantity,
                })),
              }),
            },
          });
          return created;
        }),
      { maxWait: 20000, timeout: 30000 },
    );
    return NextResponse.json({ success: true, transfer });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "تعذر التحويل" },
      { status: 409 },
    );
  }
}
