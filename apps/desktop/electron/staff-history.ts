import { ipcMain } from "electron";
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
          { id: query },
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
  ipcMain.handle("staff:stock-alerts", async () => {
    try {
      const session = await authorize("canViewInventory");
      const until = new Date();
      until.setDate(until.getDate() + 90);
      const batches = await db.batch.findMany({
        where: {
          inventory: { branchId: session.who.branch },
          quantity: { gt: 0 },
          expiryDate: { lte: until },
        },
        include: { inventory: { include: { drug: true } } },
        orderBy: { expiryDate: "asc" },
        take: 100,
      });
      const inventory = await db.inventory.findMany({
        where: { branchId: session.who.branch, drug: { isActive: true } },
        include: {
          drug: true,
          batches: { select: { quantity: true, expiryDate: true } },
        },
      });
      const low = inventory
        .map((i: any) => ({
          ...i,
          available: i.batches
            .filter((b: any) => b.expiryDate > new Date())
            .reduce((n: number, b: any) => n + Math.max(0, b.quantity), 0),
        }))
        .filter((i: any) => i.available <= 0 || i.available < i.minStock)
        .sort((a: any, b: any) => a.available - b.available)
        .slice(0, 100)
        .map((i: any) => ({
          id: i.id,
          name: i.drug.tradeName,
          available: i.available,
          minStock: i.minStock,
        }));
      session.assertCurrent();
      return { success: true, batches, low };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : "تعذر تحميل التنبيهات",
      };
    }
  });
}
