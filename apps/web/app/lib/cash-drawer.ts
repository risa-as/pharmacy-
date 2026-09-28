import { prisma } from "@/app/lib/prisma";
import { requireActionTenant } from "@/app/lib/action-tenant";

export async function getCashDrawerLedger(
  branchId?: string,
  requestedPage = 1,
) {
  const ctx = await requireActionTenant("canViewExpenses", "read");
  const branches = await prisma.branch.findMany({
    where: ctx.branchModelWhere,
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const selected = branchId
    ? branches.find((b) => b.id === branchId)
    : branches[0];
  if (branchId && !selected) throw new Error("الفرع خارج نطاق حسابك");
  if (!selected) return { branches, selected: null, state: "empty" as const };
  const drawers = await prisma.safe.findMany({
    where: {
      AND: [
        ctx.tenantBranchWhere,
        { branchId: selected.id, type: "CASH_DRAWER" },
      ],
    },
    select: { id: true, name: true, balance: true },
    take: 2,
  });
  if (drawers.length !== 1)
    return {
      branches,
      selected,
      state: drawers.length ? ("ambiguous" as const) : ("empty" as const),
    };
  const safe = drawers[0];
  const where = { safeId: safe.id, safe: ctx.tenantBranchWhere };
  // Keep the balance, totals and page on the same database snapshot.
  const result = await prisma.$transaction(
    async (tx) => {
      const current = await tx.safe.findFirstOrThrow({
        where: { id: safe.id, AND: [ctx.tenantBranchWhere] },
        select: { id: true, name: true, balance: true },
      });
      const count = await tx.transaction.count({ where });
      const pages = Math.max(1, Math.ceil(count / 50));
      const page = Math.min(
        pages,
        Math.max(1, Number.isSafeInteger(requestedPage) ? requestedPage : 1),
      );
      const [rows, totals, unlinked] = await Promise.all([
        tx.transaction.findMany({
          where,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: (page - 1) * 50,
          take: 50,
          select: {
            id: true,
            type: true,
            amount: true,
            referenceType: true,
            referenceId: true,
            description: true,
            createdAt: true,
          },
        }),
        tx.transaction.groupBy({ by: ["type"], where, _sum: { amount: true } }),
        tx.transaction.count({
          where: {
            ...where,
            referenceType: { in: ["SALE", "SALE_RETURN"] },
            OR: [{ referenceId: null }, { referenceId: "" }],
          },
        }),
      ]);
      return {
        safe: current,
        rows,
        count,
        page,
        pages,
        unlinked,
        incoming: totals.find((t) => t.type === "IN")?._sum.amount ?? 0,
        outgoing: totals.find((t) => t.type === "OUT")?._sum.amount ?? 0,
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
  return { branches, selected, state: "ready" as const, ...result };
}
