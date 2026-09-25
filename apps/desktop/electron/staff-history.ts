import { ipcMain } from "electron";
import { saleIdPrefix } from "./sale-ref";
export function registerStaffHistory(
  db: any,
  authorize: (permission: string) => Promise<any>,
) {
  ipcMain.handle("staff:sales", async (_event, input: any = {}) => {
    try {
      const session = await authorize("canViewSales");
      const page = Math.max(
        1,
        Math.min(100000, Math.floor(Number(input.page)) || 1),
      );
      const query = String(input.search || "")
        .trim()
        .slice(0, 120)
        .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
      const where: any = { user: { branchId: session.who.branch } };
      if (query)
        where.OR = [
          { invoiceNumber: { contains: query } },
          { printedReference: query },
          { id: query },
          // Local reference printed before sync (every matching sale is listed).
          ...(saleIdPrefix(query) ? [{ id: { startsWith: saleIdPrefix(query)! } }] : []),
          { patient: { name: { contains: query } } },
          { patient: { phone: { contains: query } } },
        ];
      if (input.from || input.to) {
        where.createdAt = {};
        for (const [field, value] of [
          ["gte", input.from],
          ["lte", input.to],
        ])
          if (value) {
            const date = new Date(String(value));
            if (!Number.isFinite(date.getTime()))
              throw Error("التاريخ غير صالح");
            where.createdAt[field] = date;
          }
        if (
          where.createdAt.gte &&
          where.createdAt.lte &&
          where.createdAt.gte > where.createdAt.lte
        )
          throw Error("بداية الفترة بعد نهايتها");
      }
      const [sales, total, summary] = await db.$transaction([
        db.sale.findMany({
          where,
          include: {
            items: { include: { drug: true } },
            patient: true,
            payment: true,
            returns: { include: { items: true } },
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: (page - 1) * 30,
          take: 30,
        }),
        db.sale.count({ where }),
        db.sale.aggregate({ where, _sum: { total: true } }),
      ]);
      const failures = await db.syncFailure.findMany({
        where: {
          entityType: "SALE",
          entityId: { in: sales.map((sale: any) => sale.id) },
        },
        select: { entityId: true },
      });
      const failed = new Set(failures.map((f: any) => f.entityId));
      session.assertCurrent();
      return {
        success: true,
        sales: sales.map((sale: any) => ({
          ...sale,
          syncFailed: failed.has(sale.id),
        })),
        total,
        amount: summary._sum.total || 0,
        page,
        canReturn: !!session.access.permissions.canProcessReturn,
      };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : "تعذر تحميل الفواتير",
      };
    }
  });
}
