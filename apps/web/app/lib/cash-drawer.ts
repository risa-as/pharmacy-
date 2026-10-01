import { prisma } from "@/app/lib/prisma";
import { requireActionTenant } from "@/app/lib/action-tenant";

/** Operation kinds a ledger row can carry; also the only values the kind filter accepts. */
export const CASH_KINDS = [
  "SALE",
  "SALE_RETURN",
  "EXPENSE",
  "CUSTOMER_RECEIPT",
  "SUPPLIER_PAYMENT",
  "SHIFT_CASH_DROP",
  "VOUCHER",
  "TRANSFER",
] as const;

export type CashLedgerFilter = { direction?: "IN" | "OUT"; kind?: string };

/** Drops anything that is not a known direction or kind (values come from the URL). */
export function cleanCashFilter(raw: {
  direction?: unknown;
  kind?: unknown;
}): CashLedgerFilter {
  const direction =
    raw.direction === "IN" || raw.direction === "OUT" ? raw.direction : undefined;
  const kind = (CASH_KINDS as readonly unknown[]).includes(raw.kind)
    ? (raw.kind as string)
    : undefined;
  return { direction, kind };
}

/** Start of today in Baghdad (UTC+3, no daylight saving). */
function baghdadDayStart(now = new Date()) {
  const offset = 3 * 60 * 60 * 1000;
  const local = new Date(now.getTime() + offset);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) -
      offset,
  );
}

export async function getCashDrawerLedger(
  branchId?: string,
  requestedPage = 1,
  filter: CashLedgerFilter = {},
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
  // The filter narrows the listed rows only; balance and totals stay for the whole drawer.
  const rowsWhere = {
    ...where,
    ...(filter.direction ? { type: filter.direction } : {}),
    ...(filter.kind ? { referenceType: filter.kind } : {}),
  };
  // Keep the balance, totals and page on the same database snapshot.
  const result = await prisma.$transaction(
    async (tx) => {
      const current = await tx.safe.findFirstOrThrow({
        where: { id: safe.id, AND: [ctx.tenantBranchWhere] },
        select: { id: true, name: true, balance: true },
      });
      const count = await tx.transaction.count({ where: rowsWhere });
      const pages = Math.max(1, Math.ceil(count / 50));
      const page = Math.min(
        pages,
        Math.max(1, Number.isSafeInteger(requestedPage) ? requestedPage : 1),
      );
      const [rows, totals, unlinked, today, last] = await Promise.all([
        tx.transaction.findMany({
          where: rowsWhere,
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
        tx.transaction.groupBy({
          by: ["type", "referenceType"],
          where,
          _sum: { amount: true },
          _count: true,
        }),
        tx.transaction.count({
          where: {
            ...where,
            referenceType: { in: ["SALE", "SALE_RETURN"] },
            OR: [{ referenceId: null }, { referenceId: "" }],
          },
        }),
        tx.transaction.groupBy({
          by: ["type"],
          where: { ...where, createdAt: { gte: baghdadDayStart() } },
          _sum: { amount: true },
          _count: true,
        }),
        tx.transaction.findFirst({
          where,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: { createdAt: true },
        }),
      ]);
      const sum = (list: { type: string; _sum: { amount: number | null } }[], type: string) =>
        list.filter((t) => t.type === type).reduce((n, t) => n + (t._sum.amount ?? 0), 0);
      const todayCount = (type: string) =>
        today.filter((t) => t.type === type).reduce((n, t) => n + (Number(t._count) || 0), 0);
      // Per operation kind, both directions, largest movement first.
      const kindMap = new Map<string, { kind: string; incoming: number; outgoing: number; count: number }>();
      for (const t of totals) {
        const kind = t.referenceType ?? "OTHER";
        const row = kindMap.get(kind) ?? { kind, incoming: 0, outgoing: 0, count: 0 };
        if (t.type === "IN") row.incoming += t._sum.amount ?? 0;
        if (t.type === "OUT") row.outgoing += t._sum.amount ?? 0;
        row.count += Number(t._count) || 0;
        kindMap.set(kind, row);
      }
      const byKind = Array.from(kindMap.values()).sort(
        (a, b) => b.incoming + b.outgoing - (a.incoming + a.outgoing),
      );
      return {
        safe: current,
        rows,
        count,
        page,
        pages,
        unlinked,
        incoming: sum(totals, "IN"),
        outgoing: sum(totals, "OUT"),
        today: {
          incoming: sum(today, "IN"),
          outgoing: sum(today, "OUT"),
          inCount: todayCount("IN"),
          outCount: todayCount("OUT"),
        },
        byKind,
        lastMovementAt: last?.createdAt ?? null,
        filter,
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
  return { branches, selected, state: "ready" as const, ...result };
}
