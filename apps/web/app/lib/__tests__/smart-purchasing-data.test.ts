import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({
  branch: { findFirst: vi.fn() },
  inventory: { findMany: vi.fn() },
  saleItem: { findMany: vi.fn() },
  saleReturnItem: { findMany: vi.fn() },
  purchase: { findMany: vi.fn() },
  warehouseOrder: { findMany: vi.fn() },
}));
vi.mock("@/app/lib/prisma", () => ({ prisma: db }));
import { getPlanningData } from "../smart-purchasing-data";
import type { TenantContext } from "../tenant-utils";
const ctx = {
  tenantBranchWhere: { branch: { organizationId: "org" } },
  branchModelWhere: { organizationId: "org" },
  userPermissions: { canViewInventory: true, canViewSales: true },
} as unknown as TenantContext;
const drug = {
  id: "d",
  tradeName: "D",
  scientificName: "S",
  barcode: "123",
  unitsPerPack: 4,
  unitsPerPackConfirmedAt: new Date(),
  organizationId: "org",
};
const inventory = {
  id: "i",
  drugId: "d",
  branchId: "b",
  createdAt: new Date("2020-01-01"),
  drug,
  branch: { name: "B" },
  minStock: 0,
  maxStock: 1000,
  cost: 2,
  batches: [],
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-21T10:00:00Z"));
  vi.clearAllMocks();
  db.branch.findFirst.mockResolvedValue({ id: "b" });
  db.inventory.findMany.mockResolvedValue([inventory]);
  db.saleItem.findMany.mockResolvedValue([]);
  db.saleReturnItem.findMany.mockResolvedValue([]);
  db.purchase.findMany.mockResolvedValue([]);
  db.warehouseOrder.findMany.mockResolvedValue([]);
});
describe("scoped planning snapshot", () => {
  it("denies inaccessible branches before queries", async () => {
    db.branch.findFirst.mockResolvedValue(null);
    await expect(getPlanningData(ctx, "foreign")).rejects.toThrow();
    expect(db.inventory.findMany).not.toHaveBeenCalled();
  });
  it("requires read permissions", async () => {
    await expect(
      getPlanningData(
        {
          ...ctx,
          userPermissions: { ...ctx.userPermissions, canViewInventory: false },
        },
        "b",
      ),
    ).rejects.toThrow();
    expect(db.inventory.findMany).not.toHaveBeenCalled();
  });
  it("scopes inventory, sales and cohort returns with an intersection", async () => {
    await getPlanningData(ctx, "b");
    const scope = { AND: [ctx.tenantBranchWhere, { branchId: "b" }] };
    expect(db.inventory.findMany.mock.calls[0][0].where).toEqual(scope);
    expect(db.saleItem.findMany.mock.calls[0][0].where.sale.AND[0]).toEqual(
      scope,
    );
    expect(
      db.saleReturnItem.findMany.mock.calls[0][0].where.saleReturn.AND[0],
    ).toEqual(scope);
  });
  it("keeps branches separate and subtracts linked returns", async () => {
    db.saleItem.findMany.mockResolvedValue([
      { drugId: "d", quantity: 60, sale: { branchId: "b" } },
      { drugId: "d", quantity: 900, sale: { branchId: "other" } },
    ]);
    db.saleReturnItem.findMany.mockResolvedValue([
      { drugId: "d", quantity: 2, saleReturn: { branchId: "b" } },
    ]);
    const d = await getPlanningData(ctx, "b");
    expect(d.rows[0].sold).toBe(60);
    expect(d.rows[0].returned).toBe(2);
  });
  it("does not count both approved order and its purchase", async () => {
    db.purchase.findMany.mockResolvedValue([
      {
        warehouseOrderId: "w",
        status: "PENDING",
        items: [{ drugId: "d", quantity: 20 }],
      },
    ]);
    db.warehouseOrder.findMany.mockResolvedValue([
      {
        id: "w",
        branchId: "b",
        orderNumber: "WAI-1",
        expectedDate: new Date("2026-09-22"),
        status: "APPROVED",
        items: [
          {
            drugId: "d",
            drug,
            quantity: 4,
            bonusQuantity: 1,
            unitsPerPack: 4,
            status: "AVAILABLE",
          },
        ],
      },
    ]);
    const d = await getPlanningData(ctx, "b");
    expect(d.rows[0].incoming).toHaveLength(1);
    expect(d.rows[0].incoming[0].quantity).toBe(20);
  });
  it("removes incoming once received", async () => {
    db.purchase.findMany.mockResolvedValue([
      { warehouseOrderId: "w", status: "COMPLETED", items: [] },
    ]);
    db.warehouseOrder.findMany.mockResolvedValue([{ id: "w", items: [{}] }]);
    expect((await getPlanningData(ctx, "b")).rows[0].incoming).toEqual([]);
  });
  it("matches shared catalogue identity conservatively", async () => {
    db.warehouseOrder.findMany.mockResolvedValue([
      {
        id: "w",
        branchId: "b",
        expectedDate: new Date("2026-09-22"),
        status: "APPROVED",
        items: [
          {
            drugId: "global",
            drug: { ...drug, id: "global" },
            quantity: 4,
            bonusQuantity: 0,
            unitsPerPack: 4,
            status: "AVAILABLE",
          },
        ],
      },
    ]);
    expect((await getPlanningData(ctx, "b")).rows[0].incoming[0].quantity).toBe(
      16,
    );
  });
  it("retains unknown-pack order as review rather than guessing", async () => {
    db.warehouseOrder.findMany.mockResolvedValue([
      {
        id: "w",
        branchId: "b",
        expectedDate: null,
        status: "SENT",
        items: [
          {
            drugId: "d",
            drug,
            quantity: 4,
            bonusQuantity: 0,
            unitsPerPack: null,
            status: "REQUESTED",
          },
        ],
      },
    ]);
    const d = await getPlanningData(ctx, "b");
    expect(d.rows[0].incoming[0].confirmed).toBe(false);
    expect(d.rows[0].incoming[0].quantity).toBe(0);
    expect(d.rows[0].qualityReasons.length).toBeGreaterThan(0);
  });
});
