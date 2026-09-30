import { currentMonthPeriod } from "./month-reorder";
import { prisma } from "@/app/lib/prisma";
import type { TenantContext } from "@/app/lib/tenant-utils";
import {
  analysisPeriod,
  baghdadDate,
  dateStart,
  DAY,
  type PlanningRow,
  type IncomingLot,
} from "./smart-purchasing";

/** Read-only scoped snapshot. Receipt-linked purchases suppress duplicate incoming orders. */
export async function getPlanningData(
  ctx: TenantContext,
  branchId?: string,
  from?: string,
  to?: string,
  /** Batch cost per lot (same index as row.lots), for the waste card only. Never put in rows. */
  opts: { lotCosts?: boolean; currentMonth?: boolean; now?: Date } = {},
) {
  if (
    !ctx.userPermissions.canViewInventory ||
    (!ctx.userPermissions.canViewSales &&
      !ctx.userPermissions.canCreatePurchase && !ctx.userPermissions.canCreateWarehouseOrder)
  )
    throw new Error("ليس لديك صلاحية تحليل المخزون والمبيعات");
  const now = opts.now ?? new Date(),
    period = opts.currentMonth ? currentMonthPeriod(now) : analysisPeriod(from, to, now),
    today = baghdadDate(now);
  if (
    branchId &&
    !(await prisma.branch.findFirst({
      where: { AND: [ctx.branchModelWhere, { id: branchId }] },
      select: { id: true },
    }))
  )
    throw new Error("الفرع خارج نطاق صلاحياتك");
  const scope = {
    AND: [ctx.tenantBranchWhere, ...(branchId ? [{ branchId }] : [])],
  };
  const [inventories, orders] = await Promise.all([
    prisma.inventory.findMany({
      where: scope,
      select: {
        id: true, branchId: true, drugId: true, createdAt: true,
        minStock: true, maxStock: true, cost: true,
        drug: { select: { tradeName: true, scientificName: true, barcode: true, unitsPerPack: true, unitsPerPackConfirmedAt: true } },
        branch: { select: { name: true } },
        batches: {
          where: { quantity: { gt: 0 } },
          // Fixed order so a lot keeps its index (row.lots[i] ↔ lotCosts[id][i]).
          orderBy: [{ expiryDate: "asc" }, { id: "asc" }],
          select: { quantity: true, expiryDate: true, costPrice: true },
        },
      },
    }),
    prisma.warehouseOrder.findMany({
      where: {
        AND: [
          scope,
          {
            status: {
              in: [
                "SENT",
                "UNDER_REVIEW",
                "QUOTED",
                "APPROVED",
                "SHIPPED",
                "DELIVERED",
              ],
            },
          },
        ],
      },
      select: {
        id: true, branchId: true, orderNumber: true, expectedDate: true, status: true,
        items: { select: {
          drugId: true, status: true, unitsPerPack: true, quotedQuantity: true,
          quantity: true, bonusQuantity: true, expiryDate: true,
          drug: { select: { barcode: true, tradeName: true, scientificName: true } },
        } },
      },
    }),
  ]);
  // Aggregate in PostgreSQL instead of materializing every sale line and its
  // parent in Node. Only inventory branches already authorized by scope are read;
  // each query retains the tenant intersection as defense in depth.
  const key = (branch: string, drug: string) => branch + ":" + drug;
  const sold = new Map<string, number>(), returned = new Map<string, number>();
  const branchIds = Array.from(new Set(inventories.map(i => i.branchId)));
  const readSales = async () => {
    // Two branches/four queries at a time, bounded regardless of tenant size.
    for (let i = 0; i < branchIds.length; i += 2) {
      await Promise.all(branchIds.slice(i, i + 2).map(async id => {
        const [sales, returns] = await Promise.all([
          prisma.saleItem.groupBy({ by: ['drugId'],
            where: { sale: { AND: [scope, { branchId: id, createdAt: { gte: period.start, lt: period.end } }] } },
            _sum: { quantity: true } }),
          prisma.saleReturnItem.groupBy({ by: ['drugId'],
            where: { saleReturn: { AND: [scope, { branchId: id, createdAt: { lte: now }, sale: { createdAt: { gte: period.start, lt: period.end } } }] } },
            _sum: { quantity: true } }),
        ]);
        for (const s of sales) sold.set(key(id, s.drugId), s._sum.quantity ?? 0);
        for (const r of returns) returned.set(key(id, r.drugId), r._sum.quantity ?? 0);
      }));
    }
  };
  const [purchases] = await Promise.all([prisma.purchase.findMany({
    where: {
      AND: [
        scope,
        {
          OR: [
            { status: "PENDING", warehouseOrderId: null },
            { warehouseOrderId: { in: orders.map((o) => o.id) } },
          ],
        },
      ],
    },
    select: {
      warehouseOrderId: true,
      status: true,
      branchId: true,
      invoiceNumber: true,
      items: { select: { drugId: true, quantity: true } },
    },
  }), readSales()]);
  const purchaseByOrder = new Map(
    purchases
      .filter((p) => p.warehouseOrderId)
      .map((p) => [p.warehouseOrderId!, p]),
  );
  const incoming = new Map<string, IncomingLot[]>();
  const warnings = new Map<string, string[]>();
  const add = (k: string, lot: IncomingLot) =>
    incoming.set(k, [...(incoming.get(k) || []), lot]);
  for (const p of purchases)
    if (!p.warehouseOrderId && p.status === "PENDING")
      for (const line of p.items)
        add(key(p.branchId, line.drugId), {
          quantity: line.quantity,
          date: null,
          confirmed: false,
          reference: p.invoiceNumber || "شراء داخلي معلق",
        });
  // Index once: matching each incoming line must not rescan every branch's inventory.
  const byDrug = new Map(inventories.map(i => [key(i.branchId, i.drugId), i]));
  const byBarcode = new Map<string, typeof inventories>();
  for (const inv of inventories) {
    const k = JSON.stringify([inv.branchId, inv.drug.barcode]);
    const matches = byBarcode.get(k);
    if (matches) matches.push(inv); else byBarcode.set(k, [inv]);
  }
  const norm = (v: string | null) => (v || "").trim().toLowerCase().replace(/\s+/g, " ");
  for (const order of orders) {
    const purchase = purchaseByOrder.get(order.id);
    if (purchase && ["COMPLETED", "RECEIVED"].includes(purchase.status))
      continue;
    const date = order.expectedDate ? baghdadDate(order.expectedDate) : null;
    for (const line of order.items) {
      if (line.status === "OUT_OF_STOCK") continue;
      // Orders may point at the shared catalogue while inventory retains a private id.
      const direct = byDrug.get(key(order.branchId, line.drugId));
      const barcodeMatches = byBarcode.get(JSON.stringify([order.branchId, line.drug.barcode])) ?? [];
      const candidates = direct ? [direct] : barcodeMatches.filter(i =>
        norm(i.drug.tradeName) === norm(line.drug.tradeName) &&
        norm(i.drug.scientificName) === norm(line.drug.scientificName));
      if (candidates.length !== 1) {
        for (const inv of barcodeMatches) {
          const unresolved = key(inv.branchId, inv.drugId);
          warnings.set(unresolved, [
            ...(warnings.get(unresolved) || []),
            "طلب مفتوح بهوية غير محسومة؛ راجعه قبل تكرار الشراء",
          ]);
          add(unresolved, {
            quantity: 0,
            date: null,
            confirmed: false,
            reference: order.orderNumber || order.id,
          });
        }
        continue;
      }
      const k = key(order.branchId, candidates[0].drugId);
      if (!line.unitsPerPack) {
        warnings.set(k, [
          ...(warnings.get(k) || []),
          "طلب مفتوح بتعبئة غير موثقة؛ راجع كميته قبل إعادة الطلب",
        ]);
        add(k, {
          quantity: 0,
          date: null,
          confirmed: false,
          reference: order.orderNumber || order.id,
        });
        continue;
      }
      const quantity =
        ((line.status === "PARTIAL"
          ? (line.quotedQuantity ?? 0)
          : line.quantity) +
          line.bonusQuantity) *
        line.unitsPerPack;
      add(k, {
        quantity,
        date: date && date >= today ? date : null,
        expiryDate: line.expiryDate ? baghdadDate(line.expiryDate) : null,
        confirmed:
          ["APPROVED", "SHIPPED", "DELIVERED"].includes(order.status) &&
          !!date &&
          date >= today,
        reference: order.orderNumber || order.id,
      });
    }
  }
  const rows: PlanningRow[] = inventories.map((inv) => {
    const k = key(inv.branchId, inv.drugId);
    const createdDay = dateStart(baghdadDate(inv.createdAt)).getTime();
    const observedDays = opts.currentMonth
      ? Math.max(1, Math.round((dateStart(today).getTime() - Math.max(period.start.getTime(), createdDay)) / DAY) + 1)
      : Math.max(
      0,
      Math.round(
        (period.end.getTime() - Math.max(period.start.getTime(), createdDay)) /
          DAY,
      ),
    );
    const qualityReasons = [...(warnings.get(k) || [])];
    if (observedDays < period.days)
      qualityReasons.push("تاريخ المخزون أقصر من الفترة المحددة");
    if (!(sold.get(k) || 0))
      qualityReasons.push(
        "لا توجد مبيعات في الفترة؛ أيام التوفر التاريخية غير موثقة",
      );
    if ((incoming.get(k) || []).some((l) => !l.confirmed))
      qualityReasons.push("طلب مفتوح غير مؤكد الوصول لا يخصم من الاحتياج");
    return {
      inventoryId: inv.id,
      drugId: inv.drugId,
      drugName: inv.drug.tradeName,
      scientificName: inv.drug.scientificName || "",
      barcode: inv.drug.barcode || "",
      branchId: inv.branchId,
      branchName: inv.branch.name,
      minStock: inv.minStock,
      maxStock: inv.maxStock,
      cost: inv.cost > 0 ? inv.cost : null,
      unitsPerPack:
        inv.drug.unitsPerPackConfirmedAt &&
        inv.drug.unitsPerPack &&
        inv.drug.unitsPerPack > 0
          ? inv.drug.unitsPerPack
          : null,
      sold: sold.get(k) || 0,
      returned: Math.min(sold.get(k) || 0, returned.get(k) || 0),
      observedDays,
      lots: inv.batches.map((b) => ({
        quantity: b.quantity,
        expiryDate: baghdadDate(b.expiryDate),
      })),
      incoming: incoming.get(k) || [],
      qualityReasons,
    };
  });
  const lotCosts = opts.lotCosts
    ? Object.fromEntries(
        inventories.map((inv) => [inv.id, inv.batches.map((b) => b.costPrice)]),
      )
    : undefined;
  return {
    rows,
    // undefined unless requested (omitted from JSON responses).
    lotCosts,
    from: period.from,
    to: period.to,
    days: period.days,
    today,
    generatedAt: now.toISOString(),
    notice:
      "النتائج تعتمد على المبيعات المسجلة حتى وقت التحديث. لا يتوفر سجل موثوق لأيام النفاد أو تأكيد اكتمال مزامنة جميع الأجهزة؛ راجع الأصناف قليلة الحركة.",
  };
}
